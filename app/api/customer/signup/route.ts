import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isFeatureEnabled } from '@/lib/features';
import { createCustomer, checkCustomerPhoneExists } from '@/lib/customer';
import { getServiceSupabase } from '@/lib/supabase';
import {
  validateName,
  validateEgyptianPhone,
  validatePassword,
  validatePin,
} from '@/lib/validation';

/**
 * Phase 36: Phone-Only Customer Signup
 *
 * Auth model:
 *   - Customers authenticate exclusively via their phone number.
 *   - A "phantom email" (phone@pointat.internal) is used as the Supabase Auth
 *     identifier so we can store a password without enabling real email flows.
 *   - Email is NEVER accepted from the client for customer auth.
 *   - Password is MANDATORY.
 *
 * Flow:
 *   1. Validate name, phone, password (and optional accessPin).
 *   2. Check feature flag and consent.
 *   3. Check if phone already exists in this business.
 *   4. Try to create/find the phantom Supabase Auth user.
 *   5. Create the customer record.
 *   6. Link auth user → customer in customer_auth_links.
 *   7. Return customer data.
 */

const PHANTOM_DOMAIN = 'pointat.internal';

export async function POST(request: NextRequest) {
  try {
    // 21.6: IP Rate Limiting (10 signup attempts per minute)
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`signup:${clientIp}`, 10, 60 * 1000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many signup attempts. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = await request.json();
    let {
      businessId,
      subdomain,
      name,
      phoneNumber,
      password,
      accessPin,
      consentGiven,
      referralCode,
    } = body;

    const isExplicitBusiness = Boolean(businessId || subdomain);
    const adminClient = getServiceSupabase();

    // ── Business Resolution ────────────────────────────────────────────────
    if (!businessId && subdomain) {
      const { data: biz } = await adminClient
        .from('businesses')
        .select('id')
        .eq('subdomain', subdomain.trim())
        .maybeSingle();

      if (biz) businessId = biz.id;
    }

    if (!businessId) {
      const { data: defaultBiz } = await adminClient
        .from('businesses')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultBiz) businessId = defaultBiz.id;
    }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing required business identifier' },
        { status: 400 }
      );
    }

    // ── Input Validation ───────────────────────────────────────────────────

    // Name
    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      return NextResponse.json(
        { success: false, error: nameVal.errorMessage, errorKey: nameVal.errorKey },
        { status: 400 }
      );
    }

    // Phone
    const phoneVal = validateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      return NextResponse.json(
        { success: false, error: phoneVal.errorMessage, errorKey: phoneVal.errorKey },
        { status: 400 }
      );
    }

    // Password — MANDATORY for phone-based auth
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'كلمة المرور مطلوبة للتسجيل', errorKey: 'password_required' },
        { status: 400 }
      );
    }

    const passVal = validatePassword(password);
    if (!passVal.isValid) {
      return NextResponse.json(
        { success: false, error: passVal.errorMessage, errorKey: passVal.errorKey },
        { status: 400 }
      );
    }

    // Optional access PIN
    if (accessPin) {
      const pinVal = validatePin(accessPin);
      if (!pinVal.isValid) {
        return NextResponse.json(
          { success: false, error: pinVal.errorMessage, errorKey: pinVal.errorKey },
          { status: 400 }
        );
      }
    }

    // ── Feature Flag ───────────────────────────────────────────────────────
    // 21.5: customer_self_signup must be enabled when signing up under a specific tenant
    if (isExplicitBusiness) {
      const isSignupEnabled = await isFeatureEnabled(businessId, 'customer_self_signup');
      if (!isSignupEnabled) {
        return NextResponse.json(
          {
            success: false,
            code: 'FEATURE_DISABLED',
            error: 'Customer self-signup is not enabled for this business',
          },
          { status: 403 }
        );
      }
    }

    // ── Consent Check ──────────────────────────────────────────────────────
    // 21.1 & 13.3: Mandatory
    if (!consentGiven) {
      return NextResponse.json(
        {
          success: false,
          code: 'CONSENT_REQUIRED',
          error: 'Customer consent is mandatory for registration',
        },
        { status: 400 }
      );
    }

    const cleanPhone = phoneVal.cleanPhone;
    const phantomEmail = `${cleanPhone}@${PHANTOM_DOMAIN}`;
    const cleanPassword = String(password);

    // ── Phone Uniqueness Check (per-business) ──────────────────────────────
    // 21.2: Check if phone number is already registered for this business
    const phoneCheck = await checkCustomerPhoneExists(businessId, cleanPhone);
    if (phoneCheck.exists) {
      // If the phone maps to an existing customer record, we still try to
      // link the phantom Auth user to it (idempotent upsert).
      let linkedAuthUserId: string | null = null;
      try {
        const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const matchedUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === phantomEmail.toLowerCase()
        );
        linkedAuthUserId = matchedUser?.id || null;
      } catch (_) {
        // Non-fatal
      }

      if (linkedAuthUserId && phoneCheck.customerId) {
        try {
          await adminClient
            .from('customer_auth_links')
            .upsert(
              {
                auth_user_id: linkedAuthUserId,
                customer_id: phoneCheck.customerId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'auth_user_id,customer_id' }
            );
        } catch (e) {
          console.warn('customer_auth_links link on existing phone warning:', e);
        }

        return NextResponse.json(
          {
            success: true,
            linkedExisting: true,
            customer: {
              id: phoneCheck.customerId,
              name: name.trim(),
              phoneNumber: cleanPhone,
              qrToken: phoneCheck.qrToken,
            },
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code: 'PHONE_ALREADY_EXISTS',
          error: 'هذا الرقم مسجل بالفعل في هذا المتجر.',
          qrToken: phoneCheck.qrToken,
        },
        { status: 409 }
      );
    }

    // ── Phantom Auth User Creation ─────────────────────────────────────────
    // Create a Supabase Auth user using the phone's phantom email.
    // The email is never exposed to the customer; it's an internal auth key.
    let authUserId: string | null = null;
    let isExistingAuthUser = false;

    const { data: newAuthUser, error: authErr } = await adminClient.auth.admin.createUser({
      email: phantomEmail,
      password: cleanPassword,
      // No email confirmation needed — this is a phantom address
      email_confirm: true,
      user_metadata: {
        phone_number: cleanPhone,
        display_name: name.trim(),
        auth_type: 'phone_phantom',
      },
    });

    if (authErr) {
      const errMsg = authErr.message?.toLowerCase() || '';
      const isAlreadyExists =
        errMsg.includes('already') ||
        errMsg.includes('already registered') ||
        (authErr as any).code === 'email_exists' ||
        (authErr as any).status === 422;

      if (isAlreadyExists) {
        // The phantom user already exists (e.g. concurrent signup or prior attempt).
        // Find them and link normally — treat as idempotent.
        try {
          const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const existingUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === phantomEmail.toLowerCase()
          );
          if (existingUser) {
            authUserId = existingUser.id;
            isExistingAuthUser = true;
          }
        } catch (lookupErr) {
          console.warn('[signup] Phantom user lookup warning:', lookupErr);
        }

        if (!authUserId) {
          // Cannot find or create — surface error
          return NextResponse.json(
            {
              success: false,
              code: 'PHONE_AUTH_CONFLICT',
              error: 'هذا الرقم مسجل بالفعل. يرجى تسجيل الدخول.',
            },
            { status: 409 }
          );
        }
      } else {
        // Unexpected auth error
        console.error('[signup] Supabase auth.admin.createUser error:', authErr);
        return NextResponse.json(
          { success: false, error: authErr.message || 'فشل إنشاء الحساب' },
          { status: 400 }
        );
      }
    } else if (newAuthUser?.user) {
      authUserId = newAuthUser.user.id;
    }

    // ── Create Customer Record ─────────────────────────────────────────────
    // 21.3: Create customer with auto-generated qr_token, referral_code, and consent timestamp
    const newCustomer = await createCustomer({
      businessId,
      name: name.trim(),
      phoneNumber: cleanPhone,
      consentGiven: true,
      referralCode: referralCode?.trim() || undefined,
    });

    // ── Link Auth User → Customer ──────────────────────────────────────────
    // Pre-Phase 27: customer_auth_links is the join table between Supabase Auth
    // users and customer records; it supports multiple business memberships.
    if (authUserId) {
      try {
        let pinHash: string | null = null;
        if (accessPin && typeof accessPin === 'string' && accessPin.length === 4) {
          const crypto = await import('crypto');
          pinHash = crypto.createHash('sha256').update(accessPin.trim()).digest('hex');
        }

        await adminClient
          .from('customer_auth_links')
          .upsert(
            {
              auth_user_id: authUserId,
              customer_id: newCustomer.id,
              access_pin_hash: pinHash,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'auth_user_id,customer_id' }
          );
      } catch (authLinkErr) {
        // Non-blocking — customer record already created; link can be repaired
        console.warn('[signup] customer_auth_links upsert warning:', authLinkErr);
      }
    }

    // ── Success Response ───────────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        // No email verification needed — phone-only auth
        requiresVerification: false,
        phone: cleanPhone,
        customer: {
          id: newCustomer.id,
          name: newCustomer.name,
          phoneNumber: newCustomer.phone_number,
          qrToken: newCustomer.qr_token,
          referralCode: newCustomer.referral_code,
          referredBy: newCustomer.referred_by,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/customer/signup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
