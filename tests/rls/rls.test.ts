/**
 * RLS Test Suite — Pointat
 * 
 * PLAN.md 2.8: Automated RLS tests that run in CI (GitHub Actions) on every PR
 * and after every migration.
 *
 * Tests verify:
 *   (a) Cross-tenant isolation: any role cannot see data from a different business_id
 *   (b) Cashier cannot UPDATE/DELETE directly on points_ledger
 *   (c) SECURITY DEFINER functions still enforce business_id isolation
 *
 * Usage:
 *   npx jest tests/rls/
 *   OR: node --experimental-vm-modules node_modules/.bin/jest tests/rls/
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *     SUPABASE_SERVICE_ROLE_KEY set to a TEST / STAGING Supabase project.
 *   - The test creates its own isolated data and cleans it up afterwards.
 *   - NEVER run against the production project.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  );
}

// Admin client — bypasses RLS (used only for test setup/teardown)
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a Supabase client authenticated as a specific test user */
function makeUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create a test user via Supabase Auth Admin API and return their access token */
async function createTestUser(
  email: string,
  password: string
): Promise<{ userId: string; accessToken: string }> {
  // Create user
  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !userData.user) {
    throw new Error(`Failed to create test user ${email}: ${createError?.message}`);
  }

  // Sign in to get an access token
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user ${email}: ${signInError?.message}`);
  }

  return {
    userId: userData.user.id,
    accessToken: signInData.session.access_token,
  };
}

/** Delete a test user from Supabase Auth */
async function deleteTestUser(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId);
}

// ============================================================================
// Test State (populated in beforeAll, cleaned in afterAll)
// ============================================================================

let businessA_id: string;
let businessB_id: string;
let branchA_id: string;
let branchB_id: string;
let customerA_id: string;
let customerB_id: string;
let ledgerEntry_id: string;

let ownerA_userId: string;
let ownerA_token: string;
let ownerB_userId: string;
let ownerB_token: string;
let cashierA_userId: string;
let cashierA_token: string;

const TEST_EMAIL_PREFIX = `rls-test-${Date.now()}`;

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeAll(async () => {
  // 1. Create two isolated businesses
  const { data: bizA } = await adminClient
    .from('businesses')
    .insert({ name: 'RLS Test Business A', subdomain: `rls-biz-a-${Date.now()}` })
    .select('id')
    .single();
  businessA_id = bizA!.id;

  const { data: bizB } = await adminClient
    .from('businesses')
    .insert({ name: 'RLS Test Business B', subdomain: `rls-biz-b-${Date.now()}` })
    .select('id')
    .single();
  businessB_id = bizB!.id;

  // 2. Create branches
  const { data: brA } = await adminClient
    .from('branches')
    .insert({ business_id: businessA_id, name: 'Branch A1' })
    .select('id')
    .single();
  branchA_id = brA!.id;

  const { data: brB } = await adminClient
    .from('branches')
    .insert({ business_id: businessB_id, name: 'Branch B1' })
    .select('id')
    .single();
  branchB_id = brB!.id;

  // 3. Create test users
  const ownerA = await createTestUser(`${TEST_EMAIL_PREFIX}-ownerA@test.com`, 'Test1234!');
  ownerA_userId = ownerA.userId;
  ownerA_token = ownerA.accessToken;

  const ownerB = await createTestUser(`${TEST_EMAIL_PREFIX}-ownerB@test.com`, 'Test1234!');
  ownerB_userId = ownerB.userId;
  ownerB_token = ownerB.accessToken;

  const cashierA = await createTestUser(`${TEST_EMAIL_PREFIX}-cashierA@test.com`, 'Test1234!');
  cashierA_userId = cashierA.userId;
  cashierA_token = cashierA.accessToken;

  // 4. Assign roles
  await adminClient.from('user_roles').insert([
    { user_id: ownerA_userId, business_id: businessA_id, role: 'owner' },
    { user_id: ownerB_userId, business_id: businessB_id, role: 'owner' },
    { user_id: cashierA_userId, business_id: businessA_id, branch_id: branchA_id, role: 'cashier' },
  ]);

  // 5. Create test customers
  const { data: custA } = await adminClient
    .from('customers')
    .insert({ business_id: businessA_id, name: 'Customer A', phone_number: '01012345678' })
    .select('id')
    .single();
  customerA_id = custA!.id;

  const { data: custB } = await adminClient
    .from('customers')
    .insert({ business_id: businessB_id, name: 'Customer B', phone_number: '01112345678' })
    .select('id')
    .single();
  customerB_id = custB!.id;

  // 6. Create a ledger entry for Business A
  const { data: ledger } = await adminClient
    .from('points_ledger')
    .insert({
      business_id: businessA_id,
      branch_id: branchA_id,
      customer_id: customerA_id,
      points_change: 100,
      reason: 'rls_test_setup',
      created_by: ownerA_userId,
    })
    .select('id')
    .single();
  ledgerEntry_id = ledger!.id;
}, 60_000);

afterAll(async () => {
  // Cleanup in reverse order
  await adminClient.from('points_ledger').delete().eq('business_id', businessA_id);
  await adminClient.from('points_ledger').delete().eq('business_id', businessB_id);
  await adminClient.from('customers').delete().eq('business_id', businessA_id);
  await adminClient.from('customers').delete().eq('business_id', businessB_id);
  await adminClient.from('user_roles').delete().eq('user_id', ownerA_userId);
  await adminClient.from('user_roles').delete().eq('user_id', ownerB_userId);
  await adminClient.from('user_roles').delete().eq('user_id', cashierA_userId);
  await adminClient.from('branches').delete().eq('business_id', businessA_id);
  await adminClient.from('branches').delete().eq('business_id', businessB_id);
  await adminClient.from('businesses').delete().in('id', [businessA_id, businessB_id]);
  await deleteTestUser(ownerA_userId);
  await deleteTestUser(ownerB_userId);
  await deleteTestUser(cashierA_userId);
}, 60_000);

// ============================================================================
// (a) Cross-Tenant Isolation Tests
// ============================================================================

describe('(a) Cross-Tenant Isolation', () => {
  test('Owner A cannot read customers from Business B', async () => {
    const client = makeUserClient(ownerA_token);
    const { data, error } = await client
      .from('customers')
      .select('id')
      .eq('business_id', businessB_id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS should filter out Business B rows
  });

  test('Owner B cannot read customers from Business A', async () => {
    const client = makeUserClient(ownerB_token);
    const { data, error } = await client
      .from('customers')
      .select('id')
      .eq('business_id', businessA_id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('Owner A can only read their own customers', async () => {
    const client = makeUserClient(ownerA_token);
    const { data, error } = await client.from('customers').select('id, business_id');
    expect(error).toBeNull();
    expect(data?.every((c) => c.business_id === businessA_id)).toBe(true);
  });

  test('Owner A cannot read points_ledger entries from Business B', async () => {
    const client = makeUserClient(ownerA_token);
    const { data, error } = await client
      .from('points_ledger')
      .select('id')
      .eq('business_id', businessB_id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('Cashier A cannot read customers from Business B', async () => {
    const client = makeUserClient(cashierA_token);
    const { data, error } = await client
      .from('customers')
      .select('id')
      .eq('business_id', businessB_id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('Owner A cannot UPDATE business record of Business B', async () => {
    const client = makeUserClient(ownerA_token);
    const { error } = await client
      .from('businesses')
      .update({ name: 'Hacked Name' })
      .eq('id', businessB_id);
    // Should either error or affect 0 rows
    if (!error) {
      // If no error, verify the name was NOT changed
      const { data } = await adminClient
        .from('businesses')
        .select('name')
        .eq('id', businessB_id)
        .single();
      expect(data?.name).toBe('RLS Test Business B');
    }
  });
});

// ============================================================================
// (b) Cashier Points Ledger Immutability
// ============================================================================

describe('(b) Cashier Cannot UPDATE/DELETE points_ledger', () => {
  test('Cashier A cannot UPDATE a points_ledger record', async () => {
    const client = makeUserClient(cashierA_token);
    const { data, error } = await client
      .from('points_ledger')
      .update({ points_change: 9999, reason: 'cashier_tamper_attempt' })
      .eq('id', ledgerEntry_id)
      .select();

    // RLS update policy: only super_admin can UPDATE
    // Either we get an error, or no rows are affected
    if (!error && data) {
      // Verify the actual value was NOT changed
      const { data: fresh } = await adminClient
        .from('points_ledger')
        .select('points_change, reason')
        .eq('id', ledgerEntry_id)
        .single();
      expect(fresh?.points_change).toBe(100);
      expect(fresh?.reason).toBe('rls_test_setup');
    }
  });

  test('Cashier A cannot DELETE a points_ledger record', async () => {
    const client = makeUserClient(cashierA_token);
    await client.from('points_ledger').delete().eq('id', ledgerEntry_id);

    // Verify record still exists
    const { data } = await adminClient
      .from('points_ledger')
      .select('id')
      .eq('id', ledgerEntry_id)
      .single();
    expect(data?.id).toBe(ledgerEntry_id);
  });

  test('Cashier A cannot INSERT points for a different business', async () => {
    const client = makeUserClient(cashierA_token);
    const { data, error } = await client
      .from('points_ledger')
      .insert({
        business_id: businessB_id, // Cross-tenant attempt!
        branch_id: branchB_id,
        customer_id: customerB_id,
        points_change: 50,
        reason: 'cashier_cross_tenant_attack',
        created_by: cashierA_userId,
      })
      .select();

    // Should be rejected by RLS (INSERT policy checks business_id = get_user_business_id())
    if (!error && data && data.length > 0) {
      // If somehow inserted, clean up and fail
      await adminClient.from('points_ledger').delete().eq('reason', 'cashier_cross_tenant_attack');
      throw new Error('SECURITY VIOLATION: Cashier inserted points for a different business!');
    }
    // Either error thrown or 0 rows returned — both are acceptable passing states
    expect(data?.length ?? 0).toBe(0);
  });

  test('Owner A cannot DELETE a points_ledger record (immutable ledger)', async () => {
    const client = makeUserClient(ownerA_token);
    await client.from('points_ledger').delete().eq('id', ledgerEntry_id);

    // Verify record still exists
    const { data } = await adminClient
      .from('points_ledger')
      .select('id')
      .eq('id', ledgerEntry_id)
      .single();
    expect(data?.id).toBe(ledgerEntry_id);
  });
});

// ============================================================================
// (c) SECURITY DEFINER Functions still enforce business_id isolation
// ============================================================================

describe('(c) SECURITY DEFINER helper functions enforce isolation', () => {
  test('get_user_business_id() returns only the calling user business_id', async () => {
    const client = makeUserClient(ownerA_token);
    const { data, error } = await client.rpc('get_user_business_id');
    expect(error).toBeNull();
    expect(data).toBe(businessA_id);
  });

  test('get_user_business_id() for Owner B returns Business B id', async () => {
    const client = makeUserClient(ownerB_token);
    const { data, error } = await client.rpc('get_user_business_id');
    expect(error).toBeNull();
    expect(data).toBe(businessB_id);
  });

  test('get_user_role() returns correct role for Cashier A', async () => {
    const client = makeUserClient(cashierA_token);
    const { data, error } = await client.rpc('get_user_role');
    expect(error).toBeNull();
    expect(data).toBe('cashier');
  });

  test('is_super_admin() returns false for Owner A', async () => {
    const client = makeUserClient(ownerA_token);
    const { data, error } = await client.rpc('is_super_admin');
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
