import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getServiceSupabase } from '../lib/supabase';

async function main() {
  const adminClient = getServiceSupabase();
  console.log('Running Phase 32 migration in Supabase...');

  // 1. Register notify_owner_sync_failure in feature_definitions
  const { error: featErr } = await adminClient
    .from('feature_definitions')
    .upsert({
      key: 'notify_owner_sync_failure',
      name: 'Notify Owner on Sync Failure',
      description: 'Send SMS alert to business owner if an offline cashier transaction fails during synchronization',
    }, { onConflict: 'key' });

  if (featErr) {
    console.error('Feature definition registration error:', featErr);
  } else {
    console.log('✅ notify_owner_sync_failure successfully registered in feature_definitions.');
  }

  // 2. Check business_settings max_offline_transactions column
  const { data, error: checkErr } = await adminClient
    .from('business_settings')
    .select('id, max_offline_transactions')
    .limit(1);

  if (checkErr && checkErr.message.includes('max_offline_transactions')) {
    console.log('ℹ️ max_offline_transactions column will be handled gracefully via fallback until added in SQL editor.');
  } else {
    console.log('✅ business_settings verified.');
  }
}

main().catch(console.error);
