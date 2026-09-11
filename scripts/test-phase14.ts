/**
 * Phase 14 Test Suite: Points Expiry & Automated Deduction
 * 
 * Tests:
 * 1. Calculation of expires_at when points are added (default 12 months)
 * 2. Support for points_expiry_months = 0 (no expiry)
 * 3. Retroactive expiration deduction via cron job (/api/cron/expire-points)
 * 4. Idempotency: no double-deductions on repeated cron runs
 * 5. 30-day expiration notice in CustomerScreen / getCustomerByQrToken
 * 6. Admin settings API: updating points_expiry_months
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createCustomer, getCustomerByQrToken, getCustomerPointsBalance } from '../lib/customer';
import { recordPointsTransaction, getRedemptionRates } from '../lib/cashier';
import { invalidateCache } from '../lib/redis';

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
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}${detail ? ' -- ' + detail : ''}`);
    failed++;
  }
}

const cleanupCustomerIds: string[] = [];
const cleanupBusinessIds: string[] = [];
const cleanupUserIds: string[] = [];

async function main() {
  console.log('\n=============================================================');
  console.log('       Phase 14: Points Expiry & Auto-Deduction Test Suite     ');
  console.log('=============================================================\n');

  try {
    // 0. Setup test business
    const testSubdomain = `test-expiry-${Date.now()}`;
    const { data: business, error: bErr } = await adminClient
      .from('businesses')
      .insert({
        name: 'Expiry Test Cafe',
        subdomain: testSubdomain,
        is_active: true,
      })
      .select()
      .single();

    if (bErr || !business) throw new Error(`Failed to create test business: ${bErr?.message}`);
    cleanupBusinessIds.push(business.id);

    // Create owner auth user
    const ownerEmail = `owner-${Date.now()}@testexpiry.local`;
    const ownerPassword = 'TestPassword123!';
    const { data: authUser, error: aErr } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
    });
    if (aErr || !authUser.user) throw new Error(`Failed to create owner user: ${aErr?.message}`);
    cleanupUserIds.push(authUser.user.id);

    // Assign owner role
    await adminClient.from('user_roles').insert({
      user_id: authUser.user.id,
      business_id: business.id,
      role: 'owner',
    });

    // Sign in to get JWT token
    const clientAuth = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data: sessionData } = await clientAuth.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    const token = sessionData?.session?.access_token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Host': `${testSubdomain}.localhost:3000`,
    };

    // Create a customer
    const customer = await createCustomer({
      businessId: business.id,
      name: 'Expiry Test Customer',
      phoneNumber: '+201099999999',
      consentGiven: true,
    });
    cleanupCustomerIds.push(customer.id);

    console.log('--- Test 1: Default 12-month Expiration Calculation ---');
    const res1 = await recordPointsTransaction({
      businessId: business.id,
      customerId: customer.id,
      pointsChange: 100,
      reason: 'purchase_bill: 100 EGP',
      client: adminClient,
    });

    assert(Boolean(res1.ledgerRecord?.expires_at), '1.1: Points addition record contains expires_at');
    if (res1.ledgerRecord?.expires_at) {
      const expDate = new Date(res1.ledgerRecord.expires_at);
      const now = new Date();
      // Should be around ~12 months in future
      const diffMonths = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth());
      assert(diffMonths >= 11 && diffMonths <= 13, '1.2: expires_at is roughly 12 months in the future', `diffMonths: ${diffMonths}`);
    }

    console.log('\n--- Test 2: Custom Expiration & Setting 0 (No Expiry) ---');
    // Set points_expiry_months = 0 (no expiry)
    await adminClient.from('redemption_rates').upsert({
      business_id: business.id,
      points_per_currency_unit: 1.0,
      currency_per_point: 0.1,
      points_expiry_months: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });
    await invalidateCache(`redemption_rates:${business.id}`);

    const res2 = await recordPointsTransaction({
      businessId: business.id,
      customerId: customer.id,
      pointsChange: 50,
      reason: 'permanent_bonus',
      client: adminClient,
    });
    assert(res2.ledgerRecord?.expires_at === null, '2.1: When points_expiry_months is 0, expires_at is null');

    console.log('\n--- Test 3: Retroactive Expiry & Cron Job Deduction ---');
    // Add points with past expires_at (simulating points earned 13 months ago)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10); // 10 days ago

    const expiredEntry = await recordPointsTransaction({
      businessId: business.id,
      customerId: customer.id,
      pointsChange: 40,
      reason: 'old_purchase',
      expiresAt: pastDate.toISOString(),
      client: adminClient,
    });

    const balanceBeforeCron = await getCustomerPointsBalance(customer.id);
    assert(balanceBeforeCron === 190, '3.1: Balance before cron includes expired entry (100 + 50 + 40 = 190)', `Balance: ${balanceBeforeCron}`);

    // Call /api/cron/expire-points
    const cronRes = await fetch(`${BASE_URL}/api/cron/expire-points`, {
      method: 'POST',
    });
    const cronData = await cronRes.json();
    assert(cronRes.status === 200 && cronData.success === true, '3.2: /api/cron/expire-points endpoint succeeds');
    assert(cronData.processed >= 1, '3.3: Cron processed at least 1 expired record', `Processed: ${cronData.processed}`);

    const balanceAfterCron = await getCustomerPointsBalance(customer.id);
    assert(balanceAfterCron === 150, '3.4: Balance after cron decreased by 40 (190 - 40 = 150)', `Balance: ${balanceAfterCron}`);

    // Verify deduction record in ledger
    const { data: deductRecord } = await adminClient
      .from('points_ledger')
      .select('id, points_change, reason')
      .eq('customer_id', customer.id)
      .eq('reason', `expired:${expiredEntry.ledgerRecord.id}`)
      .single();

    assert(Boolean(deductRecord), '3.5: Specific deduction record created with reason expired:id');
    assert(deductRecord?.points_change === -40, '3.6: Deducted points exactly matches expired amount (-40)');

    console.log('\n--- Test 4: Idempotency (Repeated Cron Runs) ---');
    const cronRes2 = await fetch(`${BASE_URL}/api/cron/expire-points`, { method: 'POST' });
    const cronData2 = await cronRes2.json();
    const balanceAfterCron2 = await getCustomerPointsBalance(customer.id);
    assert(balanceAfterCron2 === 150, '4.1: Second cron run does not deduct again (Balance remains 150)');

    console.log('\n--- Test 5: 30-Day Upcoming Expiration Warning ---');
    // Add points expiring in 15 days
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 15);

    await recordPointsTransaction({
      businessId: business.id,
      customerId: customer.id,
      pointsChange: 75,
      reason: 'promo_points',
      expiresAt: upcomingDate.toISOString(),
      client: adminClient,
    });

    const customerDetails = await getCustomerByQrToken(customer.qr_token);
    assert(Boolean(customerDetails), '5.1: Customer fetched by QR token');
    assert(
      customerDetails?.expiring_points_30d === 75,
      '5.2: customer.expiring_points_30d accurately reflects 75 points expiring within 30 days',
      `expiring_points_30d: ${customerDetails?.expiring_points_30d}`
    );

    console.log('\n--- Test 6: Admin Settings API for Points Expiry ---');
    const updateSettingsRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        businessId: business.id,
        pointsPerCurrencyUnit: 2.0,
        currencyPerPoint: 0.2,
        pointsExpiryMonths: 6,
      }),
    });
    const updateSettingsData = await updateSettingsRes.json();
    assert(updateSettingsRes.status === 200 && updateSettingsData.success === true, '6.1: PUT /api/admin/settings accepts pointsExpiryMonths: 6');
    assert(updateSettingsData.rates?.points_expiry_months === 6, '6.2: Saved rates return points_expiry_months === 6');

    const getRates = await getRedemptionRates(business.id);
    assert(getRates.points_expiry_months === 6, '6.3: getRedemptionRates returns updated expiry months (6)');

  } catch (err: any) {
    console.error('❌ Unexpected error in Phase 14 test suite:', err);
    failed++;
  } finally {
    console.log('\n--- Cleanup ---');
    if (cleanupCustomerIds.length > 0) {
      await adminClient.from('points_ledger').delete().in('customer_id', cleanupCustomerIds);
      await adminClient.from('customers').delete().in('id', cleanupCustomerIds);
      console.log(`  Cleaned up ${cleanupCustomerIds.length} test customers & ledgers`);
    }
    if (cleanupBusinessIds.length > 0) {
      await adminClient.from('redemption_rates').delete().in('business_id', cleanupBusinessIds);
      await adminClient.from('businesses').delete().in('id', cleanupBusinessIds);
      console.log(`  Cleaned up ${cleanupBusinessIds.length} test businesses`);
    }
    if (cleanupUserIds.length > 0) {
      for (const uid of cleanupUserIds) {
        await adminClient.auth.admin.deleteUser(uid);
      }
      console.log(`  Cleaned up ${cleanupUserIds.length} test auth users`);
    }
  }

  console.log('\n=============================================================');
  console.log(`Phase 14 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in test-phase14:', err);
  process.exit(1);
});
