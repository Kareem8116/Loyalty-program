import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { 
  hashPin, 
  verifyCustomerPin, 
  verifyManagerPin, 
  getCashierMinuteLimit, 
  checkCashierMinuteRateLimit,
  recordPointsTransaction 
} from '../lib/cashier';
import { createCustomer } from '../lib/customer';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

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

// Track entities for cleanup
const cleanup = {
  businessIds: [] as string[],
  customerIds: [] as string[],
  userIds: [] as string[],
};

async function runTests() {
  console.log('\n================================================================');
  console.log('   Phase 15 Advanced: Fraud Protection & Daily Review Suite   ');
  console.log('================================================================\n');

  try {
    // --- Group 1: Zero Emojis Compliance & Translation Parity ---
    console.log('--- Test Group 1: Zero Emojis & 100% Translation Parity ---');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const arPath = path.join(process.cwd(), 'messages/ar.json');
    const enPath = path.join(process.cwd(), 'messages/en.json');
    const arRaw = fs.readFileSync(arPath, 'utf8');
    const enRaw = fs.readFileSync(enPath, 'utf8');

    assert(!emojiRegex.test(arRaw), 'Arabic translation file has 0 emojis (strict compliance)');
    assert(!emojiRegex.test(enRaw), 'English translation file has 0 emojis (strict compliance)');

    const arJson = JSON.parse(arRaw);
    const enJson = JSON.parse(enRaw);

    const getKeys = (obj: any, prefix = ''): string[] => {
      let keys: string[] = [];
      for (const k of Object.keys(obj)) {
        const full = prefix ? `${prefix}.${k}` : k;
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          keys = keys.concat(getKeys(obj[k], full));
        } else {
          keys.push(full);
        }
      }
      return keys;
    };

    const arKeys = new Set(getKeys(arJson));
    const enKeys = new Set(getKeys(enJson));
    const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));

    assert(missingInEn.length === 0, `All Arabic keys exist in English (${missingInEn.length} missing)`);
    assert(missingInAr.length === 0, `All English keys exist in Arabic (${missingInAr.length} missing)`);

    assert(Boolean(arJson.cashierControl?.invoiceReference), 'ar.json has cashierControl.invoiceReference');
    assert(Boolean(arJson.cashierControl?.duplicateInvoiceError), 'ar.json has cashierControl.duplicateInvoiceError');
    assert(Boolean(arJson.cashierControl?.customerPinRequired), 'ar.json has cashierControl.customerPinRequired');
    assert(Boolean(arJson.cashierControl?.managerPinRequired), 'ar.json has cashierControl.managerPinRequired');
    assert(Boolean(arJson.cashierControl?.perMinuteLimitExceeded), 'ar.json has cashierControl.perMinuteLimitExceeded');
    assert(Boolean(arJson.admin?.dailyReviewTab), 'ar.json has admin.dailyReviewTab');
    assert(Boolean(arJson.admin?.flagForReview), 'ar.json has admin.flagForReview');
    assert(Boolean(arJson.admin?.unflag), 'ar.json has admin.unflag');

    // --- Group 2: PIN Hashing & Cryptographic Verification ---
    console.log('\n--- Test Group 2: PIN Security & Cryptographic Verification ---');
    const samplePin = '4829';
    const hashed = hashPin(samplePin);
    assert(hashed.length === 64, 'hashPin produces 64-character SHA-256 hex string');
    assert(hashed !== samplePin, 'PIN is never stored as plain text');
    assert(hashPin(samplePin) === hashed, 'hashPin is deterministic');

    // --- Group 3: Code Architecture & Security Validation ---
    console.log('\n--- Test Group 3: API & UI Architecture Verification ---');
    const cashierRoutePath = path.join(process.cwd(), 'app/api/cashier/points/route.ts');
    const cashierRouteCode = fs.readFileSync(cashierRoutePath, 'utf8');

    assert(cashierRouteCode.includes('DUPLICATE_INVOICE'), 'API handles DUPLICATE_INVOICE explicitly');
    assert(cashierRouteCode.includes('Idempotency-Key'), 'API inspects Idempotency-Key header');
    assert(cashierRouteCode.includes('status: 409'), 'API returns 409 on duplicate invoice');
    assert(cashierRouteCode.includes('PER_MINUTE_LIMIT_EXCEEDED'), 'API handles PER_MINUTE_LIMIT_EXCEEDED');
    assert(cashierRouteCode.includes('status: 429'), 'API returns 429 on per-minute limit exceeded');
    assert(cashierRouteCode.includes('CUSTOMER_PIN_REQUIRED'), 'API handles high-value CUSTOMER_PIN_REQUIRED');
    assert(cashierRouteCode.includes('INVALID_CUSTOMER_PIN'), 'API handles INVALID_CUSTOMER_PIN');
    assert(cashierRouteCode.includes('INVALID_MANAGER_PIN'), 'API handles INVALID_MANAGER_PIN');

    const dailyReviewPath = path.join(process.cwd(), 'app/api/admin/daily-review/route.ts');
    const dailyReviewCode = fs.readFileSync(dailyReviewPath, 'utf8');
    assert(dailyReviewCode.includes('export async function GET'), 'Daily review route exposes GET handler');
    assert(dailyReviewCode.includes('export async function PATCH'), 'Daily review route exposes PATCH handler');

    const cashierControlCode = fs.readFileSync(path.join(process.cwd(), 'components/CashierControl.tsx'), 'utf8');
    assert(cashierControlCode.includes('invoice-reference-input'), 'CashierControl has invoice reference input');
    assert(cashierControlCode.includes('customer-pin-input'), 'CashierControl has customer PIN input modal');
    assert(cashierControlCode.includes('manager-pin-input'), 'CashierControl has manager PIN input modal');

    const adminPageCode = fs.readFileSync(path.join(process.cwd(), 'app/admin/page.tsx'), 'utf8');
    assert(adminPageCode.includes('tab-daily-review'), 'Admin dashboard includes Daily Review tab button');
    assert(adminPageCode.includes('daily-review-date-picker'), 'Daily Review tab includes date picker');
    assert(adminPageCode.includes('flag-reason-input'), 'Admin dashboard includes flag reason modal');

    // --- Group 4: Live Database Integration Tests ---
    console.log('\n--- Test Group 4: Live Database Integration Tests ---');
    const ts = Date.now();

    // 1. Create 2 test businesses
    const { data: bizA, error: bErrA } = await adminClient
      .from('businesses')
      .insert({ name: `Test Biz A ${ts}`, subdomain: `test-a-${ts}` })
      .select()
      .single();
    if (bErrA || !bizA) throw new Error(`Failed to create bizA: ${bErrA?.message}`);
    cleanup.businessIds.push(bizA.id);

    const { data: bizB, error: bErrB } = await adminClient
      .from('businesses')
      .insert({ name: `Test Biz B ${ts}`, subdomain: `test-b-${ts}` })
      .select()
      .single();
    if (bErrB || !bizB) throw new Error(`Failed to create bizB: ${bErrB?.message}`);
    cleanup.businessIds.push(bizB.id);

    // Create branch for bizA
    const { data: branchA } = await adminClient
      .from('branches')
      .insert({ business_id: bizA.id, name: 'Main Branch A' })
      .select()
      .single();

    // Create branch for bizB
    const { data: branchB } = await adminClient
      .from('branches')
      .insert({ business_id: bizB.id, name: 'Main Branch B' })
      .select()
      .single();

    // Configure redemption rates for bizA with high_value_redemption_threshold = 50
    await adminClient
      .from('redemption_rates')
      .insert({
        business_id: bizA.id,
        points_per_currency_unit: 1.0,
        currency_per_point: 0.1,
        high_value_redemption_threshold: 50,
      });

    // Create test customer for bizA (phone ends in 5678)
    const custA = await createCustomer({
      businessId: bizA.id,
      name: 'Customer A',
      phoneNumber: `+201012345678`,
      consentGiven: true,
    });
    cleanup.customerIds.push(custA.id);

    // Create test customer for bizB
    const custB = await createCustomer({
      businessId: bizB.id,
      name: 'Customer B',
      phoneNumber: `+201087654321`,
      consentGiven: true,
    });
    cleanup.customerIds.push(custB.id);

    // Create cashier and manager users in auth.users
    const cashierEmail = `cashier-p15-${ts}@test.local`;
    const { data: cashierAuth, error: cashierAuthErr } = await adminClient.auth.admin.createUser({
      email: cashierEmail,
      password: 'CashierPassword123!',
      email_confirm: true,
    });
    if (cashierAuthErr || !cashierAuth.user) throw new Error(`Cashier create failed: ${cashierAuthErr?.message}`);
    const testCashierId = cashierAuth.user.id;
    cleanup.userIds.push(testCashierId);

    const managerEmail = `manager-p15-${ts}@test.local`;
    const { data: managerAuth, error: mgrAuthErr } = await adminClient.auth.admin.createUser({
      email: managerEmail,
      password: 'ManagerPassword123!',
      email_confirm: true,
    });
    if (mgrAuthErr || !managerAuth.user) throw new Error(`Manager create failed: ${mgrAuthErr?.message}`);
    const testManagerId = managerAuth.user.id;
    cleanup.userIds.push(testManagerId);

    // Assign roles in user_roles
    const { error: roleErr1 } = await adminClient.from('user_roles').insert({
      user_id: testCashierId,
      business_id: bizA.id,
      branch_id: branchA?.id,
      role: 'cashier',
      daily_points_limit: 10000,
      per_minute_points_limit: 3,
    });
    if (roleErr1) throw new Error(`Cashier role insert error: ${roleErr1.message}`);

    const { error: roleErr2 } = await adminClient.from('user_roles').insert({
      user_id: testManagerId,
      business_id: bizA.id,
      branch_id: branchA?.id,
      role: 'owner',
      manager_pin_hash: hashPin('7777'),
    });
    if (roleErr2) throw new Error(`Manager role insert error: ${roleErr2.message}`);

    // Test Customer PIN Verification with DB
    console.log('  Testing Customer PIN Verification:');
    const custVerifyFallback = await verifyCustomerPin(custA.id, '5678');
    assert(custVerifyFallback === true, 'Customer PIN fallback to last 4 digits of phone works');
    const custVerifyWrong = await verifyCustomerPin(custA.id, '1111');
    assert(custVerifyWrong === false, 'Customer PIN fallback rejects wrong PIN');

    // Set custom PIN '9090'
    await adminClient
      .from('customers')
      .update({ pin_hash: hashPin('9090') })
      .eq('id', custA.id);

    const custVerifyCustom = await verifyCustomerPin(custA.id, '9090');
    assert(custVerifyCustom === true, 'Customer custom PIN verifies correctly');
    const custVerifyOldPhone = await verifyCustomerPin(custA.id, '5678');
    assert(custVerifyOldPhone === false, 'Customer custom PIN overrides phone digits fallback');

    // Test Manager PIN Verification with DB
    console.log('  Testing Manager PIN Verification:');
    const mgrVerifyCorrect = await verifyManagerPin(bizA.id, '7777');
    assert(mgrVerifyCorrect.valid === true && mgrVerifyCorrect.managerId === testManagerId, 'Manager custom PIN verifies successfully');
    const mgrVerifyWrong = await verifyManagerPin(bizA.id, '9999');
    assert(mgrVerifyWrong.valid === false, 'Manager PIN check rejects incorrect PIN');

    // Test Cashier Minute Limit getter
    console.log('  Testing Cashier Minute Limit:');
    const minuteLimitFromDb = await getCashierMinuteLimit(testCashierId, bizA.id);
    assert(minuteLimitFromDb === 3, 'getCashierMinuteLimit loads configured 3 operations/min');

    // Test 4.1: Mandatory Invoice Reference & Duplicate Prevention
    console.log('  Testing Invoice Reference & Deduplication:');
    const testInvoice = `INV-${ts}`;

    // Add 1000 points initially to custA with invoice reference
    const tx1 = await recordPointsTransaction({
      businessId: bizA.id,
      branchId: branchA?.id,
      customerId: custA.id,
      createdBy: testCashierId,
      pointsChange: 1000,
      reason: 'purchase',
      invoiceReference: testInvoice,
    });
    assert(tx1.success === true, 'First transaction with invoice reference succeeds');
    assert(tx1.ledgerRecord?.invoice_reference === testInvoice, 'Transaction stores invoice_reference correctly');

    // Duplicate invoice for SAME business must be rejected
    let duplicateRejected = false;
    let duplicateErrorCode = '';
    try {
      await recordPointsTransaction({
        businessId: bizA.id,
        branchId: branchA?.id,
        customerId: custA.id,
        createdBy: testCashierId,
        pointsChange: 50,
        reason: 'purchase',
        invoiceReference: testInvoice,
      });
    } catch (err: any) {
      duplicateRejected = true;
      duplicateErrorCode = err.code;
    }
    assert(duplicateRejected === true, 'Duplicate invoice for same business is rejected');
    assert(duplicateErrorCode === 'DUPLICATE_INVOICE', 'Duplicate invoice error code is DUPLICATE_INVOICE');

    // Duplicate invoice for DIFFERENT business must be ALLOWED (multi-tenant isolation)
    const tx3 = await recordPointsTransaction({
      businessId: bizB.id,
      branchId: branchB?.id,
      customerId: custB.id,
      createdBy: testCashierId,
      pointsChange: 75,
      reason: 'purchase',
      invoiceReference: testInvoice,
    });
    assert(tx3.success === true, 'Same invoice reference for DIFFERENT business is accepted (scoped uniqueness)');

    // Test 4.2: Per-Minute Rate Limiting
    console.log('  Testing Cashier Per-Minute Rate Limiting:');
    const rateCheckBlocked = await checkCashierMinuteRateLimit(testCashierId, 1);
    assert(!rateCheckBlocked.allowed, 'Rate limit check rejects when limit is 1 and operations exist in last 60s');

    const rateCheckAllowed = await checkCashierMinuteRateLimit(testCashierId, 100);
    assert(rateCheckAllowed.allowed, 'Rate limit check allows when limit is 100');

    // Test 4.3: High-Value Redemption with Customer PIN
    console.log('  Testing High-Value Redemption & Customer PIN:');
    // Customer custA currently has 1000 points. Threshold is 50 points.
    // Attempt redemption of 60 points without PIN -> should fail with CUSTOMER_PIN_REQUIRED
    let pinReqFailed = false;
    let pinReqCode = '';
    try {
      await recordPointsTransaction({
        businessId: bizA.id,
        branchId: branchA?.id,
        customerId: custA.id,
        createdBy: testCashierId,
        pointsChange: -60,
        reason: 'redeem_product',
      });
    } catch (err: any) {
      pinReqFailed = true;
      pinReqCode = err.code;
    }
    assert(pinReqFailed === true, 'High-value redemption (>50) without PIN is rejected');
    assert(pinReqCode === 'CUSTOMER_PIN_REQUIRED', 'Rejection code is CUSTOMER_PIN_REQUIRED');

    // Attempt redemption with WRONG PIN -> should fail with INVALID_CUSTOMER_PIN
    let wrongPinFailed = false;
    let wrongPinCode = '';
    try {
      await recordPointsTransaction({
        businessId: bizA.id,
        branchId: branchA?.id,
        customerId: custA.id,
        createdBy: testCashierId,
        pointsChange: -60,
        reason: 'redeem_product',
        customerPin: '0000',
      });
    } catch (err: any) {
      wrongPinFailed = true;
      wrongPinCode = err.code;
    }
    assert(wrongPinFailed === true, 'High-value redemption with wrong PIN is rejected');
    assert(wrongPinCode === 'INVALID_CUSTOMER_PIN', 'Rejection code is INVALID_CUSTOMER_PIN');

    // Attempt redemption with CORRECT PIN ('9090') -> should succeed
    const redeemCorrect = await recordPointsTransaction({
      businessId: bizA.id,
      branchId: branchA?.id,
      customerId: custA.id,
      createdBy: testCashierId,
      pointsChange: -60,
      reason: 'redeem_product',
      customerPin: '9090',
    });
    assert(redeemCorrect.success === true, 'High-value redemption with correct PIN succeeds');
    assert(redeemCorrect.newBalance === 940, 'Points balance properly deducted (1000 - 60 = 940)');

    // Test 4.4: Owner Daily Review Operations
    console.log('  Testing Owner Daily Review Logic:');
    const { data: dailyRows, error: dailyErr } = await adminClient
      .from('points_ledger')
      .select('id, points_change, invoice_reference, flagged_by_owner, flag_reason')
      .eq('business_id', bizA.id);

    assert(!dailyErr && dailyRows && dailyRows.length >= 2, 'Daily review finds recorded transactions for business A');

    // Flag transaction for review
    const targetTxId = tx1.ledgerRecord.id;
    const { data: flaggedRow, error: flagErr } = await adminClient
      .from('points_ledger')
      .update({
        flagged_by_owner: true,
        flag_reason: 'Suspicious transaction pattern under audit',
      })
      .eq('id', targetTxId)
      .select()
      .single();

    assert(!flagErr && flaggedRow?.flagged_by_owner === true, 'Owner can flag transaction with documentary reason');
    assert(flaggedRow?.flag_reason === 'Suspicious transaction pattern under audit', 'Flag reason is accurately stored');

    // Unflag transaction
    const { data: unflaggedRow, error: unflagErr } = await adminClient
      .from('points_ledger')
      .update({
        flagged_by_owner: false,
        flag_reason: null,
      })
      .eq('id', targetTxId)
      .select()
      .single();

    assert(!unflagErr && unflaggedRow?.flagged_by_owner === false, 'Owner can unflag transaction cleanly');

  } finally {
    // --- Cleanup Test Data ---
    console.log('\n--- Cleaning up test records ---');
    for (const cid of cleanup.customerIds) {
      await adminClient.from('points_ledger').delete().eq('customer_id', cid);
      await adminClient.from('customers').delete().eq('id', cid);
    }
    for (const bid of cleanup.businessIds) {
      await adminClient.from('points_ledger').delete().eq('business_id', bid);
      await adminClient.from('redemption_rates').delete().eq('business_id', bid);
      await adminClient.from('user_roles').delete().eq('business_id', bid);
      await adminClient.from('branches').delete().eq('business_id', bid);
      await adminClient.from('businesses').delete().eq('id', bid);
    }
    for (const uid of cleanup.userIds) {
      await adminClient.auth.admin.deleteUser(uid);
    }
    console.log('  ✅ Cleanup complete.');
  }

  // --- Final Summary ---
  console.log('\n================================================================');
  console.log(`  Tests Passed: ${passed}`);
  console.log(`  Tests Failed: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
