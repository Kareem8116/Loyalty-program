import HomeContent from '@/components/HomeContent';
import { getServiceSupabase } from '@/lib/supabase';
import { getBusinessFromHeaders, getSubdomainFromHeaders } from '@/lib/tenant';
import { isFeatureEnabled } from '@/lib/features';

export default async function Home() {
  const adminClient = getServiceSupabase();

  // Phase 8: Resolve tenant from subdomain (if present)
  const subdomain = await getSubdomainFromHeaders();
  let tenantBusiness = await getBusinessFromHeaders();

  if (subdomain && !tenantBusiness) {
    const { data: subBiz } = await adminClient
      .from('businesses')
      .select('id, name, subdomain, is_active')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .maybeSingle();

    if (subBiz) {
      tenantBusiness = subBiz as any;
    }
  }

  // Phase 21: Check if self-signup is enabled for this business
  const isSelfSignupEnabled = tenantBusiness
    ? await isFeatureEnabled(tenantBusiness.id, 'customer_self_signup')
    : true;

  return (
    <HomeContent
      isSelfSignupEnabled={isSelfSignupEnabled}
      tenantBusiness={tenantBusiness ? {
        id: tenantBusiness.id,
        name: tenantBusiness.name,
        subdomain: tenantBusiness.subdomain,
      } : null}
    />
  );
}

