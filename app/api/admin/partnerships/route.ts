import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedTenant } from '@/lib/tenant-guard';
import { getServiceSupabase } from '@/lib/supabase';
import { assertFeatureEnabled } from '@/lib/features';

/**
 * GET /api/admin/partnerships
 * Returns all partnerships for the current user's business.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['super_admin', 'owner', 'branch_admin'],
  });
  if (!guard.success) return guard.response;

  const { businessId, role } = guard.context;

  if (businessId) {
    const featErr = await assertFeatureEnabled(businessId, 'branch_partnerships');
    if (featErr) return featErr;
  }

  try {
    const adminClient = getServiceSupabase();

    let query = adminClient
      .from('partnerships')
      .select(`
        id, status, terms, initiated_by, created_at, updated_at,
        business_id_a, business_id_b,
        biz_a:businesses!partnerships_business_id_a_fkey(id, name, subdomain),
        biz_b:businesses!partnerships_business_id_b_fkey(id, name, subdomain)
      `)
      .order('created_at', { ascending: false });

    // Non-super-admins only see their own business partnerships
    if (role !== 'super_admin' && businessId) {
      query = query.or(`business_id_a.eq.${businessId},business_id_b.eq.${businessId}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Enrich with partner info and direction
    const enriched = (data || []).map((p: any) => {
      const isInitiator = p.initiated_by === businessId;
      const partner = p.business_id_a === businessId ? p.biz_b : p.biz_a;
      return {
        id: p.id,
        status: p.status,
        terms: p.terms,
        initiated_by: p.initiated_by,
        is_initiator: isInitiator,
        partner_name: partner?.name || 'Unknown',
        partner_subdomain: partner?.subdomain || '',
        partner_business_id: partner?.id || '',
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    return NextResponse.json({ success: true, partnerships: enriched });
  } catch (err: any) {
    console.error('GET /api/admin/partnerships error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/partnerships
 * Send a new partnership request. Requires target_subdomain and optional terms.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAuthenticatedTenant(request, {
    allowedRoles: ['owner'],
  });
  if (!guard.success) return guard.response;

  const { businessId } = guard.context;

  if (!businessId) {
    return NextResponse.json(
      { success: false, error: 'No business assigned to this user' },
      { status: 400 }
    );
  }

  const featErr = await assertFeatureEnabled(businessId, 'branch_partnerships');
  if (featErr) return featErr;

  try {
    const body = await request.json();
    const { target_subdomain, terms } = body;

    if (!target_subdomain?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: target_subdomain' },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabase();

    // Find target business by subdomain
    const { data: targetBiz, error: targetErr } = await adminClient
      .from('businesses')
      .select('id, name, subdomain, is_active')
      .eq('subdomain', target_subdomain.trim().toLowerCase())
      .maybeSingle();

    if (targetErr || !targetBiz) {
      return NextResponse.json(
        { success: false, error: `No business found with subdomain "${target_subdomain}"` },
        { status: 404 }
      );
    }

    if (!targetBiz.is_active) {
      return NextResponse.json(
        { success: false, error: 'Target business is currently inactive' },
        { status: 400 }
      );
    }

    if (targetBiz.id === businessId) {
      return NextResponse.json(
        { success: false, error: 'Cannot create a partnership with yourself' },
        { status: 400 }
      );
    }

    // Ensure ordered IDs (business_id_a < business_id_b) for the constraint
    const [bizA, bizB] = businessId < targetBiz.id
      ? [businessId, targetBiz.id]
      : [targetBiz.id, businessId];

    // Check if partnership already exists
    const { data: existing } = await adminClient
      .from('partnerships')
      .select('id, status')
      .eq('business_id_a', bizA)
      .eq('business_id_b', bizB)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: `A partnership already exists with status: ${existing.status}` },
        { status: 409 }
      );
    }

    // Create partnership
    const { data: partnership, error: createErr } = await adminClient
      .from('partnerships')
      .insert({
        business_id_a: bizA,
        business_id_b: bizB,
        status: 'pending',
        terms: terms?.trim() || null,
        initiated_by: businessId,
      })
      .select()
      .single();

    if (createErr) throw createErr;

    return NextResponse.json({
      success: true,
      partnership: {
        ...partnership,
        partner_name: targetBiz.name,
        partner_subdomain: targetBiz.subdomain,
      },
    });
  } catch (err: any) {
    console.error('POST /api/admin/partnerships error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
