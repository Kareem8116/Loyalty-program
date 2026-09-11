/**
 * ==============================================================================
 * Phase 18: Customer Transaction History (سجل العمليات للعميل) — Automated Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Transaction history parsing and chronological sorting (newest first).
 * 2. Item name extraction for menu item redemptions.
 * 3. Accurate transaction typing ('earned', 'redeemed', 'expired', 'referral').
 * 4. API endpoint (/api/customer/[token]/history) with validation and pagination.
 * 5. Data Isolation & Privacy (PLAN.md 18.3):
 *    - Customer 1 CANNOT see Customer 2's transactions.
 *    - Customer 2 CANNOT see Customer 1's transactions.
 *    - Direct anon Supabase client CANNOT query points_ledger (blocked by RLS).
 * ==============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '../lib/supabase';
import { getCustomerTransactionHistory, parseTransactionDetails, getCustomerHistoryByToken } from '../lib/history';
import { recordPointsTransaction } from '../lib/cashier';

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const adminClient = getServiceSupabase();

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failedTests++;
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhase18Tests() {
  console.log('\n================================================================');
  console.log('       Phase 18: Customer Transaction History — Test Suite      ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let businessId = '';
  let customer1Id = '';
  let customer2Id = '';
  let customer1Token = '';
  let customer2Token = '';

  try {
    // 0. Bootstrap test environment
    console.log('0. Bootstrapping test environment...');
    const { data: business, error: bizErr } = await adminClient
      .from('businesses')
      .insert({
        name: `Test Cafe Hist ${testSuffix}`,
        subdomain: `test-hist-${testSuffix}`,
      })
      .select()
      .single();

    if (bizErr || !business) {
      throw new Error(`Failed to create test business: ${bizErr?.message}`);
    }
    businessId = business.id;

    // Create Customer 1
    const { data: cust1, error: c1Err } = await adminClient
      .from('customers')
      .insert({
        business_id: businessId,
        name: `Customer One ${testSuffix}`,
        phone_number: `+20101111${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (c1Err || !cust1) {
      throw new Error(`Failed to create customer 1: ${c1Err?.message}`);
    }
    customer1Id = cust1.id;
    customer1Token = cust1.qr_token;

    // Create Customer 2
    const { data: cust2, error: c2Err } = await adminClient
      .from('customers')
      .insert({
        business_id: businessId,
        name: `Customer Two ${testSuffix}`,
        phone_number: `+20102222${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (c2Err || !cust2) {
      throw new Error(`Failed to create customer 2: ${c2Err?.message}`);
    }
    customer2Id = cust2.id;
    customer2Token = cust2.qr_token;

    console.log(`   Business ID: ${businessId}`);
    console.log(`   Customer 1 ID: ${customer1Id} (Token: ${customer1Token})`);
    console.log(`   Customer 2 ID: ${customer2Id} (Token: ${customer2Token})\n`);

    // 1. Insert diverse transactions for Customer 1 with small pauses to ensure strictly different timestamps
    console.log('--- Test Group 1: Parser & Transaction History Library ---');

    // 1.1 Customer 1: Purchase (+100)
    await recordPointsTransaction({
      businessId,
      customerId: customer1Id,
      pointsChange: 100,
      reason: 'purchase_bill: 100 EGP',
    });
    await sleep(50);

    // 1.2 Customer 1: Redemption (-40 for Spanish Latte)
    await recordPointsTransaction({
      businessId,
      customerId: customer1Id,
      pointsChange: -40,
      reason: 'menu_item_redemption: Spanish Latte',
    });
    await sleep(50);

    // 1.3 Customer 1: Expiry (-10)
    await recordPointsTransaction({
      businessId,
      customerId: customer1Id,
      pointsChange: -10,
      reason: 'expired',
    });
    await sleep(50);

    // 1.4 Customer 1: Referral (+50)
    await recordPointsTransaction({
      businessId,
      customerId: customer1Id,
      pointsChange: 50,
      reason: 'referral',
    });
    await sleep(50);

    // 1.5 Customer 2: Transactions
    await recordPointsTransaction({
      businessId,
      customerId: customer2Id,
      pointsChange: 200,
      reason: 'purchase_bill: 200 EGP',
    });
    await sleep(50);

    await recordPointsTransaction({
      businessId,
      customerId: customer2Id,
      pointsChange: -75,
      reason: 'menu_item_redemption: Cold Brew',
    });

    // Test parser directly
    const p1 = parseTransactionDetails(100, 'purchase_bill: 100 EGP');
    assert(p1.type === 'earned' && p1.itemName === null, '1.1 Parser identifies earned points and null item');

    const p2 = parseTransactionDetails(-40, 'menu_item_redemption: Spanish Latte');
    assert(p2.type === 'redeemed' && p2.itemName === 'Spanish Latte', '1.2 Parser extracts menu item name and redeemed type');

    const p3 = parseTransactionDetails(-10, 'expired');
    assert(p3.type === 'expired' && p3.itemName === null, '1.3 Parser identifies expired points');

    const p4 = parseTransactionDetails(50, 'referral');
    assert(p4.type === 'referral' && p4.itemName === null, '1.4 Parser identifies referral points');

    // Test getCustomerTransactionHistory
    const hist1 = await getCustomerTransactionHistory(customer1Id, businessId);
    assert(hist1.length === 4, '1.5 getCustomerTransactionHistory returns all 4 records for Customer 1');

    // Chronological order: referral (newest), expired, redeemed, earned (oldest)
    assert(hist1[0].type === 'referral' && hist1[0].points_change === 50, '1.6 First record is newest (referral, +50)');
    assert(hist1[1].type === 'expired' && hist1[1].points_change === -10, '1.7 Second record is expired (-10)');
    assert(hist1[2].type === 'redeemed' && hist1[2].item_name === 'Spanish Latte', '1.8 Third record is redemption with item_name "Spanish Latte"');
    assert(hist1[3].type === 'earned' && hist1[3].points_change === 100, '1.9 Fourth record is oldest (earned, +100)');

    // Test helper getCustomerHistoryByToken
    const tokenResult = await getCustomerHistoryByToken(customer1Token);
    assert(tokenResult !== null && tokenResult.transactions.length === 4, '1.10 getCustomerHistoryByToken returns history matching QR token');

    // 2. Test API Endpoint
    console.log('\n--- Test Group 2: Customer History API Endpoint ---');
    const { GET } = await import('../app/api/customer/[token]/history/route');

    // 2.1 Valid request for Customer 1
    const req1 = new Request(`http://localhost:3000/api/customer/${customer1Token}/history`, {
      headers: { 'x-forwarded-for': `192.168.1.${testSuffix.slice(-2)}` },
    });
    const res1 = await GET(req1 as any, { params: Promise.resolve({ token: customer1Token }) });
    const data1 = await res1.json();

    assert(res1.status === 200, '2.1 API returns HTTP 200 for valid customer token');
    assert(data1.success === true, '2.1 API response success is true');
    assert(data1.transactions.length === 4, '2.1 API returns 4 transactions for Customer 1');
    assert(data1.transactions[2].item_name === 'Spanish Latte', '2.1 API preserves extracted item_name');

    // 2.2 Limit parameter
    const reqLimit = new Request(`http://localhost:3000/api/customer/${customer1Token}/history?limit=2`, {
      headers: { 'x-forwarded-for': `192.168.1.${testSuffix.slice(-2)}` },
    });
    const resLimit = await GET(reqLimit as any, { params: Promise.resolve({ token: customer1Token }) });
    const dataLimit = await resLimit.json();
    assert(dataLimit.transactions.length === 2, '2.2 Limit query param restricts results to requested count');

    // 2.3 Invalid token format (non-UUID)
    const reqInvalid = new Request(`http://localhost:3000/api/customer/invalid-token-123/history`);
    const resInvalid = await GET(reqInvalid as any, { params: Promise.resolve({ token: 'invalid-token-123' }) });
    assert(resInvalid.status === 400, '2.3 API rejects non-UUID token format with HTTP 400');

    // 2.4 Non-existent UUID token
    const nonExistentToken = 'a0000000-0000-0000-0000-000000000000';
    const req404 = new Request(`http://localhost:3000/api/customer/${nonExistentToken}/history`);
    const res404 = await GET(req404 as any, { params: Promise.resolve({ token: nonExistentToken }) });
    assert(res404.status === 404, '2.4 API returns HTTP 404 for non-existent token');

    // 3. Test Isolation & Privacy (18.3)
    console.log('\n--- Test Group 3: Isolation & Privacy Enforcement (PLAN 18.3) ---');

    // 3.1 Customer 2 history check
    const req2 = new Request(`http://localhost:3000/api/customer/${customer2Token}/history`, {
      headers: { 'x-forwarded-for': `192.168.2.${testSuffix.slice(-2)}` },
    });
    const res2 = await GET(req2 as any, { params: Promise.resolve({ token: customer2Token }) });
    const data2 = await res2.json();

    assert(data2.transactions.length === 2, '3.1 Customer 2 API returns exactly 2 transactions');

    // Cross-isolation checks: Customer 1 sees NO Customer 2 transactions
    const c1HasC2Tx = data1.transactions.some((t: any) => t.item_name === 'Cold Brew' || t.points_change === 200);
    assert(!c1HasC2Tx, '3.2 Customer 1 cannot see Customer 2 transactions (zero cross-exposure)');

    // Customer 2 sees NO Customer 1 transactions
    const c2HasC1Tx = data2.transactions.some((t: any) => t.item_name === 'Spanish Latte' || t.points_change === 100);
    assert(!c2HasC1Tx, '3.3 Customer 2 cannot see Customer 1 transactions (zero cross-exposure)');

    // Ensure IDs are strictly disjoint
    const c1Ids = new Set(data1.transactions.map((t: any) => t.id));
    const c2Ids = new Set(data2.transactions.map((t: any) => t.id));
    const intersection = [...c1Ids].filter((id) => c2Ids.has(id));
    assert(intersection.length === 0, '3.4 Transaction IDs across Customer 1 and Customer 2 are completely disjoint');

    // 3.5 Direct Anon Supabase client RLS test: Anon cannot query points_ledger
    const { data: anonRows, error: anonErr } = await anonClient
      .from('points_ledger')
      .select('id, points_change, reason')
      .eq('business_id', businessId);

    assert(
      (anonRows?.length || 0) === 0,
      '3.5 RLS Policy: Direct unauthenticated anon query to points_ledger returns 0 rows',
      anonErr?.message
    );

  } catch (err: any) {
    console.error('Unexpected error during test execution:', err);
    failedTests++;
  } finally {
    // Cleanup
    console.log('\n--- Cleanup Test Data ---');
    if (businessId) {
      // Cascade delete deletes customers and points_ledger records
      await adminClient.from('businesses').delete().eq('id', businessId);
      console.log('  🧹 Cleaned up test business and associated customer transactions.');
    }
  }

  console.log('\n================================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase18Tests();
