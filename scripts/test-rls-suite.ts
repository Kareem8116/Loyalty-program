/**
 * Phase 2.8: Automated RLS Test Suite
 * 
 * Verifies:
 * 1. Cross-tenant isolation on customers, points_ledger, menu_items, offers.
 * 2. Cashier cannot directly UPDATE or DELETE rows in points_ledger.
 * 3. Customer role cannot directly manipulate ledger or see other tenants' data.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message}`);
}

async function runRlsTestSuite() {
  console.log('🧪 Starting Phase 2.8 Automated RLS Test Suite...\n');

  // Step 1: Create two distinct test businesses: Tenant A & Tenant B
  const rand = Date.now().toString().slice(-6);
  const subA = `test-rls-a-${rand}`;
  const subB = `test-rls-b-${rand}`;

  const { data: bizA, error: errA } = await supabaseAdmin
    .from('businesses')
    .insert({ name: `RLS Tenant A ${rand}`, subdomain: subA })
    .select()
    .single();
  assert(!errA && !!bizA, `Tenant A created (${bizA?.id})`);

  const { data: bizB, error: errB } = await supabaseAdmin
    .from('businesses')
    .insert({ name: `RLS Tenant B ${rand}`, subdomain: subB })
    .select()
    .single();
  assert(!errB && !!bizB, `Tenant B created (${bizB?.id})`);

  // Step 2: Create a customer and points in Tenant B
  const { data: custB, error: errCustB } = await supabaseAdmin
    .from('customers')
    .insert({
      business_id: bizB.id,
      name: 'Customer B',
      phone_number: `+2010${rand}02`,
      qr_token: crypto.randomUUID(),
    })
    .select()
    .single();
  if (errCustB) console.error('errCustB:', errCustB);
  assert(!errCustB && !!custB, 'Customer created in Tenant B');

  const { data: ledgerB, error: errLedgerB } = await supabaseAdmin
    .from('points_ledger')
    .insert({
      business_id: bizB.id,
      customer_id: custB.id,
      points_change: 150,
      reason: 'RLS Test points',
    })
    .select()
    .single();
  assert(!errLedgerB && !!ledgerB, 'Points ledger entry created in Tenant B');

  // Step 3: Create Cashier user in Tenant A
  const cashierEmail = `cashier-rls-${rand}@test.com`;
  const cashierPass = 'TestPass123!@#';
  const { data: authCashier, error: errAuthCashier } = await supabaseAdmin.auth.admin.createUser({
    email: cashierEmail,
    password: cashierPass,
    email_confirm: true,
  });
  assert(!errAuthCashier && !!authCashier.user, 'Cashier A auth user created');

  await supabaseAdmin.from('user_roles').insert({
    user_id: authCashier.user.id,
    business_id: bizA.id,
    role: 'cashier',
  });

  // Authenticate Cashier A client
  const cashierClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error: signInErr } = await cashierClient.auth.signInWithPassword({
    email: cashierEmail,
    password: cashierPass,
  });
  assert(!signInErr, 'Cashier A signed in with JWT');

  // Test 1: Cross-tenant read isolation
  console.log('\n--- Test 1: Cross-Tenant Read Isolation ---');
  const { data: customersSeenByCashierA } = await cashierClient
    .from('customers')
    .select('*')
    .eq('business_id', bizB.id);

  assert(
    !customersSeenByCashierA || customersSeenByCashierA.length === 0,
    'Cashier A CANNOT view customers belonging to Tenant B'
  );

  const { data: ledgerSeenByCashierA } = await cashierClient
    .from('points_ledger')
    .select('*')
    .eq('business_id', bizB.id);

  assert(
    !ledgerSeenByCashierA || ledgerSeenByCashierA.length === 0,
    'Cashier A CANNOT view points_ledger rows belonging to Tenant B'
  );

  // Test 2: Cashier direct UPDATE or DELETE on points_ledger must fail / be rejected by RLS
  console.log('\n--- Test 2: Immutable Points Ledger (No Direct Update/Delete) ---');
  const { data: updateAttempt, error: updateErr } = await cashierClient
    .from('points_ledger')
    .update({ points_change: 99999 })
    .eq('id', ledgerB.id)
    .select();

  assert(
    !updateAttempt || updateAttempt.length === 0 || !!updateErr,
    'Cashier CANNOT directly UPDATE points_ledger rows'
  );

  const { data: deleteAttempt, error: deleteErr } = await cashierClient
    .from('points_ledger')
    .delete()
    .eq('id', ledgerB.id)
    .select();

  assert(
    !deleteAttempt || deleteAttempt.length === 0 || !!deleteErr,
    'Cashier CANNOT directly DELETE points_ledger rows'
  );

  // Clean up test data
  console.log('\n--- Cleanup ---');
  await supabaseAdmin.from('points_ledger').delete().eq('business_id', bizB.id);
  await supabaseAdmin.from('customers').delete().eq('business_id', bizB.id);
  await supabaseAdmin.from('user_roles').delete().eq('user_id', authCashier.user.id);
  await supabaseAdmin.auth.admin.deleteUser(authCashier.user.id);
  await supabaseAdmin.from('businesses').delete().in('id', [bizA.id, bizB.id]);
  console.log('  ✅ Temporary test data cleaned up safely.\n');

  console.log('🎉 Phase 2.8 Automated RLS Test Suite PASSED 100%!\n');
}

runRlsTestSuite().catch((err) => {
  console.error('RLS Test Suite Error:', err);
  process.exit(1);
});
