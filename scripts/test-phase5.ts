import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getBranchMenuItems, getRedemptionRates } from '../lib/cashier';
import { createCustomer, getCustomerPointsBalance } from '../lib/customer';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase5Tests() {
  console.log('🚀 Testing Phase 5: Admin Dashboard (Menu, Customers, Settings, Cashier Integration)...\n');

  let testBizId: string | null = null;
  let testBranchId: string | null = null;

  try {
    // 1. Setup demo business
    console.log('1️⃣ Creating test business & branch...');
    const { data: biz } = await adminClient
      .from('businesses')
      .insert({ name: 'Admin Test Cafe', subdomain: `admin-test-${Date.now()}` })
      .select().single();
    testBizId = biz.id;

    const { data: branch } = await adminClient
      .from('branches')
      .insert({ business_id: testBizId, name: 'Main Branch' })
      .select().single();
    testBranchId = branch.id;

    // 2. Test 5.2: Menu Management (Add, List, Update, Delete)
    console.log('\n2️⃣ Testing Step 5.2: Menu item management...');
    const { data: item1, error: itemErr } = await adminClient
      .from('menu_items')
      .insert({
        business_id: testBizId,
        branch_id: testBranchId,
        name: 'Caramel Macchiato',
        price: 75.0,
      })
      .select().single();

    if (itemErr) throw itemErr;
    console.log(`   ✅ Menu item created: [${item1.id}] ${item1.name} (${item1.price} EGP)`);

    // Update item price
    const { data: updatedItem } = await adminClient
      .from('menu_items')
      .update({ price: 80.0 })
      .eq('id', item1.id)
      .select().single();
    console.log(`   ✅ Menu item updated: ${updatedItem.name} new price: ${updatedItem.price} EGP`);

    // 3. Test 5.5: CRITICAL VERIFICATION: Does the new item appear IMMEDIATELY in Cashier menu?
    console.log('\n3️⃣ Testing Step 5.5: Immediate visibility in Cashier screen...');
    const cashierMenu = await getBranchMenuItems(testBizId, testBranchId);
    const foundInCashier = cashierMenu.some(m => m.id === item1.id && m.name === 'Caramel Macchiato');
    console.log(`   Cashier menu items count: ${cashierMenu.length}`);
    console.log(`   Caramel Macchiato visible in Cashier: ${foundInCashier ? '✅ YES (INSTANT)' : '❌ NO'}`);
    if (!foundInCashier) throw new Error('Step 5.5 Failed: Item not visible in Cashier menu!');

    // 4. Test 5.3: Customer management (Add customer, auto-generated qr_token)
    console.log('\n4️⃣ Testing Step 5.3: Customer registration with auto QR token...');
    const customer = await createCustomer({
      businessId: testBizId,
      name: 'Nour El-Din',
      phoneNumber: '+201099887766',
      consentGiven: true,
    });
    console.log(`   ✅ Customer created: [${customer.id}] ${customer.name}`);
    console.log(`   ✅ Auto-generated QR token: ${customer.qr_token}`);
    if (!customer.qr_token) throw new Error('Missing qr_token on new customer');

    // 5. Test 5.4: Settings (Redemption rates configuration)
    console.log('\n5️⃣ Testing Step 5.4: Redemption rates configuration update...');
    // Default rates
    const initialRates = await getRedemptionRates(testBizId);
    console.log(`   Initial rates: 1 EGP = ${initialRates.points_per_currency_unit} pt, 1 pt = ${initialRates.currency_per_point} EGP`);

    // Owner updates rates: 1 EGP = 2.0 pts, 1 pt = 0.25 EGP
    await adminClient
      .from('redemption_rates')
      .upsert({
        business_id: testBizId,
        points_per_currency_unit: 2.0,
        currency_per_point: 0.25,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id' });

    const { invalidateCache } = await import('../lib/redis');
    await invalidateCache(`redemption_rates:${testBizId}`);

    const updatedRates = await getRedemptionRates(testBizId);
    console.log(`   Updated rates: 1 EGP = ${updatedRates.points_per_currency_unit} pts, 1 pt = ${updatedRates.currency_per_point} EGP`);
    const rateUpdated = updatedRates.points_per_currency_unit === 2.0 && updatedRates.currency_per_point === 0.25;
    console.log(`   Rates correctly applied: ${rateUpdated ? '✅ YES' : '❌ NO'}`);
    if (!rateUpdated) throw new Error('Redemption rates update failed');

    // 6. Delete item cleanup test
    console.log('\n6️⃣ Testing menu item deletion...');
    await adminClient.from('menu_items').delete().eq('id', item1.id);
    await invalidateCache(`menu_items:${testBizId}:all`);
    await invalidateCache(`menu_items:${testBizId}:${testBranchId}`);
    const menuAfterDelete = await getBranchMenuItems(testBizId, testBranchId);
    const itemStillPresent = menuAfterDelete.some(m => m.id === item1.id);
    console.log(`   Item removed from Cashier menu: ${!itemStillPresent ? '✅ YES' : '❌ NO'}`);

    console.log('\n🎉 Phase 5 Admin Dashboard Tests PASSED Successfully!');
    console.log(`📲 Open Admin Dashboard: http://localhost:3000/admin`);
    console.log(`🔑 Open Admin Login: http://localhost:3000/admin/login\n`);

  } catch (err: any) {
    console.error('\n❌ Phase 5 Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (testBizId) {
      console.log('🧹 Cleaning up test data...');
      await adminClient.from('businesses').delete().eq('id', testBizId);
      console.log('   ✅ Cleanup complete.');
    }
  }
}

runPhase5Tests();
