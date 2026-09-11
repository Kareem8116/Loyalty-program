/**
 * Phase 9 Test Suite: Super Admin Dashboard API
 * 
 * Self-contained: creates its own test users and cleans up after.
 * 
 * Tests:
 * 1. Unauthenticated requests get 401
 * 2. Non-super-admin user (owner) gets 403
 * 3. Super Admin GET lists all businesses with stats
 * 4. Super Admin POST creates business + branch + owner atomically
 * 5. POST validation: missing fields, duplicate subdomain, short password
 * 6. Super Admin PATCH toggles is_active with immediate cache invalidation
 * 7. PATCH validation: missing fields, non-existent business
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

// Track resources for cleanup
const cleanupUserIds: string[] = [];
const cleanupBusinessIds: string[] = [];

async function main() {
  console.log('\n=== Phase 9 Test Suite: Super Admin API ===\n');

  // =========================================================================
  // Setup: Create a test super_admin and a test owner
  // =========================================================================
  console.log('[SETUP] Creating test super_admin...');
  const saEmail = `sa-test-${Date.now()}@phase9.local`;
  const saPassword = `SA-Phase9-${Date.now()}!`;
  
  const { data: saUser, error: saErr } = await adminClient.auth.admin.createUser({
    email: saEmail,
    password: saPassword,
    email_confirm: true,
  });
  if (saErr || !saUser.user) throw new Error(`Failed to create test super_admin: ${saErr?.message}`);
  cleanupUserIds.push(saUser.user.id);

  await adminClient.from('user_roles').insert({
    user_id: saUser.user.id,
    role: 'super_admin',
    business_id: null,
    branch_id: null,
  });

  // Sign in to get token
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: saSession } = await anonClient.auth.signInWithPassword({
    email: saEmail,
    password: saPassword,
  });
  const superAdminToken = saSession.session!.access_token;
  console.log(`  Super Admin: ${saEmail}`);

  // Create test business + owner for authorization tests
  console.log('[SETUP] Creating test owner...');
  const { data: testBiz } = await adminClient
    .from('businesses')
    .insert({ name: 'Phase9 Auth Test Biz', subdomain: `auth-test-${Date.now()}` })
    .select()
    .single();
  if (testBiz) cleanupBusinessIds.push(testBiz.id);

  const ownerEmail = `owner-test-${Date.now()}@phase9.local`;
  const ownerPassword = `Owner-Phase9-${Date.now()}!`;
  const { data: ownerUser } = await adminClient.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (ownerUser?.user) {
    cleanupUserIds.push(ownerUser.user.id);
    await adminClient.from('user_roles').insert({
      user_id: ownerUser.user.id,
      business_id: testBiz?.id,
      role: 'owner',
    });
  }
  const { data: ownerSession } = await anonClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  const ownerToken = ownerSession.session?.access_token;
  console.log(`  Owner: ${ownerEmail}\n`);

  // =========================================================================
  // Test 1: Unauthenticated requests
  // =========================================================================
  console.log('--- Test 1: Unauthenticated => 401 ---');
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`);
    assert(res.status === 401, 'GET without auth => 401', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    assert(res.status === 401, 'POST without auth => 401', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: 'x', isActive: false }),
    });
    assert(res.status === 401, 'PATCH without auth => 401', `Got ${res.status}`);
  }

  // =========================================================================
  // Test 2: Owner (non-super-admin) => 403
  // =========================================================================
  console.log('\n--- Test 2: Owner => 403 ---');
  if (ownerToken) {
    {
      const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      assert(res.status === 403, 'Owner GET => 403', `Got ${res.status}`);
    }
    {
      const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'X', subdomain: 'x', ownerEmail: 'x@x.com', ownerPassword: '12345678', branchName: 'X' }),
      });
      assert(res.status === 403, 'Owner POST => 403', `Got ${res.status}`);
    }
    {
      const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ businessId: testBiz?.id, isActive: false }),
      });
      assert(res.status === 403, 'Owner PATCH => 403', `Got ${res.status}`);
    }
  }

  // =========================================================================
  // Test 3: Super Admin GET
  // =========================================================================
  console.log('\n--- Test 3: Super Admin GET ---');
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const body = await res.json();
    assert(res.status === 200, 'GET => 200', `Got ${res.status}`);
    assert(body.success === true, 'success=true');
    assert(Array.isArray(body.businesses), 'businesses is array');
    assert(body.businesses.length >= 1, 'At least 1 business exists', `Got ${body.businesses.length}`);

    const hasBiz = body.businesses.find((b: any) => b.id === testBiz?.id);
    assert(!!hasBiz, 'Test business appears in list');
    if (hasBiz) {
      assert(typeof hasBiz.customer_count === 'number', 'Has customer_count');
      assert(typeof hasBiz.branch_count === 'number', 'Has branch_count');
      assert(typeof hasBiz.subdomain === 'string', 'Has subdomain');
    }
  }

  // =========================================================================
  // Test 4: Super Admin POST - create business
  // =========================================================================
  console.log('\n--- Test 4: Super Admin POST (create business) ---');
  const newSubdomain = `created-${Date.now()}`;
  const newOwnerEmail = `new-owner-${Date.now()}@phase9.local`;
  let createdBizId: string | null = null;
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: 'Created via API',
        subdomain: newSubdomain,
        ownerEmail: newOwnerEmail,
        ownerPassword: 'NewOwner2026!',
        ownerPhone: '+201012345678',
        branchName: 'First Branch',
      }),
    });
    const body = await res.json();
    assert(res.status === 200, 'POST create => 200', `Got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.success === true, 'success=true', JSON.stringify(body));
    if (body.business) {
      createdBizId = body.business.id;
      cleanupBusinessIds.push(createdBizId!);
      assert(body.business.name === 'Created via API', 'Name correct');
      assert(body.business.subdomain === newSubdomain, 'Subdomain correct');
      assert(!!body.business.branch, 'Branch created');
      assert(body.business.owner_email === newOwnerEmail, 'Owner email returned');
    }
  }

  // Verify branch was created in DB
  if (createdBizId) {
    const { data: branches } = await adminClient
      .from('branches')
      .select('name')
      .eq('business_id', createdBizId);
    assert(branches?.length === 1, 'Exactly 1 branch in DB', `Got ${branches?.length}`);
    assert(branches?.[0]?.name === 'First Branch', 'Branch name correct');

    // Verify new owner can sign in
    const { data: newOwnerSession, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: newOwnerEmail,
      password: 'NewOwner2026!',
    });
    assert(!signInErr && !!newOwnerSession?.session, 'New owner can sign in', signInErr?.message);

    // Track the owner for cleanup
    if (newOwnerSession?.session?.user?.id) {
      cleanupUserIds.push(newOwnerSession.session.user.id);
    }
  }

  // =========================================================================
  // Test 5: POST validation
  // =========================================================================
  console.log('\n--- Test 5: POST validation ---');
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({ name: 'Only name' }),
    });
    assert(res.status === 400, 'Missing fields => 400', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: 'No Phone', subdomain: 'no-phone', ownerEmail: 'nophone@test.com', ownerPassword: 'ValidPassword123!', branchName: 'X',
      }),
    });
    assert(res.status === 400, 'Missing ownerPhone => 400', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: 'Dup', subdomain: newSubdomain, ownerEmail: 'dup@test.com', ownerPassword: '12345678', ownerPhone: '+201099998888', branchName: 'X',
      }),
    });
    assert(res.status === 409, 'Duplicate subdomain => 409', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: 'Short', subdomain: 'short-pw', ownerEmail: 'short@test.com', ownerPassword: '123', ownerPhone: '+201099998888', branchName: 'X',
      }),
    });
    assert(res.status === 400, 'Short password => 400', `Got ${res.status}`);
  }

  // =========================================================================
  // Test 6: Super Admin PATCH - toggle + cache invalidation
  // =========================================================================
  console.log('\n--- Test 6: PATCH toggle + cache ---');
  if (createdBizId) {
    // Deactivate
    {
      const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ businessId: createdBizId, isActive: false }),
      });
      const body = await res.json();
      assert(res.status === 200, 'Deactivate => 200', `Got ${res.status}`);
      assert(body.business?.is_active === false, 'Business now inactive');
    }

    // Verify cache invalidation: tenant API should show inactive
    {
      const res = await fetch(`${BASE_URL}/api/tenant`, {
        headers: { 'x-subdomain': newSubdomain, 'x-forwarded-host': `${newSubdomain}.localhost:3000` },
      });
      const body = await res.json();
      const inactive = !body.business || body.business?.is_active === false;
      assert(inactive, 'Deactivated immediately via cache clear', JSON.stringify(body));
    }

    // Re-activate
    {
      const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
        body: JSON.stringify({ businessId: createdBizId, isActive: true }),
      });
      const body = await res.json();
      assert(res.status === 200, 'Re-activate => 200', `Got ${res.status}`);
      assert(body.business?.is_active === true, 'Business now active');
    }
  }

  // =========================================================================
  // Test 7: PATCH validation
  // =========================================================================
  console.log('\n--- Test 7: PATCH validation ---');
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({ businessId: 'missing-bool' }),
    });
    assert(res.status === 400, 'Missing isActive => 400', `Got ${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/super-admin/businesses`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({ businessId: '00000000-0000-0000-0000-000000000000', isActive: false }),
    });
    assert(res.status === 404, 'Non-existent business => 404', `Got ${res.status}`);
  }

  // =========================================================================
  // Cleanup
  // =========================================================================
  console.log('\n[CLEANUP] Removing test data...');
  for (const bizId of cleanupBusinessIds) {
    // Delete roles first, then business (cascade handles branches)
    const { data: roles } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('business_id', bizId);
    if (roles) {
      for (const r of roles) {
        if (!cleanupUserIds.includes(r.user_id)) cleanupUserIds.push(r.user_id);
      }
    }
    await adminClient.from('businesses').delete().eq('id', bizId);
  }
  for (const uid of cleanupUserIds) {
    await adminClient.from('user_roles').delete().eq('user_id', uid);
    await adminClient.auth.admin.deleteUser(uid);
  }
  console.log('  Cleaned up.');

  // =========================================================================
  // Summary
  // =========================================================================
  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
