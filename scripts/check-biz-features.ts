import { getServiceSupabase } from '../lib/supabase';

async function main() {
  const supabase = getServiceSupabase();
  const { data: businesses, error: bErr } = await supabase
    .from('businesses')
    .select('id, name, subdomain, is_active');
  
  console.log('Businesses:', JSON.stringify(businesses, null, 2), 'Error:', bErr);

  if (businesses && businesses.length > 0) {
    for (const b of businesses) {
      const { data: features, error: fErr } = await supabase
        .from('business_features')
        .select('*')
        .eq('business_id', b.id);
      console.log(`Features for ${b.name} (${b.id}):`, JSON.stringify(features, null, 2), 'Error:', fErr);
    }
  }
}

main().catch(console.error);
