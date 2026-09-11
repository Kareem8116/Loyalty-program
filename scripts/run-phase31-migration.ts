import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getServiceSupabase } from '../lib/supabase';

async function main() {
  const adminClient = getServiceSupabase();
  console.log('Running Phase 31 migration for feature_definitions...');

  const { error } = await adminClient
    .from('feature_definitions')
    .upsert({
      key: 'ai_anomaly_detection',
      name: 'AI Anomaly Detection',
      description: 'Smart anomaly detection and AI explanation for suspicious points activity',
    }, { onConflict: 'key' });

  if (error) {
    console.error('Migration error:', error);
  } else {
    console.log('✅ Phase 31 feature definition successfully registered in Supabase!');
  }
}

main().catch(console.error);
