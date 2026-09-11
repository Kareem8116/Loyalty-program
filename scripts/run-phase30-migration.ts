/**
 * scripts/run-phase30-migration.ts
 * Applies Phase 30 migration and verifies schema in Supabase.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getServiceSupabase } from '../lib/supabase';

async function runPhase30Migration() {
  console.log('🚀 Running Phase 30 SMS schema verification...\n');

  const adminClient = getServiceSupabase();

  try {
    // 1. Ensure feature definition exists
    console.log('1. Registering sms_notifications in feature_definitions...');
    const { error: featErr } = await adminClient
      .from('feature_definitions')
      .upsert({
        key: 'sms_notifications',
        name: 'SMS Notifications',
        description: 'Automated customer SMS notifications via Twilio or custom provider',
      }, { onConflict: 'key' });

    if (featErr) {
      console.warn('⚠️ feature_definitions upsert note:', featErr.message);
    } else {
      console.log('  ✅ sms_notifications feature definition registered.');
    }

    // 2. Check if business_sms_settings table exists
    console.log('\n2. Verifying business_sms_settings table...');
    const { data: testSmsTable, error: smsTableErr } = await adminClient
      .from('business_sms_settings')
      .select('id')
      .limit(1);

    if (smsTableErr) {
      console.log('  ℹ️ business_sms_settings table not created yet or needs creation.');
      console.log('  SQL to run in Supabase SQL Editor:');
      console.log(`
CREATE TABLE IF NOT EXISTS public.business_sms_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock',
  account_sid TEXT NULL,
  auth_token TEXT NULL,
  sender_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_business_sms_settings UNIQUE (business_id)
);
CREATE INDEX IF NOT EXISTS idx_biz_sms_settings_biz ON public.business_sms_settings (business_id);
ALTER TABLE public.business_sms_settings ENABLE ROW LEVEL SECURITY;
      `);
    } else {
      console.log('  ✅ business_sms_settings table exists and is accessible.');
    }

    // 3. Check customer notification_channel column
    console.log('\n3. Verifying customers.notification_channel column...');
    const { data: testCust, error: custErr } = await adminClient
      .from('customers')
      .select('id, notification_channel')
      .limit(1);

    if (custErr) {
      console.log('  ℹ️ customers.notification_channel column missing.');
      console.log('  SQL to run in Supabase SQL Editor:');
      console.log(`
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS notification_channel TEXT NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS idx_customers_notif_channel ON public.customers (business_id, notification_channel);
      `);
    } else {
      console.log('  ✅ customers.notification_channel column exists.');
    }

    console.log('\n🎉 Phase 30 schema check complete.');
  } catch (err: any) {
    console.error('❌ Migration verification error:', err);
  }
}

runPhase30Migration();
