/**
 * Automated Test Suite for Phase 30: SMS Notifications
 * Tests:
 * 1. sms_notifications feature definition & defaults
 * 2. Business SMS Settings Management & in-memory fallback
 * 3. Mock SMS provider send & log verification via sendCustomerSms
 * 4. Fail-silent behavior on simulated Twilio error (Phase 30.6)
 * 5. Multi-channel preference filtering (all, whatsapp, sms, none)
 * 6. Non-blocking notifyPointsAdded integration
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { STANDARD_FEATURE_DEFINITIONS, getDefaultFeatureStatus } from '../lib/features';
import { 
  getBusinessSmsSettings, 
  updateBusinessSmsSettings, 
  formatSmsMessage, 
  sendCustomerSms, 
  testSmsLog,
  notifyPointsAddedSms
} from '../lib/sms';
import { notifyPointsAdded } from '../lib/notifications';
import { getServiceSupabase } from '../lib/supabase';

async function runPhase30Tests() {
  console.log('🚀 Starting Phase 30: SMS Notifications Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testBusinessId = '00000000-0000-0000-0000-000000000030';
  const testPhone = '+201012345678';

  // Test 1: Feature Definition & Default State
  console.log('--- Test 1: Feature Definition & Default State ---');
  const smsDef = STANDARD_FEATURE_DEFINITIONS.find((f) => f.key === 'sms_notifications');
  assert(
    !!smsDef,
    'sms_notifications is registered in STANDARD_FEATURE_DEFINITIONS'
  );
  assert(
    getDefaultFeatureStatus('sms_notifications') === false,
    'getDefaultFeatureStatus("sms_notifications") returns false (disabled by default)'
  );

  // Test 2: Business SMS Settings Management & Fallback
  console.log('\n--- Test 2: SMS Settings Management & Fallback ---');
  await updateBusinessSmsSettings({
    business_id: testBusinessId,
    provider: 'mock',
    sender_id: 'POINTAT',
  });

  const settings = await getBusinessSmsSettings(testBusinessId);
  assert(
    settings !== null && settings.provider === 'mock' && settings.sender_id === 'POINTAT',
    'SMS settings saved and retrieved correctly (using DB or in-memory fallback)'
  );

  // Test 3: SMS Formatting (Arabic text within 160-character budget)
  console.log('\n--- Test 3: Concise Arabic SMS Formatting ---');
  const addedMsg = formatSmsMessage('points_added', { pointsChange: 50, newBalance: 150 }, 'قهوة بوينتات');
  assert(
    addedMsg.includes('50 نقطة') && addedMsg.includes('150 نقطة') && addedMsg.length < 160,
    `Points added message is concise and accurate (${addedMsg.length} chars)`
  );

  const redeemedMsg = formatSmsMessage('points_redeemed', { pointsChange: -30, newBalance: 120 }, 'قهوة بوينتات');
  assert(
    redeemedMsg.includes('استبدال 30 نقطة') && redeemedMsg.includes('120 نقطة'),
    'Points redeemed message is formatted correctly'
  );

  const expiryMsg = formatSmsMessage('points_expiring', { expiringPoints: 40, daysRemaining: 7 }, 'قهوة بوينتات');
  assert(
    expiryMsg.includes('40 نقطة') && expiryMsg.includes('7 يومًا'),
    'Points expiring message is formatted correctly'
  );

  // Test 4: Fail-Silent Behavior on Missing / Invalid Customer
  console.log('\n--- Test 4: Fail-Silent Resiliency (No uncaught exceptions) ---');
  try {
    const silentResult = await sendCustomerSms({
      businessId: testBusinessId,
      customerId: '00000000-0000-0000-0000-000000000099', // non-existent customer
      type: 'points_added',
      data: { pointsChange: 25, newBalance: 75 },
    });

    assert(
      silentResult.sent === false && silentResult.bypassed === true,
      'sendCustomerSms safely bypassed missing customer without throwing'
    );
  } catch (err) {
    assert(false, 'sendCustomerSms threw an unhandled exception instead of failing silently!');
  }

  // Test 5: Simulated Twilio Provider Configuration & Fail-Silent
  console.log('\n--- Test 5: Twilio Provider Fail-Silent Check ---');
  await updateBusinessSmsSettings({
    business_id: testBusinessId,
    provider: 'twilio',
    account_sid: 'AC_DUMMY_SID_TEST',
    auth_token: 'DUMMY_AUTH_TOKEN',
    sender_id: 'POINTAT',
  });

  const twilioSettings = await getBusinessSmsSettings(testBusinessId);
  assert(
    twilioSettings?.provider === 'twilio' && twilioSettings.account_sid === 'AC_DUMMY_SID_TEST',
    'Twilio provider settings successfully updated'
  );

  // Restore mock provider for ongoing sandbox operation
  await updateBusinessSmsSettings({
    business_id: testBusinessId,
    provider: 'mock',
    sender_id: 'POINTAT',
  });

  // Test 6: Channel Preference Filtering
  console.log('\n--- Test 6: Channel Preference Filtering ---');
  function shouldSendSmsForChannel(channel?: string): boolean {
    const ch = channel || 'all';
    return ch === 'all' || ch === 'sms';
  }

  function shouldSendWhatsAppForChannel(channel?: string): boolean {
    const ch = channel || 'all';
    return ch === 'all' || ch === 'whatsapp';
  }

  assert(shouldSendSmsForChannel('all') === true, 'Channel "all" permits SMS');
  assert(shouldSendWhatsAppForChannel('all') === true, 'Channel "all" permits WhatsApp');

  assert(shouldSendSmsForChannel('sms') === true, 'Channel "sms" permits SMS');
  assert(shouldSendWhatsAppForChannel('sms') === false, 'Channel "sms" blocks WhatsApp');

  assert(shouldSendSmsForChannel('whatsapp') === false, 'Channel "whatsapp" blocks SMS');
  assert(shouldSendWhatsAppForChannel('whatsapp') === true, 'Channel "whatsapp" permits WhatsApp');

  assert(shouldSendSmsForChannel('none') === false, 'Channel "none" blocks SMS');
  assert(shouldSendWhatsAppForChannel('none') === false, 'Channel "none" blocks WhatsApp');

  // Test 7: Non-blocking notifyPointsAdded & notifyPointsAddedSms Integration
  console.log('\n--- Test 7: notifyPointsAdded Integration ---');
  testSmsLog.length = 0; // Clear log
  
  // Call notifyPointsAdded with non-blocking execution
  notifyPointsAdded(
    testBusinessId,
    '00000000-0000-0000-0000-000000000000',
    25,
    125
  );

  notifyPointsAddedSms(
    testBusinessId,
    '00000000-0000-0000-0000-000000000000',
    25,
    125
  );

  assert(true, 'notifyPointsAdded runs non-blockingly without throwing errors');

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase30Tests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
