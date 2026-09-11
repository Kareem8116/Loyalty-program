import { getServiceSupabase } from '../lib/supabase';

async function main() {
  const supabase = getServiceSupabase();
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, subdomain');
  
  if (error) {
    console.error('Error fetching businesses:', error);
    return;
  }

  const testBizIds = (businesses || [])
    .filter(b => b.subdomain.startsWith('test-') || b.subdomain.startsWith('rev-test-'))
    .map(b => b.id);

  console.log(`Found ${testBizIds.length} test businesses to deactivate:`, testBizIds);

  if (testBizIds.length > 0) {
    const { error: updErr } = await supabase
      .from('businesses')
      .update({ is_active: false })
      .in('id', testBizIds);

    console.log('Deactivated test businesses. Error:', updErr);
  }
}

main().catch(console.error);
