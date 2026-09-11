import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { clearTenantCache } from '@/lib/tenant';
import { initializeBusinessFeatures } from '@/lib/features';
import { generateEmailOtp } from '@/lib/otp';
import { sendVerificationOtpEmail } from '@/lib/email';
import { 
  validateName, 
  validateEgyptianPhone, 
  validateEmail, 
  validatePassword 
} from '@/lib/validation';

/**
 * GET /api/super-admin/businesses
 * Returns all businesses with aggregate stats. Super Admin only.
 */
export async function GET(request: NextRequest) {
  // 1. Verify super_admin BEFORE any data access
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  try {
    const adminClient = getServiceSupabase();

    // Fetch all businesses
    const { data: businesses, error: bizError } = await adminClient
      .from('businesses')
      .select('id, name, subdomain, is_active, created_at')
      .order('created_at', { ascending: false });

    if (bizError) throw bizError;

    // Fetch aggregate stats per business
    const enriched = await Promise.all(
      (businesses || []).map(async (biz) => {
        // Customer count
        const { count: customerCount } = await adminClient
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id);

        // Branch count
        const { count: branchCount } = await adminClient
          .from('branches')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id);

        return {
          ...biz,
          customer_count: customerCount || 0,
          branch_count: branchCount || 0,
        };
      })
    );

    return NextResponse.json({ success: true, businesses: enriched });
  } catch (err: any) {
    console.error('GET /api/super-admin/businesses error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/super-admin/businesses
 * Creates a new business with first branch and owner account atomically.
 */
export async function POST(request: NextRequest) {
  // 1. Verify super_admin BEFORE any data access
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  try {
    const body = await request.json();
    const { name, subdomain, ownerEmail, ownerPassword, ownerPhone, branchName } = body;

    if (!branchName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: branchName' },
        { status: 400 }
      );
    }

    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    const emailVal = validateEmail(ownerEmail);
    if (!emailVal.isValid) {
      return NextResponse.json(
        { success: false, error: emailVal.errorMessage, errorKey: emailVal.errorKey },
        { status: 400 }
      );
    }

    const passVal = validatePassword(ownerPassword);
    if (!passVal.isValid) {
      return NextResponse.json(
        { success: false, error: passVal.errorMessage, errorKey: passVal.errorKey },
        { status: 400 }
      );
    }

    const phoneVal = validateEgyptianPhone(ownerPhone);
    if (!phoneVal.isValid) {
      return NextResponse.json(
        { success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey },
        { status: 400 }
      );
    }

    // Phase 9.4: Auto-slugify subdomain if not provided manually
    let cleanSubdomain = (subdomain?.trim() || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!cleanSubdomain) {
      cleanSubdomain = nameVal.value
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    if (!cleanSubdomain || cleanSubdomain.length < 2) {
      cleanSubdomain = `biz-${Date.now().toString(36)}`;
    }

    // Validate subdomain format (lowercase, no spaces, alphanumeric + hyphens)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleanSubdomain) && cleanSubdomain.length > 1) {
      return NextResponse.json(
        { success: false, error: 'Subdomain must contain only lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Check subdomain uniqueness
    const { data: existing } = await adminClient
      .from('businesses')
      .select('id')
      .eq('subdomain', cleanSubdomain)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Subdomain "${cleanSubdomain}" is already in use` },
        { status: 409 }
      );
    }

    // Step 1: Create business
    const { data: newBiz, error: bizErr } = await adminClient
      .from('businesses')
      .insert({ name: name.trim(), subdomain: cleanSubdomain, is_active: true })
      .select()
      .single();

    if (bizErr) throw new Error(`Failed to create business: ${bizErr.message}`);

    let createdAuthUserId: string | null = null;

    try {
      // Step 2: Create first branch
      const { data: newBranch, error: branchErr } = await adminClient
        .from('branches')
        .insert({ business_id: newBiz.id, name: branchName.trim() })
        .select()
        .single();

      if (branchErr) throw new Error(`Failed to create branch: ${branchErr.message}`);

      // Step 3: Create owner auth user with phone in metadata (Pre-verified since Super Admin provisioned)
      const { data: ownerAuth, error: ownerErr } = await adminClient.auth.admin.createUser({
        email: emailVal.value,
        password: passVal.value,
        email_confirm: true,
        user_metadata: {
          name: nameVal.value,
          phone: phoneVal.cleanPhone,
          email_verified: true,
        },
      });

      let ownerUserId: string;
      if (ownerErr) {
        if (ownerErr.message.includes('already registered') || ownerErr.message.includes('already exists')) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existing = listData?.users?.find(
            (u) => u.email?.toLowerCase() === emailVal.value.toLowerCase()
          );
          if (!existing) {
            throw new Error(`Failed to create owner account: ${ownerErr.message}`);
          }
          ownerUserId = existing.id;
        } else {
          throw new Error(`Failed to create owner account: ${ownerErr.message}`);
        }
      } else {
        if (!ownerAuth?.user) {
          throw new Error('Failed to create owner account: No user returned');
        }
        ownerUserId = ownerAuth.user.id;
        createdAuthUserId = ownerAuth.user.id;

        // Phase 29: Dispatch verification OTP email to new owner
        try {
          const otpRes = await generateEmailOtp(ownerEmail.trim());
          if (otpRes.success && otpRes.otp) {
            await sendVerificationOtpEmail(ownerEmail.trim(), otpRes.otp, name.trim());
          }
        } catch (otpErr) {
          console.warn('Non-blocking OTP email dispatch error for new business owner:', otpErr);
        }
      }

      // Step 4: Create user_role for owner
      const { error: roleErr } = await adminClient.from('user_roles').insert({
        user_id: ownerUserId,
        business_id: newBiz.id,
        branch_id: newBranch.id,
        role: 'owner',
      });

      if (roleErr) throw new Error(`Failed to assign owner role: ${roleErr.message}`);

      // Step 5: Phase 9.5: Automatically initialize business_branding with default design values
      try {
        await adminClient.from('business_branding').insert({
          business_id: newBiz.id,
          display_name: name.trim(),
          primary_color: '#FAF7F2',
          accent_color: '#B08968',
          font_family: 'Inter',
          layout_variant: 'centered-classic',
        });
      } catch (brandingErr) {
        console.warn('Could not insert initial business_branding (table may be pending migration):', brandingErr);
      }

      // Step 6: Phase 22.3: Automatically initialize business_features for the new business
      await initializeBusinessFeatures(newBiz.id, guard.context.userId);

      return NextResponse.json({
        success: true,
        business: {
          ...newBiz,
          branch: newBranch,
          owner_email: ownerEmail.trim(),
          owner_phone: ownerPhone.trim(),
        },
      });
    } catch (rollbackErr: any) {
      // Comprehensive Rollback:
      // 1. Delete created auth user if created
      if (createdAuthUserId) {
        try {
          await adminClient.auth.admin.deleteUser(createdAuthUserId);
        } catch (cleanupAuthErr) {
          console.error('Rollback: failed to clean up auth user:', cleanupAuthErr);
        }
      }
      // 2. Delete the business (Postgres ON DELETE CASCADE automatically deletes child branches)
      await adminClient.from('businesses').delete().eq('id', newBiz.id);
      throw rollbackErr;
    }
  } catch (err: any) {
    console.error('POST /api/super-admin/businesses error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/super-admin/businesses
 * Toggle is_active status for a business. Immediately clears tenant cache.
 */
export async function PATCH(request: NextRequest) {
  // 1. Verify super_admin BEFORE any data access
  const guard = await requireSuperAdmin(request);
  if (!guard.success) return guard.response;

  try {
    const body = await request.json();
    const { businessId, isActive } = body;

    if (!businessId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: businessId, isActive (boolean)' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Get business subdomain for cache invalidation
    const { data: biz, error: fetchErr } = await adminClient
      .from('businesses')
      .select('subdomain')
      .eq('id', businessId)
      .single();

    if (fetchErr || !biz) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    // Update is_active
    const { data: updated, error: updateErr } = await adminClient
      .from('businesses')
      .update({ is_active: isActive })
      .eq('id', businessId)
      .select('id, name, subdomain, is_active, updated_at')
      .single();

    if (updateErr) throw updateErr;

    // Immediately clear tenant cache for this subdomain
    clearTenantCache(biz.subdomain);

    return NextResponse.json({ success: true, business: updated });
  } catch (err: any) {
    console.error('PATCH /api/super-admin/businesses error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
