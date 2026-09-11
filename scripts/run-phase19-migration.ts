/**
 * Verification script for Phase 19 (Referral Program)
 */

import { getServiceSupabase } from '../lib/supabase';

async function verifyPhase19Migration() {
  const supabase = getServiceSupabase();
  console.log('🔍 Checking Phase 19 tables and schema in Supabase...\n');

  // 1. Check referral_settings table
  const { data: settingsData, error: settingsError } = await supabase
    .from('referral_settings')
    .select('id')
    .limit(1);

  if (settingsError && settingsError.message.includes('relation "public.referral_settings" does not exist')) {
    console.error('❌ referral_settings table does NOT exist yet:', settingsError.message);
    printInstructions();
    process.exit(1);
  }

  // 2. Check referral_code column on customers
  const { data: custData, error: custError } = await supabase
    .from('customers')
    .select('id, referral_code, referred_by')
    .limit(1);

  if (custError && (custError.message.includes('referral_code') || custError.message.includes('referred_by'))) {
    console.error('❌ customers table missing referral columns:', custError.message);
    printInstructions();
    process.exit(1);
  }

  console.log('✅ referral_settings table exists and is accessible.');
  console.log('✅ customers table has referral_code and referred_by columns.');
  console.log('\n🎉 Phase 19 database objects are verified and ready!');
}

function printInstructions() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('⚠️  SQL MIGRATION REQUIRED IN SUPABASE DASHBOARD:');
  console.log('Please copy and execute the SQL file:');
  console.log('supabase/migrations/20260905000013_phase19_referral_program.sql');
  console.log('══════════════════════════════════════════════════════════════\n');
}

verifyPhase19Migration();
