import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function checkMigration() {
  console.log('🔍 Checking Pre-Phase 27 schema in Supabase...\n');

  const supabase = getServiceSupabase();
  let allGood = true;

  // 1. Check businesses.timezone
  const { data: bData, error: bErr } = await supabase.from('businesses').select('id, timezone').limit(1);
  if (bErr) {
    console.log('❌ businesses.timezone missing:', bErr.message);
    allGood = false;
  } else {
    console.log('✅ businesses.timezone exists.');
  }

  // 2. Check user_roles.per_transaction_points_limit
  const { data: rData, error: rErr } = await supabase.from('user_roles').select('id, per_transaction_points_limit').limit(1);
  if (rErr) {
    console.log('❌ user_roles.per_transaction_points_limit missing:', rErr.message);
    allGood = false;
  } else {
    console.log('✅ user_roles.per_transaction_points_limit exists.');
  }

  // 3. Check points_ledger.remaining_amount
  const { data: lData, error: lErr } = await supabase.from('points_ledger').select('id, remaining_amount').limit(1);
  if (lErr) {
    console.log('❌ points_ledger.remaining_amount missing:', lErr.message);
    allGood = false;
  } else {
    console.log('✅ points_ledger.remaining_amount exists.');
  }

  // 4. Check customer_auth_links table
  const { data: cData, error: cErr } = await supabase.from('customer_auth_links').select('id, access_pin_hash').limit(1);
  if (cErr) {
    console.log('❌ customer_auth_links table missing:', cErr.message);
    allGood = false;
  } else {
    console.log('✅ customer_auth_links table exists.');
  }

  if (!allGood) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('Please copy and execute the SQL file at:');
    console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('--------------------------------------------------------------');
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260908000019_pre_phase27_prerequisites.sql');
    console.log(fs.readFileSync(sqlPath, 'utf8'));
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } else {
    console.log('\n🎉 Pre-Phase 27 database schema is completely verified and ready!');
    process.exit(0);
  }
}

checkMigration().catch((err) => {
  console.error('Fatal error checking migration:', err);
  process.exit(1);
});
