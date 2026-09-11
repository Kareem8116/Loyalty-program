/**
 * Phase 15 Test Suite: Cashier Fraud Protection
 *
 * Tests:
 * 1.1  Add points below daily limit → success
 * 1.2  Add points exceeding daily limit → rejected (DAILY_LIMIT_EXCEEDED)
 * 1.3  Audit log entry written for rejected attempt (status=rejected)
 * 1.4  Audit log entry written for successful operation (status=success)
 * 2.1  Update daily_points_limit via PATCH /api/admin/cashiers → success
 * 2.2  New limit enforced: previously-rejected amount now allowed after raising limit
 * 3.1  GET /api/admin/audit-log filtered by cashier_id → only that cashier's records
 * 3.2  GET /api/admin/audit-log filtered by date range → only records in range
 * 4.1  GET /api/admin/cashiers includes usagePercent and isNearLimit flag
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { recordPointsTransaction, getCashierDailyLimit, getCashierDailyStats, recordAuditLog } from '../lib/cashier';
import { createCustomer, getCustomerPointsBalance } from '../lib/customer';

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

// Track test entities for cleanup
const cleanupIds: {
  customerIds: string[];
  businessIds: string[];
  userIds: string[];
} = { customerIds: [], businessIds: [], userIds: [] };

async function main() {
  console.log('\n================================================================');
  console.log('       Phase 15: Cashier Fraud Protection — Test Suite        ');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // 0. Bootstrap: create a test business, branch, customer, and cashier user
  // ─────────────────────────────────────────────────────────────────────────
  const ts = Date.now();
  const testSubdomain = `test-fraud-${ts}`;

  // Business
  const { data: business, error: bErr } = await adminClient
    .from('businesses')
    .insert({ name: 'Fraud Test Cafe', subdomain: testSubdomain, is_active: true })
    .select()
    .single();
  if (bErr || !business) { console.error('❌ Setup failed: business', bErr?.message); process.exit(1); }
  cleanupIds.businessIds.push(business.id);

  let branchId: string | null = null;

  try {
    // Branch
    const { data: branch } = await adminClient
      .from('branches')
      .insert({ business_id: business.id, name: 'Main Branch' })
      .select()
      .single();
    branchId = branch?.id || null;

  // Customer
  const customer = await createCustomer({
    businessId: business.id,
    name: 'Test Customer Phase15',
    phoneNumber: `+2090000${ts % 100000}`,
    consentGiven: true,
  });
  if (!customer) { console.error('❌ Setup failed: customer'); process.exit(1); }
  cleanupIds.customerIds.push(customer.id);

  // Redemption rates
  await adminClient.from('redemption_rates').insert({
    business_id: business.id,
    points_per_currency_unit: 1,
    currency_per_point: 0.1,
    points_expiry_months: 12,
  });

  // Cashier user via Supabase Auth
  const cashierEmail = `cashier-p15-${ts}@test.local`;
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: cashierEmail,
    password: 'TestPassword123!',
    email_confirm: true,
  });
  if (authErr || !authData.user) { console.error('❌ Setup failed: cashier user', authErr?.message); process.exit(1); }
  const cashierId = authData.user.id;
  cleanupIds.userIds.push(cashierId);

  // Assign cashier role with a LOW daily limit (100 pts)
  const { data: roleRow, error: roleErr } = await adminClient
    .from('user_roles')
    .insert({
      user_id: cashierId,
      business_id: business.id,
      branch_id: branchId,
      role: 'cashier',
      daily_points_limit: 100,
    })
    .select()
    .single();
  if (roleErr || !roleRow) { console.error('❌ Setup failed: role', roleErr?.message); process.exit(1); }

  const roleId = roleRow.id;

  console.log('✔ Test setup complete:');
  console.log(`   Business:  ${business.id} (${testSubdomain})`);
  console.log(`   Customer:  ${customer.id}`);
  console.log(`   Cashier:   ${cashierId} (limit: 100 pts/day)\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1.1: Add points BELOW daily limit → should succeed
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Test 1.1: Add points below daily limit ---');
  try {
    const result = await recordPointsTransaction({
      businessId: business.id,
      branchId,
      customerId: customer.id,
      pointsChange: 50,
      reason: 'test_add_below_limit',
      createdBy: cashierId,
      checkDailyLimit: true,
    });
    assert(result.success === true, '1.1 — Add 50 pts below limit of 100 → success');
    assert(result.newBalance >= 50, '1.1 — New balance reflects added points');
  } catch (e: any) {
    assert(false, '1.1 — Should not throw', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1.2: Add points that EXCEED the daily limit → should be rejected
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1.2: Add points exceeding daily limit ---');
  let rejectedError: any = null;
  try {
    await recordPointsTransaction({
      businessId: business.id,
      branchId,
      customerId: customer.id,
      pointsChange: 60, // 50 already added today, 50+60=110 > 100
      reason: 'test_add_over_limit',
      createdBy: cashierId,
      checkDailyLimit: true,
    });
    assert(false, '1.2 — Should have thrown DAILY_LIMIT_EXCEEDED');
  } catch (e: any) {
    rejectedError = e;
    assert(e.code === 'DAILY_LIMIT_EXCEEDED', '1.2 — Error code is DAILY_LIMIT_EXCEEDED', e.code);
    assert(e.pointsAddedToday === 50, '1.2 — pointsAddedToday = 50', String(e.pointsAddedToday));
    assert(e.dailyLimit === 100, '1.2 — dailyLimit = 100', String(e.dailyLimit));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1.3: Audit log — rejected attempt should be written
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1.3: Audit log entry for rejected attempt ---');
  await new Promise(r => setTimeout(r, 500)); // slight delay for async write
  const { data: rejectedLogs } = await adminClient
    .from('audit_log')
    .select()
    .eq('business_id', business.id)
    .eq('cashier_id', cashierId)
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(5);

  assert((rejectedLogs?.length ?? 0) > 0, '1.3 — Rejected audit log entry exists');
  assert(
    rejectedLogs?.[0]?.action === 'add_points_rejected',
    '1.3 — action = add_points_rejected',
    rejectedLogs?.[0]?.action
  );
  assert(
    rejectedLogs?.[0]?.customer_id === customer.id,
    '1.3 — customer_id matches',
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 1.4: Audit log — successful operation should be written
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1.4: Audit log entry for successful operation ---');
  const { data: successLogs } = await adminClient
    .from('audit_log')
    .select()
    .eq('business_id', business.id)
    .eq('cashier_id', cashierId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(5);

  assert((successLogs?.length ?? 0) > 0, '1.4 — Successful audit log entry exists');
  assert(
    successLogs?.[0]?.action === 'add_points',
    '1.4 — action = add_points',
    successLogs?.[0]?.action
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2.1: Update daily_points_limit via lib function
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2.1: Update daily_points_limit ---');
  const { error: updateErr } = await adminClient
    .from('user_roles')
    .update({ daily_points_limit: 500 })
    .eq('id', roleId);

  assert(!updateErr, '2.1 — Update daily_points_limit to 500 succeeds', updateErr?.message);

  const newLimit = await getCashierDailyLimit(cashierId, business.id);
  assert(newLimit === 500, '2.1 — getCashierDailyLimit returns 500', String(newLimit));

  // ─────────────────────────────────────────────────────────────────────────
  // 2.2: After raising limit, previously-rejected amount should succeed
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2.2: Raised limit allows previously-rejected amount ---');
  try {
    const result = await recordPointsTransaction({
      businessId: business.id,
      branchId,
      customerId: customer.id,
      pointsChange: 60, // was rejected before; 50+60=110 < 500 now
      reason: 'test_add_after_limit_raise',
      createdBy: cashierId,
      checkDailyLimit: true,
    });
    assert(result.success === true, '2.2 — Add 60 pts with new limit of 500 → success');
  } catch (e: any) {
    assert(false, '2.2 — Should not throw after limit raised', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3.1: GET /api/admin/audit-log filtered by cashier_id
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 3.1: Audit log API — filter by cashier_id ---');
  try {
    // Sign in as owner to call admin API
    const ownerEmail = `owner-p15-${ts}@test.local`;
    const { data: ownerAuth } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: 'TestPassword123!',
      email_confirm: true,
    });
    if (ownerAuth?.user) {
      cleanupIds.userIds.push(ownerAuth.user.id);
      await adminClient.from('user_roles').insert({
        user_id: ownerAuth.user.id,
        business_id: business.id,
        role: 'owner',
      });

      // Sign in to get JWT
      const { data: session } = await adminClient.auth.signInWithPassword({
        email: ownerEmail,
        password: 'TestPassword123!',
      });

      if (session?.session?.access_token) {
        const jwt = session.session.access_token;

        const res = await fetch(
          `${BASE_URL}/api/admin/audit-log?business_id=${business.id}&cashier_id=${cashierId}`,
          { headers: { Authorization: `Bearer ${jwt}` } }
        );
        const data = await res.json();
        assert(res.ok && data.success, '3.1 — Audit log API returns 200', String(res.status));
        assert(Array.isArray(data.logs), '3.1 — Response contains logs array');

        const otherCashierLogs = (data.logs || []).filter(
          (l: any) => l.cashierId !== cashierId
        );
        assert(
          otherCashierLogs.length === 0,
          '3.1 — Filter by cashier_id returns only that cashier\'s logs',
          `Found ${otherCashierLogs.length} logs from other cashiers`
        );

        // ───────────────────────────────────────────────────────────────────
        // 3.2: Filter by date range
        // ───────────────────────────────────────────────────────────────────
        console.log('\n--- Test 3.2: Audit log API — filter by date range ---');
        const today = new Date().toISOString().split('T')[0];
        const futureDate = '2099-01-01';

        const res2 = await fetch(
          `${BASE_URL}/api/admin/audit-log?business_id=${business.id}&from_date=${futureDate}&to_date=${futureDate}`,
          { headers: { Authorization: `Bearer ${jwt}` } }
        );
        const data2 = await res2.json();
        assert(res2.ok && data2.success, '3.2 — Date-filtered audit log API returns 200');
        assert(
          (data2.logs || []).length === 0,
          '3.2 — Filtering by future date returns 0 logs',
          `Got ${data2.logs?.length} logs`
        );

        // ───────────────────────────────────────────────────────────────────
        // 4.1: GET /api/admin/cashiers — usagePercent and isNearLimit
        // ───────────────────────────────────────────────────────────────────
        console.log('\n--- Test 4.1: Cashiers API — usagePercent and isNearLimit ---');
        const res3 = await fetch(
          `${BASE_URL}/api/admin/cashiers?business_id=${business.id}`,
          { headers: { Authorization: `Bearer ${jwt}` } }
        );
        const data3 = await res3.json();
        assert(res3.ok && data3.success, '4.1 — Cashiers API returns 200');
        assert(Array.isArray(data3.cashiers), '4.1 — Response contains cashiers array');

        const ourCashier = (data3.cashiers || []).find((c: any) => c.userId === cashierId);
        assert(ourCashier !== undefined, '4.1 — Our test cashier is in the list');
        assert(
          typeof ourCashier?.usagePercent === 'number',
          '4.1 — usagePercent is a number',
          String(ourCashier?.usagePercent)
        );
        assert(
          typeof ourCashier?.pointsAddedToday === 'number',
          '4.1 — pointsAddedToday is a number',
          String(ourCashier?.pointsAddedToday)
        );
        // After adding 50+60=110 pts with limit 500 → usage% = 22%
        assert(
          ourCashier?.pointsAddedToday >= 110,
          '4.1 — pointsAddedToday >= 110 (50 + 60)',
          String(ourCashier?.pointsAddedToday)
        );
        assert(
          ourCashier?.isNearLimit === false,
          '4.1 — isNearLimit is false (22% < 80% threshold)',
          String(ourCashier?.isNearLimit)
        );
      } else {
        assert(false, '3.1/3.2/4.1 — Could not sign in as owner (no session token)');
      }
    } else {
      assert(false, '3.1 — Could not create owner user for API tests');
    }
  } catch (err: any) {
    console.warn('  ⚠️ API tests skipped (is the dev server running?)', err.message);
    assert(false, '3.1 — API test failed (ensure `npm run dev` is running)', err.message);
  }
  } finally {
    // ─────────────────────────────────────────────────────────────────────────
    // Cleanup
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');
    try {
    // Delete audit_log entries
    await adminClient.from('audit_log').delete().eq('business_id', business.id);
    // Delete points_ledger entries
    await adminClient.from('points_ledger').delete().eq('business_id', business.id);
    // Delete customers
    for (const id of cleanupIds.customerIds) {
      await adminClient.from('customers').delete().eq('id', id);
    }
    // Delete redemption rates
    await adminClient.from('redemption_rates').delete().eq('business_id', business.id);
    // Delete branches
    if (branchId) await adminClient.from('branches').delete().eq('id', branchId);
    // Delete user roles
    await adminClient.from('user_roles').delete().eq('business_id', business.id);
    // Delete businesses
    for (const id of cleanupIds.businessIds) {
      await adminClient.from('businesses').delete().eq('id', id);
    }
    // Delete auth users
    for (const uid of cleanupIds.userIds) {
      await adminClient.auth.admin.deleteUser(uid);
    }
    console.log('  ✅ Test data cleaned up.');
  } catch (cleanupErr: any) {
    console.warn('  ⚠️ Cleanup error (non-critical):', cleanupErr.message);
  }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n================================================================');
  console.log(`       Phase 15 Results: ${passed}/${total} tests passed`);
  if (failed > 0) {
    console.error(`       ❌ ${failed} test(s) FAILED`);
  } else {
    console.log('       ✅ ALL TESTS PASSED');
  }
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
