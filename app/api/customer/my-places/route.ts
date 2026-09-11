import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 27.1 & 27.2 — GET /api/customer/my-places
 * Returns all places linked to the authenticated customer.
 * NEVER returns points balance or QR token — only place metadata and PIN status.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = getServiceSupabase();

    // Fetch all customer_auth_links for this auth user, joined with customer and business branding
    const { data: links, error: linksError } = await adminClient
      .from('customer_auth_links')
      .select(`
        id,
        customer_id,
        access_pin_hash,
        failed_pin_attempts,
        locked_until,
        created_at,
        customers!inner(
          id,
          name,
          phone_number,
          qr_token,
          business_id,
          businesses!inner(
            id,
            name,
            subdomain,
            business_branding(logo_url, primary_color, accent_color)
          )
        )
      `)
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true });

    if (linksError) {
      console.error('my-places fetch error:', linksError);
      return NextResponse.json({ success: false, error: 'Failed to load places' }, { status: 500 });
    }

    const now = new Date();

    const places = (links || []).map((link: any) => {
      const biz = link.customers?.businesses;
      const branding = Array.isArray(biz?.business_branding) ? biz.business_branding[0] : biz?.business_branding;
      const isLocked = link.locked_until && new Date(link.locked_until) > now;
      const hasPIN = Boolean(link.access_pin_hash);

      return {
        linkId: link.id,
        customerId: link.customer_id,
        businessId: link.customers?.business_id || biz?.id || '',
        businessName: biz?.name || '',
        subdomain: biz?.subdomain || '',
        logoUrl: branding?.logo_url || null,
        primaryColor: branding?.primary_color || '#6C63FF',
        secondaryColor: branding?.accent_color || '#4ECDC4',
        hasPIN,
        isLocked,
        lockedUntil: isLocked ? link.locked_until : null,
        failedAttempts: link.failed_pin_attempts || 0,
        // 27.2: NO points, NO qr_token until PIN verified
      };
    });

    return NextResponse.json({ success: true, places });
  } catch (err: any) {
    console.error('my-places error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
