import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase2FixTest() {
  console.log('🚀 Testing Phase 2 FIX: Branch-Level RLS Isolation...\n');

  let bizId: string | null = null;
  const createdUsers: string[] = [];

  try {
    // ---- Setup: 1 business, 2 branches, 2 cashiers (one per branch) ----
    console.log('1️⃣ Setting up test data...');

    const { data: biz, error: bizErr } = await adminClient
      .from('businesses')
      .insert({ name: 'Multi-Branch Cafe', subdomain: `multi-branch-${Date.now()}` })
      .select().single();
    if (bizErr) throw bizErr;
    bizId = biz.id;

    const { data: branchA, error: brAErr } = await adminClient
      .from('branches')
      .insert({ business_id: bizId, name: 'Branch Downtown' })
      .select().single();
    if (brAErr) throw brAErr;

    const { data: branchB, error: brBErr } = await adminClient
      .from('branches')
      .insert({ business_id: bizId, name: 'Branch Mall' })
      .select().single();
    if (brBErr) throw brBErr;

    // Customer is business-wide
    const { data: customer, error: custErr } = await adminClient
      .from('customers')
      .insert({ business_id: bizId, name: 'Shared Customer', phone_number: '+201099999999' })
      .select().single();
    if (custErr) throw custErr;

    // Points entries for each branch
    await adminClient.from('points_ledger').insert({
      business_id: bizId, branch_id: branchA.id, customer_id: customer.id,
      points_change: 10, reason: 'order_branchA'
    });
    await adminClient.from('points_ledger').insert({
      business_id: bizId, branch_id: branchB.id, customer_id: customer.id,
      points_change: 20, reason: 'order_branchB'
    });

    // Menu items per branch
    await adminClient.from('menu_items').insert({
      business_id: bizId, branch_id: branchA.id, name: 'Downtown Latte', price: 50
    });
    await adminClient.from('menu_items').insert({
      business_id: bizId, branch_id: branchB.id, name: 'Mall Cappuccino', price: 60
    });
    await adminClient.from('menu_items').insert({
      business_id: bizId, branch_id: null, name: 'Water (all branches)', price: 10
    });

    console.log('   ✅ Business, 2 branches, customer, ledger entries, and menu items created.');

    // ---- Create Owner ----
    const ownerEmail = `owner-fix-${Date.now()}@example.com`;
    const ownerPass = `OwnerPass!${Date.now()}`;
    const { data: ownerAuth } = await adminClient.auth.admin.createUser({
      email: ownerEmail, password: ownerPass, email_confirm: true
    });
    createdUsers.push(ownerAuth!.user.id);
    await adminClient.from('user_roles').insert({
      user_id: ownerAuth!.user.id, business_id: bizId, role: 'owner'
    });

    // ---- Create Cashier A (Branch Downtown) ----
    const cashierAEmail = `cashier-a-fix-${Date.now()}@example.com`;
    const cashierAPass = `CashierAPass!${Date.now()}`;
    const { data: cashierAAuth } = await adminClient.auth.admin.createUser({
      email: cashierAEmail, password: cashierAPass, email_confirm: true
    });
    createdUsers.push(cashierAAuth!.user.id);
    await adminClient.from('user_roles').insert({
      user_id: cashierAAuth!.user.id, business_id: bizId, branch_id: branchA.id, role: 'cashier'
    });

    // ---- Create Cashier B (Branch Mall) ----
    const cashierBEmail = `cashier-b-fix-${Date.now()}@example.com`;
    const cashierBPass = `CashierBPass!${Date.now()}`;
    const { data: cashierBAuth } = await adminClient.auth.admin.createUser({
      email: cashierBEmail, password: cashierBPass, email_confirm: true
    });
    createdUsers.push(cashierBAuth!.user.id);
    await adminClient.from('user_roles').insert({
      user_id: cashierBAuth!.user.id, business_id: bizId, branch_id: branchB.id, role: 'cashier'
    });

    console.log('   ✅ Owner + 2 Cashiers (per branch) created.\n');

    // ========== TEST: Owner sees everything ==========
    console.log('2️⃣ Testing Owner sees ALL branches, ledger entries, and menu items:');
    const ownerClient = createClient(supabaseUrl, anonKey);
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPass });

    const { data: ownerBranches } = await ownerClient.from('branches').select('name');
    const { data: ownerLedger } = await ownerClient.from('points_ledger').select('reason');
    const { data: ownerMenu } = await ownerClient.from('menu_items').select('name');

    console.log(`   Branches: ${ownerBranches?.length} (expected 2) ${ownerBranches?.length === 2 ? '✅' : '❌'}`);
    console.log(`   Ledger entries: ${ownerLedger?.length} (expected 2) ${ownerLedger?.length === 2 ? '✅' : '❌'}`);
    console.log(`   Menu items: ${ownerMenu?.length} (expected 3) ${ownerMenu?.length === 3 ? '✅' : '❌'}`);

    if (ownerBranches?.length !== 2 || ownerLedger?.length !== 2 || ownerMenu?.length !== 3) {
      throw new Error('Owner does not see all data!');
    }

    // ========== TEST: Cashier A sees only Branch Downtown ==========
    console.log('\n3️⃣ Testing Cashier A (Branch Downtown) — branch-level isolation:');
    const cashierAClient = createClient(supabaseUrl, anonKey);
    await cashierAClient.auth.signInWithPassword({ email: cashierAEmail, password: cashierAPass });

    const { data: cashABranches } = await cashierAClient.from('branches').select('name');
    const { data: cashALedger } = await cashierAClient.from('points_ledger').select('reason');
    const { data: cashAMenu } = await cashierAClient.from('menu_items').select('name');

    const cashASeesDowntown = cashABranches?.some(b => b.name === 'Branch Downtown');
    const cashASeesMall = cashABranches?.some(b => b.name === 'Branch Mall');

    console.log(`   Branches seen: ${cashABranches?.length} — Downtown: ${cashASeesDowntown ? '✅' : '❌'} | Mall: ${cashASeesMall ? '❌ LEAK' : '✅ Hidden'}`);
    console.log(`   Ledger entries: ${cashALedger?.length} (expected 1, own branch) ${cashALedger?.length === 1 ? '✅' : '❌'}`);

    // Menu items: should see own branch + business-wide (null branch)
    const cashAMenuNames = cashAMenu?.map(m => m.name) || [];
    const seesDowntownLatte = cashAMenuNames.includes('Downtown Latte');
    const seesMallCappuccino = cashAMenuNames.includes('Mall Cappuccino');
    const seesWater = cashAMenuNames.includes('Water (all branches)');
    console.log(`   Menu — Downtown Latte: ${seesDowntownLatte ? '✅' : '❌'} | Mall Cappuccino: ${seesMallCappuccino ? '❌ LEAK' : '✅ Hidden'} | Water (shared): ${seesWater ? '✅' : '❌'}`);

    if (cashASeesMall || seesMallCappuccino) {
      throw new Error('BRANCH ISOLATION FAILED: Cashier A sees Branch Mall data!');
    }

    // ========== TEST: Cashier A can insert points only for own branch ==========
    console.log('\n4️⃣ Testing Cashier A can only add points for own branch:');
    const { error: ownBranchInsertErr } = await cashierAClient.from('points_ledger').insert({
      business_id: bizId, branch_id: branchA.id, customer_id: customer.id,
      points_change: 5, reason: 'cashier_a_reward'
    });
    console.log(`   Insert for own branch (Downtown): ${ownBranchInsertErr ? '❌ ' + ownBranchInsertErr.message : '✅ Success'}`);

    const { error: otherBranchInsertErr } = await cashierAClient.from('points_ledger').insert({
      business_id: bizId, branch_id: branchB.id, customer_id: customer.id,
      points_change: 5, reason: 'illegal_cross_branch'
    });
    console.log(`   Insert for other branch (Mall): ${otherBranchInsertErr ? '✅ Blocked' : '❌ LEAK — should have been blocked!'}`);

    if (!otherBranchInsertErr) {
      throw new Error('BRANCH ISOLATION FAILED: Cashier A inserted points for Branch Mall!');
    }

    // ========== TEST: Cashier B sees only Branch Mall ==========
    console.log('\n5️⃣ Testing Cashier B (Branch Mall) — confirming symmetric isolation:');
    const cashierBClient = createClient(supabaseUrl, anonKey);
    await cashierBClient.auth.signInWithPassword({ email: cashierBEmail, password: cashierBPass });

    const { data: cashBBranches } = await cashierBClient.from('branches').select('name');
    const cashBSeesDowntown = cashBBranches?.some(b => b.name === 'Branch Downtown');
    const cashBSeesMall = cashBBranches?.some(b => b.name === 'Branch Mall');

    console.log(`   Branches — Downtown: ${cashBSeesDowntown ? '❌ LEAK' : '✅ Hidden'} | Mall: ${cashBSeesMall ? '✅' : '❌'}`);

    if (cashBSeesDowntown) {
      throw new Error('BRANCH ISOLATION FAILED: Cashier B sees Branch Downtown!');
    }

    // ========== TEST: Cashier still cannot UPDATE or DELETE ==========
    console.log('\n6️⃣ Re-verifying immutable ledger (cashier cannot update/delete):');
    const { data: cashALedgerAll } = await cashierAClient.from('points_ledger').select('id, points_change');
    if (cashALedgerAll && cashALedgerAll.length > 0) {
      const firstEntry = cashALedgerAll[0];
      await cashierAClient.from('points_ledger').update({ points_change: 9999 }).eq('id', firstEntry.id);
      const { data: check } = await adminClient.from('points_ledger').select('points_change').eq('id', firstEntry.id).single();
      console.log(`   Update blocked: ${check?.points_change !== 9999 ? '✅' : '❌ LEAK'}`);

      await cashierAClient.from('points_ledger').delete().eq('id', firstEntry.id);
      const { data: checkDel } = await adminClient.from('points_ledger').select('id').eq('id', firstEntry.id).maybeSingle();
      console.log(`   Delete blocked: ${checkDel ? '✅' : '❌ LEAK'}`);
    }

    console.log('\n🎉 Phase 2 FIX Verified: Branch-Level RLS Isolation Working Correctly!');

  } catch (err: any) {
    console.error('\n❌ Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    console.log('\n🧹 Cleaning up...');
    for (const uid of createdUsers) {
      await adminClient.auth.admin.deleteUser(uid);
    }
    if (bizId) await adminClient.from('businesses').delete().eq('id', bizId);
    console.log('   ✅ Cleanup complete.');
  }
}

runPhase2FixTest();
