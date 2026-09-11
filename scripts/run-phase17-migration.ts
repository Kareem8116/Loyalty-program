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
  console.log('🔍 Checking Phase 17 tables and schema in Supabase...\n');

  // Check membership_tiers table
  const { data, error } = await adminClient
    .from('membership_tiers')
    .select('id, name, min_points_earned')
    .limit(1);

  if (error) {
    console.log('❌ membership_tiers table does NOT exist yet:', error.message);
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
    console.log('Please copy and execute the SQL file:');
    console.log('supabase/migrations/20260905000012_phase17_membership_tiers.sql');
    console.log('══════════════════════════════════════════════════════════════\n');
  } else {
    console.log('✅ membership_tiers table exists and is accessible.');
    console.log('\n🎉 Phase 17 database objects are verified and ready!');
  }
}

checkMigration().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
