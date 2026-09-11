import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceKey);

async function checkMigration() {
  console.log('🔍 Checking Phase 16 tables and schema in Supabase...\n');

  let allGood = true;

  // 1. Check feature_definitions
  const { data: featDefs, error: featErr } = await adminClient
    .from('feature_definitions')
    .select('key, name')
    .limit(5);

  if (featErr) {
    console.log('❌ feature_definitions table does NOT exist yet:', featErr.message);
    allGood = false;
  } else {
    console.log(`✅ feature_definitions table exists (${featDefs?.length || 0} features seeded).`);
  }

  // 2. Check business_features
  const { error: bfErr } = await adminClient
    .from('business_features')
    .select('id')
    .limit(1);

  if (bfErr) {
    console.log('❌ business_features table does NOT exist yet:', bfErr.message);
    allGood = false;
  } else {
    console.log('✅ business_features table exists.');
  }

  // 3. Check business_notification_settings
  const { error: bnsErr } = await adminClient
    .from('business_notification_settings')
    .select('id')
    .limit(1);

  if (bnsErr) {
    console.log('❌ business_notification_settings table does NOT exist yet:', bnsErr.message);
    allGood = false;
  } else {
    console.log('✅ business_notification_settings table exists.');
  }

  // 4. Check customers.notifications_enabled
  const { error: custErr } = await adminClient
    .from('customers')
    .select('notifications_enabled')
    .limit(1);

  if (custErr && custErr.message?.includes('notifications_enabled')) {
    console.log('❌ customers.notifications_enabled column does NOT exist yet:', custErr.message);
    allGood = false;
  } else if (custErr) {
    console.log('⚠️ Note checking customers:', custErr.message);
  } else {
    console.log('✅ customers.notifications_enabled column exists.');
  }

  if (!allGood) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('Please copy and execute the SQL file:');
    console.log('supabase/migrations/20260905000011_phase16_notifications.sql');
    console.log('══════════════════════════════════════════════════════════════\n');
  } else {
    console.log('\n🎉 All Phase 16 database objects are verified and ready!');
  }
}

checkMigration().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
