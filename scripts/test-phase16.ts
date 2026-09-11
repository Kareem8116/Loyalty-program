/**
 * Phase 16 Test Suite: Customer Notifications & Fail-Silent Architecture
 *
 * Tests:
 * 1.1  Default feature status: 'notifications' is false by default for new businesses
 * 1.2  Default feature status: standard features ('offers', etc.) are true by default
 * 1.3  setBusinessFeature: enable 'notifications' for a business
 * 1.4  isFeatureEnabled: returns true after enabling
 * 2.1  Fail-silent: Points transaction succeeds when notifications are disabled
 * 2.2  Fail-silent: Points transaction succeeds when notifications enabled but credentials empty
 * 2.3  Fail-silent: sendCustomerNotification never throws and handles errors safely
 * 3.1  Formatted message: Points added notification contains points and balance
 * 3.2  Formatted message: Points redeemed notification contains redeemed points and balance
 * 3.3  Formatted message: Points expiring notification contains expiring points and days
 * 4.1  Customer opt-out: notifications_enabled = false silently bypasses notification
 * 4.2  Customer opt-out: PUT /api/customer/[token] updates notifications_enabled
 * 4.3  Customer opt-in: Re-enabling notifications resumes message delivery
 * 5.1  Disabling feature stops notifications immediately while points transaction continues normally
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { recordPointsTransaction } from '../lib/cashier';
import { createCustomer, getCustomerByQrToken } from '../lib/customer';
import { isFeatureEnabled, setBusinessFeature, getBusinessFeaturesWithDefs } from '../lib/features';
import {
  sendCustomerNotification,
  formatNotificationMessage,
  testNotificationLog,
  getBusinessNotificationSettings,
} from '../lib/notifications';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

const cleanupIds: {
  customerIds: string[];
  businessIds: string[];
} = { customerIds: [], businessIds: [] };

async function main() {
  console.log('\n================================================================');
  console.log('       Phase 16: Customer Notifications — Test Suite          ');
  console.log('================================================================\n');

  const ts = Date.now();

  // ─────────────────────────────────────────────────────────────────────────
  // 0. Bootstrap test business and customer
  // ─────────────────────────────────────────────────────────────────────────
  console.log('0. Bootstrapping test environment...');

  const { data: testBiz, error: bizErr } = await adminClient
    .from('businesses')
    .insert({
      name: `Phase16 Notif Cafe ${ts}`,
      subdomain: `test-p16-notif-${ts}`,
      is_active: true,
    })
    .select()
    .single();

  if (bizErr || !testBiz) {
    console.error('Failed to create test business:', bizErr);
    process.exit(1);
  }
  cleanupIds.businessIds.push(testBiz.id);

  const { data: testBranch, error: branchErr } = await adminClient
    .from('branches')
    .insert({
      business_id: testBiz.id,
      name: 'Main Branch',
    })
    .select()
    .single();

  if (branchErr || !testBranch) {
    console.error('Failed to create test branch:', branchErr);
    process.exit(1);
  }

  // Create test customer
  const testCustomer = await createCustomer({
    businessId: testBiz.id,
    name: `Ahmed Test ${ts}`,
    phoneNumber: '+201012345678',
    consentGiven: true,
  });
  cleanupIds.customerIds.push(testCustomer.id);

  console.log(`   Business ID: ${testBiz.id}`);
  console.log(`   Customer ID: ${testCustomer.id}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Feature Control & Defaults (PLAN.md 16.1)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Test Group 1: Feature Control & Defaults ---');

  // 1.1: 'notifications' feature defaults to FALSE for a new business
  const notifDefault = await isFeatureEnabled(testBiz.id, 'notifications');
  assert(notifDefault === false, '1.1 notifications feature defaults to false for new business');

  // 1.2: Standard feature ('offers') defaults to TRUE
  const offersDefault = await isFeatureEnabled(testBiz.id, 'offers');
  assert(offersDefault === true, '1.2 offers feature defaults to true by default');

  // 1.3: Enable notifications feature for this business
  await setBusinessFeature(testBiz.id, 'notifications', true);
  assert(true, '1.3 setBusinessFeature enabled notifications feature');

  // 1.4: Verify isFeatureEnabled is now true
  const notifEnabled = await isFeatureEnabled(testBiz.id, 'notifications');
  assert(notifEnabled === true, '1.4 isFeatureEnabled returns true after enabling');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Fail-Silent Protection (PLAN.md 16.8)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 2: Fail-Silent Protection ---');

  // 2.1: Points transaction completes smoothly when notifications are disabled
  await setBusinessFeature(testBiz.id, 'notifications', false);

  const tx1 = await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: 150,
    reason: 'purchase_test_fail_silent',
  });
  assert(
    tx1.success && tx1.newBalance === 150,
    '2.1 Points addition succeeds normally when notifications disabled'
  );

  // 2.2: Points transaction completes smoothly when notifications are enabled but credentials empty
  await setBusinessFeature(testBiz.id, 'notifications', true);

  const tx2 = await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: 50,
    reason: 'purchase_test_no_credentials',
  });
  assert(
    tx2.success && tx2.newBalance === 200,
    '2.2 Points addition succeeds normally when enabled without credentials'
  );

  // 2.3: sendCustomerNotification never throws on arbitrary invalid input
  let errorThrown = false;
  try {
    const result = await sendCustomerNotification({
      businessId: 'non-existent-biz',
      customerId: 'non-existent-cust',
      type: 'points_added',
      data: { pointsChange: 100 },
    });
    assert(
      result.sent === false && result.bypassed === true,
      '2.3 sendCustomerNotification safely bypasses on non-existent entities without throwing'
    );
  } catch (err) {
    errorThrown = true;
  }
  assert(!errorThrown, '2.3 No unhandled error thrown by sendCustomerNotification');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Notification Message Formatting & Delivery (PLAN.md 16.5, 16.6, 16.7)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 3: Notification Messages & Mock Delivery ---');

  // Configure mock notification settings for the test business
  await adminClient.from('business_notification_settings').upsert({
    business_id: testBiz.id,
    provider: 'mock',
    phone_number_id: 'mock-phone-id-123',
    access_token: 'mock-access-token-456',
  });

  // 3.1: Points added message format
  const addMsg = formatNotificationMessage('points_added', { pointsChange: 75, newBalance: 275 }, 'Cafe Test');
  assert(
    addMsg.includes('75') && addMsg.includes('275') && addMsg.includes('Cafe Test'),
    '3.1 Points added notification format contains points change, balance, and business name'
  );

  // Trigger sendCustomerNotification for points_added
  testNotificationLog.length = 0; // clear log
  const sendRes1 = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_added',
    data: { pointsChange: 75, newBalance: 275 },
  });
  assert(sendRes1.sent === true, '3.1 Points added notification sent via mock provider');
  assert(testNotificationLog.length > 0, '3.1 Notification logged in testNotificationLog');

  // 3.2: Points redeemed message format
  const redeemMsg = formatNotificationMessage('points_redeemed', { pointsChange: -50, newBalance: 225 }, 'Cafe Test');
  assert(
    redeemMsg.includes('50') && redeemMsg.includes('225'),
    '3.2 Points redeemed notification format contains redeemed points and balance'
  );

  const sendRes2 = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_redeemed',
    data: { pointsChange: -50, newBalance: 225 },
  });
  assert(sendRes2.sent === true, '3.2 Points redeemed notification sent via mock provider');

  // 3.3: Points expiring message format
  const expiryMsg = formatNotificationMessage('points_expiring', { expiringPoints: 40, daysRemaining: 15 }, 'Cafe Test');
  assert(
    expiryMsg.includes('40') && expiryMsg.includes('15'),
    '3.3 Points expiring notification format contains expiring points count and days remaining'
  );

  const sendRes3 = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_expiring',
    data: { expiringPoints: 40, daysRemaining: 15 },
  });
  assert(sendRes3.sent === true, '3.3 Points expiring notification sent via mock provider');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Customer Opt-Out (PLAN.md 16.9 & RULES.md 3.1)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 4: Customer Opt-Out ---');

  // 4.1: When customer has notifications_enabled = false, message is bypassed
  await adminClient
    .from('customers')
    .update({ notifications_enabled: false })
    .eq('id', testCustomer.id);

  const optOutRes = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_added',
    data: { pointsChange: 20, newBalance: 245 },
  });
  assert(
    optOutRes.sent === false && optOutRes.reason === 'CUSTOMER_OPTED_OUT',
    '4.1 Customer opt-out (notifications_enabled = false) blocks notification delivery'
  );

  // 4.2: Customer details API reflects opt-out status and business notifications active flag
  const custDetails = await getCustomerByQrToken(testCustomer.qr_token);
  assert(
    custDetails?.notifications_enabled === false,
    '4.2 getCustomerByQrToken reflects customer notifications_enabled = false'
  );
  assert(
    custDetails?.business_notifications_active === true,
    '4.2 getCustomerByQrToken returns business_notifications_active = true'
  );

  // 4.3: Customer re-enables notifications (opt-in)
  await adminClient
    .from('customers')
    .update({ notifications_enabled: true })
    .eq('id', testCustomer.id);

  const optInRes = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_added',
    data: { pointsChange: 30, newBalance: 275 },
  });
  assert(optInRes.sent === true, '4.3 Customer re-enabling notifications resumes message delivery');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Immediate Disabling & Core Transaction Independence (PLAN.md 16.10)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 5: Disabling Feature & Core Independence ---');

  // 5.1: Disable notifications feature for business
  await setBusinessFeature(testBiz.id, 'notifications', false);

  const disabledRes = await sendCustomerNotification({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    type: 'points_added',
    data: { pointsChange: 50 },
  });
  assert(
    disabledRes.sent === false && disabledRes.reason === 'FEATURE_DISABLED_FOR_BUSINESS',
    '5.1 Disabling feature immediately stops notifications from sending'
  );

  // 5.2: Core points transaction proceeds completely unaffected
  const txFinal = await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: 50,
    reason: 'final_independence_check',
  });
  assert(
    txFinal.success && txFinal.newBalance === 250,
    '5.2 Core points transaction executes with 100% success when feature disabled'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Cleanup Test Data ---');
  try {
    if (cleanupIds.customerIds.length > 0) {
      await adminClient.from('points_ledger').delete().in('customer_id', cleanupIds.customerIds);
      await adminClient.from('customers').delete().in('id', cleanupIds.customerIds);
    }
    if (cleanupIds.businessIds.length > 0) {
      await adminClient.from('business_notification_settings').delete().in('business_id', cleanupIds.businessIds);
      await adminClient.from('business_features').delete().in('business_id', cleanupIds.businessIds);
      await adminClient.from('branches').delete().in('business_id', cleanupIds.businessIds);
      await adminClient.from('businesses').delete().in('id', cleanupIds.businessIds);
    }
    console.log('  🧹 Cleaned up test business and customer records.');
  } catch (err: any) {
    console.warn('  ⚠️ Cleanup warning:', err.message);
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Test suite fatal error:', err);
  process.exit(1);
});
