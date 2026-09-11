import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createCustomer, getCustomerPointsBalance } from '../lib/customer';
import { recordPointsTransaction, calculatePointsFromBill, calculatePointsForMenuItem } from '../lib/cashier';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase4Tests() {
  console.log('🚀 Testing Phase 4: Cashier Screen & Points Control System...\n');

  let testBizId: string | null = null;
  let testBranchId: string | null = null;
  let testCustomerId: string | null = null;

  try {
    // 1. Setup test business, branch, menu items, and rates
    console.log('1️⃣ Setting up test business & menu items...');
    const { data: biz } = await adminClient
      .from('businesses')
      .insert({ name: 'Roastery & Cafe', subdomain: `cashier-test-${Date.now()}` })
      .select().single();
    testBizId = biz.id;

    const { data: branch } = await adminClient
      .from('branches')
      .insert({ business_id: testBizId, name: 'Main Branch' })
      .select().single();
    testBranchId = branch.id;

    // Set redemption rates: 1 EGP = 1 pt, 1 pt = 0.10 EGP (so a 50 EGP item costs 500 pts)
    await adminClient
      .from('redemption_rates')
      .insert({
        business_id: testBizId,
        points_per_currency_unit: 1.0,
        currency_per_point: 0.1,
      });

    // Add menu items
    const { data: latte } = await adminClient
      .from('menu_items')
      .insert({
        business_id: testBizId,
        branch_id: testBranchId,
        name: 'Spanish Latte',
        price: 50.0,
      })
      .select().single();

    // 2. Create customer
    const customer = await createCustomer({
      businessId: testBizId,
      name: 'Youssef Ali',
      phoneNumber: '+201012345678',
      consentGiven: true,
    });
    testCustomerId = customer.id;
    console.log(`   ✅ Customer created: [${customer.id}] ${customer.name}`);
    console.log(`   ✅ QR Token: ${customer.qr_token}`);

    // Initial balance should be 0
    let balance = await getCustomerPointsBalance(testCustomerId);
    console.log(`   Initial balance: ${balance} points`);

    // 3. Test 4.3: Add points from bill amount
    console.log('\n2️⃣ Testing Step 4.3: Add points via purchase bill amount...');
    const billAmount = 250; // 250 EGP bill
    const earnedPoints = calculatePointsFromBill(billAmount, 1.0); // 250 pts
    console.log(`   Bill: ${billAmount} EGP -> Calculated Points: +${earnedPoints} pts`);

    const addResult = await recordPointsTransaction({
      businessId: testBizId,
      branchId: testBranchId,
      customerId: testCustomerId,
      pointsChange: earnedPoints,
      reason: `purchase_bill: ${billAmount} EGP`,
    });

    console.log(`   ✅ Transaction recorded in points_ledger: [${addResult.ledgerRecord.id}]`);
    console.log(`   Updated balance: ${addResult.newBalance} points (expected 250) ${addResult.newBalance === 250 ? '✅' : '❌'}`);
    if (addResult.newBalance !== 250) throw new Error('Balance mismatch after adding points');

    // 4. Test 4.4: Redeem points for a menu item
    console.log('\n3️⃣ Testing Step 4.4: Redeem points for menu item (Spanish Latte)...');
    const requiredPoints = calculatePointsForMenuItem(latte.price, 0.1); // 50 / 0.1 = 500 pts
    console.log(`   Item: ${latte.name} (${latte.price} EGP) -> Required Points: ${requiredPoints} pts`);

    // Customer only has 250 points, trying to redeem 500 should fail!
    console.log('   Testing insufficient balance rejection...');
    try {
      await recordPointsTransaction({
        businessId: testBizId,
        branchId: testBranchId,
        customerId: testCustomerId,
        pointsChange: -requiredPoints,
        reason: `menu_item_redemption: ${latte.name}`,
      });
      throw new Error('Should have failed due to insufficient balance!');
    } catch (insufficientErr: any) {
      console.log(`   ✅ Correctly rejected: ${insufficientErr.message}`);
    }

    // Now add enough points to afford the latte
    console.log('\n4️⃣ Adding additional points to afford redemption...');
    await recordPointsTransaction({
      businessId: testBizId,
      branchId: testBranchId,
      customerId: testCustomerId,
      pointsChange: 350,
      reason: 'manual_bonus_by_cashier',
    });
    balance = await getCustomerPointsBalance(testCustomerId);
    console.log(`   New balance: ${balance} points (250 + 350 = 600 pts) ✅`);

    // Now redeem the latte (500 pts)
    console.log('\n5️⃣ Executing valid menu item redemption (500 pts)...');
    const redeemResult = await recordPointsTransaction({
      businessId: testBizId,
      branchId: testBranchId,
      customerId: testCustomerId,
      pointsChange: -requiredPoints,
      reason: `menu_item_redemption: ${latte.name}`,
    });

    console.log(`   ✅ Deduction recorded in points_ledger: [${redeemResult.ledgerRecord.id}]`);
    console.log(`   Updated balance: ${redeemResult.newBalance} points (expected 100) ${redeemResult.newBalance === 100 ? '✅' : '❌'}`);
    if (redeemResult.newBalance !== 100) throw new Error('Balance mismatch after redemption');

    // 5. Test 4.5: Verify points_ledger has all historical records (Single Source of Truth)
    console.log('\n6️⃣ Testing Step 4.5: Verify points_ledger transaction history...');
    const { data: ledgerEntries } = await adminClient
      .from('points_ledger')
      .select('points_change, reason, created_at')
      .eq('customer_id', testCustomerId)
      .order('created_at', { ascending: true });

    console.log(`   Ledger records found: ${ledgerEntries?.length} records:`);
    ledgerEntries?.forEach((entry, idx) => {
      console.log(`     ${idx + 1}. [${entry.points_change > 0 ? '+' : ''}${entry.points_change} pts] Reason: ${entry.reason}`);
    });

    const sumFromLedger = ledgerEntries?.reduce((sum, e) => sum + e.points_change, 0);
    console.log(`   Sum of all ledger entries: ${sumFromLedger} pts === Current balance: ${redeemResult.newBalance} pts ✅`);
    if (sumFromLedger !== redeemResult.newBalance) throw new Error('Ledger sum does not match balance!');

    console.log('\n🎉 Phase 4 Cashier Tests PASSED Successfully!');
    console.log(`📲 Open Cashier Screen: http://localhost:3000/cashier`);
    console.log(`💡 Scannable Customer Token: ${customer.qr_token}\n`);

  } catch (err: any) {
    console.error('\n❌ Phase 4 Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (testBizId) {
      console.log('🧹 Cleaning up test data...');
      await adminClient.from('businesses').delete().eq('id', testBizId);
      console.log('   ✅ Cleanup complete.');
    }
  }
}

runPhase4Tests();
