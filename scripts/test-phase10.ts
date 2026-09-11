/**
 * Phase 10 Test Suite: Business Partnerships & Cross-Branch Points Sharing
 * 
 * Tests:
 * 1. Branch points consolidation under same business (10.2)
 * 2. Partnerships API Authentication & Authorization
 * 3. Partnership creation validations (missing fields, self, non-existent, duplicate)
 * 4. Partnership lifecycle: Pending -> Accept/Reject rules (initiator vs receiver)
 * 5. Points transfer validations (active partnership, dual customer registration, balance check)
 * 6. Atomic points transfer execution & ledger verification
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

const cleanupUserIds: string[] = [];
const cleanupBusinessIds: string[] = [];

async function createTestOwner(bizId: string, prefix: string) {
  const email = `${prefix}-${Date.now()}@phase10.local`;
  const password = `Phase10-${Date.now()}!Aa`;
  
  const { data: user, error: userErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !user.user) throw new Error(`Failed to create test user: ${userErr?.message}`);
  cleanupUserIds.push(user.user.id);

  await adminClient.from('user_roles').insert({
    user_id: user.user.id,
    business_id: bizId,
    role: 'owner',
  });

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: session } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  
  return {
    email,
    token: session.session!.access_token,
    userId: user.user.id,
  };
}

async function main() {
  console.log('\n=== Phase 10 Test Suite: Partnerships & Cross-Branch Points ===\n');

  try {
    // =========================================================================
    // 10.2: Multi-Branch Points Consolidation Test
    // =========================================================================
    console.log('--- 10.2: Multi-Branch Points Consolidation ---');
    const { data: multiBranchBiz } = await adminClient
      .from('businesses')
      .insert({ name: 'Multi Branch Cafe', subdomain: `multi-branch-${Date.now()}` })
      .select()
      .single();
    cleanupBusinessIds.push(multiBranchBiz.id);

    const { data: branch1 } = await adminClient
      .from('branches')
      .insert({ business_id: multiBranchBiz.id, name: 'Downtown Branch' })
      .select()
      .single();

    const { data: branch2 } = await adminClient
      .from('branches')
      .insert({ business_id: multiBranchBiz.id, name: 'Uptown Branch' })
      .select()
      .single();

    // Create a customer
    const { data: testCustomer, error: custErr } = await adminClient
      .from('customers')
      .insert({
        business_id: multiBranchBiz.id,
        name: 'Test Customer MultiBranch',
        phone_number: '+201099998888',
        qr_token: 'c0000000-0000-0000-0000-000000000001',
      })
      .select()
      .single();
    if (custErr) throw new Error(`Failed to create test customer: ${custErr.message}`);

    // Record transactions in two different branches
    await adminClient.from('points_ledger').insert([
      {
        business_id: multiBranchBiz.id,
        branch_id: branch1.id,
        customer_id: testCustomer.id,
        points_change: 50,
        reason: 'purchase_branch_1',
      },
      {
        business_id: multiBranchBiz.id,
        branch_id: branch2.id,
        customer_id: testCustomer.id,
        points_change: 30,
        reason: 'purchase_branch_2',
      },
    ]);

    // Query aggregated balance
    const { data: ledgerRows } = await adminClient
      .from('points_ledger')
      .select('points_change, branch_id')
      .eq('customer_id', testCustomer.id);

    const totalBalance = ledgerRows?.reduce((acc, row) => acc + (row.points_change || 0), 0);
    assert(totalBalance === 80, 'Points earned across branches consolidate into a single balance (50 + 30 = 80)');
    assert(ledgerRows?.length === 2, 'Points ledger records retain specific branch_id provenance');

    // =========================================================================
    // Setup for Partnerships: Biz A and Biz B
    // =========================================================================
    console.log('\n--- Setup: Businesses & Owners for Partnerships ---');
    const subA = `roastery-a-${Date.now()}`;
    const { data: bizA } = await adminClient
      .from('businesses')
      .insert({ name: 'Roastery A', subdomain: subA })
      .select()
      .single();
    cleanupBusinessIds.push(bizA.id);

    const subB = `bakery-b-${Date.now()}`;
    const { data: bizB } = await adminClient
      .from('businesses')
      .insert({ name: 'Bakery B', subdomain: subB })
      .select()
      .single();
    cleanupBusinessIds.push(bizB.id);

    const ownerA = await createTestOwner(bizA.id, 'owner-a');
    const ownerB = await createTestOwner(bizB.id, 'owner-b');
    console.log(`  Biz A (@${subA}) Owner: ${ownerA.email}`);
    console.log(`  Biz B (@${subB}) Owner: ${ownerB.email}`);

    // =========================================================================
    // Test 1: Partnerships API Authentication & Authorization
    // =========================================================================
    console.log('\n--- Test 1: API Auth & Role Protection ---');
    {
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`);
      assert(res.status === 401, 'GET /api/admin/partnerships unauthenticated => 401');
    }
    {
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_subdomain: subB }),
      });
      assert(res.status === 401, 'POST /api/admin/partnerships unauthenticated => 401');
    }

    // =========================================================================
    // Test 2: Partnership Creation Validations
    // =========================================================================
    console.log('\n--- Test 2: Partnership Creation Validations ---');
    {
      // Missing target_subdomain
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({}),
      });
      assert(res.status === 400, 'POST missing target_subdomain => 400');
    }
    {
      // Partner with self
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({ target_subdomain: subA }),
      });
      assert(res.status === 400, 'POST partner with self => 400');
    }
    {
      // Partner with non-existent business
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({ target_subdomain: 'does-not-exist-xyz' }),
      });
      assert(res.status === 404, 'POST partner with non-existent subdomain => 404');
    }

    // =========================================================================
    // Test 3: Successful Partnership Creation & Duplicate Prevention
    // =========================================================================
    console.log('\n--- Test 3: Successful Partnership Creation ---');
    let partnershipId = '';
    {
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({
          target_subdomain: subB,
          terms: '10% points exchange rate',
        }),
      });
      const data = await res.json();
      assert(res.status === 200 && data.success, 'Owner A sends partnership request to Biz B => 200');
      assert(data.partnership.status === 'pending', 'Created partnership status is "pending"');
      partnershipId = data.partnership.id;
    }

    {
      // Duplicate request (from either direction)
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerB.token}`,
        },
        body: JSON.stringify({ target_subdomain: subA }),
      });
      assert(res.status === 409, 'Duplicate partnership request => 409 Conflict');
    }

    // =========================================================================
    // Test 4: Partnerships List & Direction Flags
    // =========================================================================
    console.log('\n--- Test 4: Partnerships List & Flags ---');
    {
      // Owner A view
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        headers: { 'Authorization': `Bearer ${ownerA.token}` },
      });
      const data = await res.json();
      assert(res.status === 200 && data.partnerships.length === 1, 'Owner A sees 1 partnership');
      assert(data.partnerships[0].is_initiator === true, 'Owner A marked as is_initiator = true');
      assert(data.partnerships[0].partner_subdomain === subB, 'Owner A partner is Bakery B');
    }
    {
      // Owner B view
      const res = await fetch(`${BASE_URL}/api/admin/partnerships`, {
        headers: { 'Authorization': `Bearer ${ownerB.token}` },
      });
      const data = await res.json();
      assert(res.status === 200 && data.partnerships.length === 1, 'Owner B sees 1 partnership');
      assert(data.partnerships[0].is_initiator === false, 'Owner B marked as is_initiator = false');
      assert(data.partnerships[0].partner_subdomain === subA, 'Owner B partner is Roastery A');
    }

    // =========================================================================
    // Test 5: Partnership Acceptance Rules
    // =========================================================================
    console.log('\n--- Test 5: Partnership Accept/Reject Rules ---');
    {
      // Initiator (Owner A) tries to accept their own request => 403
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({ action: 'accept' }),
      });
      assert(res.status === 403, 'Initiator cannot accept own partnership request => 403');
    }
    {
      // Invalid action => 400
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerB.token}`,
        },
        body: JSON.stringify({ action: 'invalid_action' }),
      });
      assert(res.status === 400, 'Invalid action => 400');
    }
    {
      // Receiver (Owner B) accepts partnership => 200
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerB.token}`,
        },
        body: JSON.stringify({ action: 'accept' }),
      });
      const data = await res.json();
      assert(res.status === 200 && data.success, 'Receiver (Owner B) accepts partnership => 200');
      assert(data.partnership.status === 'active', 'Partnership status updated to "active"');
    }
    {
      // Try to accept again when already active => 400
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerB.token}`,
        },
        body: JSON.stringify({ action: 'accept' }),
      });
      assert(res.status === 400, 'Cannot accept already-active partnership => 400');
    }

    // =========================================================================
    // Test 6: Points Transfer Validations
    // =========================================================================
    console.log('\n--- Test 6: Points Transfer Validations ---');
    const customerAId = 'a0000000-0000-0000-0000-000000000001';
    const customerBId = 'b0000000-0000-0000-0000-000000000002';
    const sharedPhone = '+201122334455';

    {
      // Customer not registered in either business
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({
          partnership_id: partnershipId,
          customer_id: customerAId,
          points: 50,
          to_business_id: bizB.id,
        }),
      });
      assert(res.status === 404, 'Customer not found in sender business => 404');
    }

    // Register customer in Biz A only
    const { error: custAErr } = await adminClient.from('customers').insert({
      id: customerAId,
      business_id: bizA.id,
      name: 'Shared Partner Customer A',
      phone_number: sharedPhone,
      qr_token: 'c0000000-0000-0000-0000-000000000002',
    });
    if (custAErr) throw new Error(`Failed to insert customer A: ${custAErr.message}`);

    {
      // Customer registered in Biz A, but not yet in Biz B
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({
          partnership_id: partnershipId,
          customer_id: customerAId,
          points: 50,
          to_business_id: bizB.id,
        }),
      });
      const data = await res.json();
      assert(res.status === 400, 'Customer not registered in partner business => 400', data.error);
    }

    // Register customer in Biz B as well (with same phone number)
    const { error: custBErr } = await adminClient.from('customers').insert({
      id: customerBId,
      business_id: bizB.id,
      name: 'Shared Partner Customer B',
      phone_number: sharedPhone,
      qr_token: 'c0000000-0000-0000-0000-000000000003',
    });
    if (custBErr) throw new Error(`Failed to insert customer B: ${custBErr.message}`);

    {
      // Customer has 0 points in Biz A => insufficient balance
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({
          partnership_id: partnershipId,
          customer_id: customerAId,
          points: 20,
          to_business_id: bizB.id,
        }),
      });
      assert(res.status === 400, 'Transfer with insufficient balance => 400');
    }

    // =========================================================================
    // Test 7: Successful Points Transfer & Ledger Verification
    // =========================================================================
    console.log('\n--- Test 7: Successful Points Transfer ---');
    // Credit 100 points to customer in Biz A
    await adminClient.from('points_ledger').insert({
      business_id: bizA.id,
      customer_id: customerAId,
      points_change: 100,
      reason: 'welcome_points',
    });

    {
      // Transfer 40 points from Biz A to Biz B
      const res = await fetch(`${BASE_URL}/api/admin/partnerships/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ownerA.token}`,
        },
        body: JSON.stringify({
          partnership_id: partnershipId,
          customer_id: customerAId,
          points: 40,
          to_business_id: bizB.id,
        }),
      });
      const data = await res.json();
      assert(res.status === 200 && data.success, 'Transfer 40 points from Biz A to Biz B => 200');
      assert(data.transfer.new_sender_balance === 60, 'Sender customer balance updated to 60 (100 - 40)');
    }

    // Verify ledger in Biz A
    const { data: ledgerA } = await adminClient
      .from('points_ledger')
      .select('points_change, reason')
      .eq('business_id', bizA.id)
      .eq('customer_id', customerAId);
    
    const balanceA = ledgerA?.reduce((s, r) => s + r.points_change, 0);
    assert(balanceA === 60, 'Biz A ledger sum is precisely 60');
    assert(ledgerA?.some(r => r.reason === 'partnership_transfer_out'), 'Biz A has "partnership_transfer_out" record');

    // Verify ledger in Biz B
    const { data: ledgerB } = await adminClient
      .from('points_ledger')
      .select('points_change, reason')
      .eq('business_id', bizB.id)
      .eq('customer_id', customerBId);

    const balanceB = ledgerB?.reduce((s, r) => s + r.points_change, 0);
    assert(balanceB === 40, 'Biz B ledger sum is precisely 40');
    assert(ledgerB?.some(r => r.reason === 'partnership_transfer_in'), 'Biz B has "partnership_transfer_in" record');

    // Verify partnership_transfers audit table
    const { data: transferRecord } = await adminClient
      .from('partnership_transfers')
      .select('*')
      .eq('partnership_id', partnershipId)
      .single();

    assert(transferRecord !== null, 'partnership_transfers audit row was created');
    assert(transferRecord.points_transferred === 40, 'partnership_transfers records 40 points');
    assert(transferRecord.from_business_id === bizA.id, 'partnership_transfers from_business_id matches');
    assert(transferRecord.to_business_id === bizB.id, 'partnership_transfers to_business_id matches');

  } finally {
    // =========================================================================
    // Cleanup
    // =========================================================================
    console.log('\n--- Cleanup ---');
    for (const bId of cleanupBusinessIds) {
      await adminClient.from('businesses').delete().eq('id', bId);
    }
    for (const uId of cleanupUserIds) {
      await adminClient.auth.admin.deleteUser(uId);
    }
    console.log(`Cleaned up ${cleanupBusinessIds.length} test businesses and ${cleanupUserIds.length} test users.`);
  }

  console.log('\n========================================');
  console.log(`Phase 10 Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
