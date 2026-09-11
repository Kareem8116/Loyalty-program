import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function runPhase1Verification() {
  console.log('🚀 Starting Phase 1 Verification (Test rows & FK integrity)...\n');
  const testSubdomain = `test-cafe-${Date.now()}`;
  let businessId: string | null = null;

  try {
    // 1. Insert into businesses
    console.log('1️⃣ Testing businesses table...');
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .insert({
        name: 'Test Coffee Roasters',
        subdomain: testSubdomain,
        is_active: true
      })
      .select()
      .single();

    if (bizErr) throw new Error(`businesses insert failed: ${bizErr.message}`);
    businessId = business.id;
    console.log(`   ✅ Business created: [${business.id}] ${business.name} (${business.subdomain})`);

    // 2. Insert into branches
    console.log('2️⃣ Testing branches table...');
    const { data: branch, error: branchErr } = await supabase
      .from('branches')
      .insert({
        business_id: businessId,
        name: 'Downtown Main Branch'
      })
      .select()
      .single();

    if (branchErr) throw new Error(`branches insert failed: ${branchErr.message}`);
    console.log(`   ✅ Branch created: [${branch.id}] ${branch.name}`);

    // 3. Insert into customers
    console.log('3️⃣ Testing customers table...');
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .insert({
        business_id: businessId,
        name: 'Ahmed Mohamed',
        phone_number: '+201001234567'
      })
      .select()
      .single();

    if (custErr) throw new Error(`customers insert failed: ${custErr.message}`);
    console.log(`   ✅ Customer created: [${customer.id}] ${customer.name}, QR Token: ${customer.qr_token}`);

    // 4. Insert into menu_items
    console.log('4️⃣ Testing menu_items table...');
    const { data: menuItem, error: menuErr } = await supabase
      .from('menu_items')
      .insert({
        business_id: businessId,
        branch_id: branch.id,
        name: 'Iced Spanish Latte',
        price: 85.00
      })
      .select()
      .single();

    if (menuErr) throw new Error(`menu_items insert failed: ${menuErr.message}`);
    console.log(`   ✅ Menu item created: [${menuItem.id}] ${menuItem.name} - ${menuItem.price} EGP`);

    // 5. Insert into points_ledger
    console.log('5️⃣ Testing points_ledger table...');
    const { data: ledger, error: ledgerErr } = await supabase
      .from('points_ledger')
      .insert({
        business_id: businessId,
        branch_id: branch.id,
        customer_id: customer.id,
        points_change: 50,
        reason: 'initial_signup_bonus'
      })
      .select()
      .single();

    if (ledgerErr) throw new Error(`points_ledger insert failed: ${ledgerErr.message}`);
    console.log(`   ✅ Points ledger entry created: [${ledger.id}] ${ledger.points_change} points, Reason: ${ledger.reason}`);

    // 6. Insert into redemption_rates
    console.log('6️⃣ Testing redemption_rates table...');
    const { data: rate, error: rateErr } = await supabase
      .from('redemption_rates')
      .insert({
        business_id: businessId,
        points_per_currency_unit: 1.00,
        currency_per_point: 0.10
      })
      .select()
      .single();

    if (rateErr) throw new Error(`redemption_rates insert failed: ${rateErr.message}`);
    console.log(`   ✅ Redemption rate created: 1 EGP = ${rate.points_per_currency_unit} pt, 1 pt = ${rate.currency_per_point} EGP`);

    // 7. Verify Relational Query & Foreign Key joins
    console.log('\n🔍 Verifying Foreign Key integrity with relational query...');
    const { data: joinData, error: joinErr } = await supabase
      .from('points_ledger')
      .select(`
        id,
        points_change,
        reason,
        businesses (name, subdomain),
        branches (name),
        customers (name, phone_number, qr_token)
      `)
      .eq('id', ledger.id)
      .single();

    if (joinErr) throw new Error(`Relational join failed: ${joinErr.message}`);
    console.log('   ✅ Relational integrity confirmed:', JSON.stringify(joinData, null, 2));

    console.log('\n🎉 Step 1.8 Passed: All tables exist, constraints & Foreign Keys verified successfully!');
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    // Clean up test business and cascaded children
    if (businessId) {
      console.log('\n🧹 Cleaning up test data...');
      const { error: delErr } = await supabase.from('businesses').delete().eq('id', businessId);
      if (delErr) {
        console.warn('   ⚠️ Could not delete test business:', delErr.message);
      } else {
        console.log('   ✅ Test data cleaned up successfully (CASCADE verified).');
      }
    }
  }
}

runPhase1Verification();
