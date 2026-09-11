import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function checkMigration() {
  console.log('🔍 Checking Phase 15 Advanced schema in Supabase...\n');

  const supabase = getServiceSupabase();
  let allGood = true;

  // 1. Check points_ledger columns
  const { data: ledgerData, error: ledgerErr } = await supabase
    .from('points_ledger')
    .select('id, invoice_reference, flagged_by_owner, flag_reason')
    .limit(1);

  if (ledgerErr) {
    console.log('❌ points_ledger columns missing:', ledgerErr.message);
    allGood = false;
  } else {
    console.log('✅ points_ledger: invoice_reference, flagged_by_owner, flag_reason exist.');
  }

  // 2. Check redemption_rates column
  const { data: ratesData, error: ratesErr } = await supabase
    .from('redemption_rates')
    .select('id, high_value_redemption_threshold')
    .limit(1);

  if (ratesErr) {
    console.log('❌ redemption_rates high_value_redemption_threshold missing:', ratesErr.message);
    allGood = false;
  } else {
    console.log('✅ redemption_rates: high_value_redemption_threshold exists.');
  }

  // 3. Check user_roles columns
  const { data: rolesData, error: rolesErr } = await supabase
    .from('user_roles')
    .select('id, per_minute_points_limit, manager_pin_hash')
    .limit(1);

  if (rolesErr) {
    console.log('❌ user_roles per_minute_points_limit / manager_pin_hash missing:', rolesErr.message);
    allGood = false;
  } else {
    console.log('✅ user_roles: per_minute_points_limit, manager_pin_hash exist.');
  }

  // 4. Check customers pin_hash
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .select('id, pin_hash')
    .limit(1);

  if (custErr) {
    console.log('❌ customers pin_hash missing:', custErr.message);
    allGood = false;
  } else {
    console.log('✅ customers: pin_hash exists.');
  }

  if (!allGood) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('Please copy and execute the SQL file at:');
    console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('--------------------------------------------------------------');
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260907000018_phase15_advanced_fraud.sql');
    console.log(fs.readFileSync(sqlPath, 'utf8'));
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } else {
    console.log('\n🎉 Phase 15 Advanced database objects are verified and ready!');
    process.exit(0);
  }
}

checkMigration().catch((err) => {
  console.error('Fatal error checking migration:', err);
  process.exit(1);
});
