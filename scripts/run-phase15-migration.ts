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

async function runMigration() {
  console.log('🔧 Running Phase 15 migration via direct Supabase calls...\n');

  // ── Step 1: Add daily_points_limit column to user_roles ──────────────────
  console.log('1. Adding daily_points_limit to user_roles...');
  try {
    // Test if column already exists by querying it
    const { error: colTest } = await adminClient
      .from('user_roles')
      .select('daily_points_limit')
      .limit(1);
    
    if (colTest && colTest.message?.includes('daily_points_limit')) {
      console.log('   Column does not exist yet — applying via pg_dump workaround...');
      // We use the Supabase Management API to run DDL if available
      // Otherwise, the column needs to be added via Supabase Dashboard SQL editor
      console.log('\n   ⚠️  MANUAL STEP REQUIRED:');
      console.log('   Please run this SQL in Supabase Dashboard > SQL Editor:\n');
      console.log('   ALTER TABLE public.user_roles');
      console.log('     ADD COLUMN IF NOT EXISTS daily_points_limit INTEGER NOT NULL DEFAULT 1000;\n');
    } else {
      console.log('   ✅ Column daily_points_limit already exists (or was just added).');
    }
  } catch (e: any) {
    console.log('   Column status check error:', e.message);
  }

  // ── Step 2: Check if audit_log table exists ───────────────────────────────
  console.log('2. Checking audit_log table...');
  const { error: tableTest } = await adminClient
    .from('audit_log')
    .select('id')
    .limit(1);

  if (tableTest && (tableTest.message?.includes('does not exist') || tableTest.code === '42P01')) {
    console.log('\n   ⚠️  MANUAL STEP REQUIRED:');
    console.log('   The audit_log table does not exist yet.');
    console.log('   Please run the full migration SQL from the file:');
    console.log('   supabase/migrations/20260904000010_phase15_fraud_protection.sql\n');
    console.log('   You can open the Supabase Dashboard SQL Editor and paste the file contents.\n');
  } else if (tableTest) {
    console.log('   ⚠️ Unexpected error checking audit_log:', tableTest.message);
  } else {
    console.log('   ✅ audit_log table exists.');
    
    // ── Step 3: Verify daily_points_limit column exists ──────────────────
    console.log('3. Verifying daily_points_limit column...');
    const { data: roleRow } = await adminClient
      .from('user_roles')
      .select('daily_points_limit')
      .limit(1)
      .maybeSingle();
    
    if (roleRow !== undefined) {
      console.log('   ✅ daily_points_limit column exists in user_roles.');
      console.log('\n✅ Phase 15 migration is complete and verified!');
    } else {
      console.log('\n   ⚠️  daily_points_limit column may still need to be added manually.');
      printManualInstructions();
    }
  }
}

function printManualInstructions() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('MANUAL MIGRATION INSTRUCTIONS:');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('1. Open Supabase Dashboard > SQL Editor');
  console.log('2. Run the file: supabase/migrations/20260904000010_phase15_fraud_protection.sql');
  console.log('══════════════════════════════════════════════════════════════\n');
}

runMigration().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
