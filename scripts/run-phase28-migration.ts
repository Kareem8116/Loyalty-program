import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getServiceSupabase } from '../lib/supabase';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function checkMigration() {
  console.log('🔍 Checking Phase 28 schema in Supabase...\n');

  const supabase = getServiceSupabase();
  let allGood = true;

  // 1. Check points_ledger.reversal_of
  const { data: revData, error: revErr } = await supabase
    .from('points_ledger')
    .select('id, reversal_of')
    .limit(1);

  if (revErr) {
    console.log('❌ points_ledger.reversal_of missing:', revErr.message);
    allGood = false;
  } else {
    console.log('✅ points_ledger.reversal_of exists.');
  }

  // 2. Check points_ledger.consumption_breakdown
  const { data: cData, error: cErr } = await supabase
    .from('points_ledger')
    .select('id, consumption_breakdown')
    .limit(1);

  if (cErr) {
    console.log('❌ points_ledger.consumption_breakdown missing:', cErr.message);
    allGood = false;
  } else {
    console.log('✅ points_ledger.consumption_breakdown exists.');
  }

  if (!allGood) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('Please copy and execute the SQL file at:');
    console.log('https://supabase.com/dashboard/project/xrhyyfxdjzbrtgbgsieh/sql/new');
    console.log('--------------------------------------------------------------');
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260909000020_phase28_reversals.sql');
    console.log(fs.readFileSync(sqlPath, 'utf8'));
    console.log('══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } else {
    console.log('\n🎉 Phase 28 schema is verified and ready in Supabase!\n');
  }
}

checkMigration().catch((err) => {
  console.error('Migration check failed:', err);
  process.exit(1);
});
