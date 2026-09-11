import { NextRequest, NextResponse } from 'next/server';
import { getBusinessFromHeaders, getSubdomainFromHeaders } from '@/lib/tenant';
import { isFeatureEnabled } from '@/lib/features';
import { getServiceSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryBizId = searchParams.get('businessId');

    let subdomain = await getSubdomainFromHeaders();
    let business = await getBusinessFromHeaders();

    if (!business) {
      const adminClient = getServiceSupabase();
      let query = adminClient
        .from('businesses')
        .select('id, name, subdomain, is_active')
        .eq('is_active', true);

      if (queryBizId) {
        query = query.eq('id', queryBizId);
      }

      const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) {
        business = data as any;
        subdomain = data.subdomain;
      }
    }

    const isSelfSignupEnabled = business
      ? await isFeatureEnabled(business.id, 'customer_self_signup')
      : true;

    return NextResponse.json({
      success: true,
      subdomain,
      business: business
        ? {
            id: business.id,
            name: business.name,
            subdomain: business.subdomain,
            is_active: business.is_active,
          }
        : null,
      isSelfSignupEnabled,
    });
  } catch (error: any) {
    console.error('API /api/tenant error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
