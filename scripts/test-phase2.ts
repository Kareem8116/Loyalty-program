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

export async function runPhase2RoleTests(superAdminEmail?: string) {
  console.log('🚀 Testing Phase 2: Auth & RLS Multi-Tenant Isolation...\n');

  let bizAId: string | null = null;
  let bizBId: string | null = null;
  let ownerAUser: any = null;
  let cashierAUser: any = null;

  try {
    // 1. Create two separate businesses for isolation testing
    console.log('1️⃣ Creating two test businesses (Business A and Business B)...');
    const { data: bizA, error: errA } = await adminClient
      .from('businesses')
      .insert({ name: 'Specialty Coffee A', subdomain: `biz-a-${Date.now()}` })
      .select().single();
    if (errA) throw errA;
    bizAId = bizA.id;

    const { data: bizB, error: errB } = await adminClient
      .from('businesses')
      .insert({ name: 'Bakery B', subdomain: `biz-b-${Date.now()}` })
      .select().single();
    if (errB) throw errB;
    bizBId = bizB.id;

    // 2. Add customers to both businesses
    const { data: custA, error: custAErr } = await adminClient
      .from('customers')
      .insert({ business_id: bizAId, name: 'Customer in Biz A', phone_number: '+201011111111' })
      .select().single();
    if (custAErr) throw custAErr;

    const { data: custB, error: custBErr } = await adminClient
      .from('customers')
      .insert({ business_id: bizBId, name: 'Customer in Biz B', phone_number: '+201022222222' })
      .select().single();
    if (custBErr) throw custBErr;

    console.log('   ✅ Customers created in respective businesses.');

    // 3. Create a test Owner user for Business A
    const ownerEmail = `test-owner-a-${Date.now()}@example.com`;
    const ownerPassword = `TestOwnerPass!${Date.now()}`;
    const { data: ownerAuth, error: ownerAuthErr } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true
    });
    if (ownerAuthErr) throw ownerAuthErr;
    ownerAUser = ownerAuth.user;

    await adminClient.from('user_roles').insert({
      user_id: ownerAUser.id,
      business_id: bizAId,
      role: 'owner'
    });
    console.log(`   ✅ Owner A created and assigned role.`);

    // 4. Create a test Cashier user for Business A
    const cashierEmail = `test-cashier-a-${Date.now()}@example.com`;
    const cashierPassword = `TestCashierPass!${Date.now()}`;
    const { data: cashierAuth, error: cashierAuthErr } = await adminClient.auth.admin.createUser({
      email: cashierEmail,
      password: cashierPassword,
      email_confirm: true
    });
    if (cashierAuthErr) throw cashierAuthErr;
    cashierAUser = cashierAuth.user;

    await adminClient.from('user_roles').insert({
      user_id: cashierAUser.id,
      business_id: bizAId,
      role: 'cashier'
    });
    console.log(`   ✅ Cashier A created and assigned role.`);

    // 5. Test Owner A Client (Authenticating with Anon Key + User Token)
    console.log('\n2️⃣ Testing RLS Isolation for Business Owner A:');
    const ownerClient = createClient(supabaseUrl, anonKey);
    const { data: ownerSession, error: ownerLoginErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword
    });
    if (ownerLoginErr) throw ownerLoginErr;

    // Owner should see only Customer A, NEVER Customer B
    const { data: ownerCustomers, error: ownerCustErr } = await ownerClient.from('customers').select('*');
    if (ownerCustErr) throw ownerCustErr;

    const seesCustomerA = ownerCustomers.some(c => c.id === custA.id);
    const seesCustomerB = ownerCustomers.some(c => c.id === custB.id);

    console.log(`   - Sees Customer A (Own Business): ${seesCustomerA ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Sees Customer B (Other Business): ${seesCustomerB ? '❌ LEAK DETECTED' : '✅ NO (Isolated)'}`);

    if (!seesCustomerA || seesCustomerB) {
      throw new Error('RLS Failure: Owner data isolation broken!');
    }

    // 6. Test Cashier A Client
    console.log('\n3️⃣ Testing RLS Rules for Cashier A:');
    const cashierClient = createClient(supabaseUrl, anonKey);
    const { error: cashierLoginErr } = await cashierClient.auth.signInWithPassword({
      email: cashierEmail,
      password: cashierPassword
    });
    if (cashierLoginErr) throw cashierLoginErr;

    // Cashier CAN insert a points record for Customer A
    const { data: insertedPoints, error: cashierInsertErr } = await cashierClient
      .from('points_ledger')
      .insert({
        business_id: bizAId,
        customer_id: custA.id,
        points_change: 25,
        reason: 'cashier_order_reward'
      })
      .select().single();

    if (cashierInsertErr) {
      throw new Error(`Cashier insert failed: ${cashierInsertErr.message}`);
    }
    console.log('   ✅ Cashier successfully inserted points transaction.');

    // Cashier CANNOT update the points record (Immutable ledger rule)
    const { error: cashierUpdateErr } = await cashierClient
      .from('points_ledger')
      .update({ points_change: 1000 })
      .eq('id', insertedPoints.id);

    // If RLS denies update, it returns either an error or 0 affected rows
    const { data: checkPoints } = await adminClient.from('points_ledger').select('points_change').eq('id', insertedPoints.id).single();
    if (checkPoints?.points_change === 1000) {
      throw new Error('RLS Failure: Cashier was able to illegally modify points_ledger!');
    }
    console.log('   ✅ Cashier CANNOT edit points records (Immutable ledger verified).');

    // Cashier CANNOT delete the points record
    await cashierClient.from('points_ledger').delete().eq('id', insertedPoints.id);
    const { data: checkDeleted } = await adminClient.from('points_ledger').select('id').eq('id', insertedPoints.id).maybeSingle();
    if (!checkDeleted) {
      throw new Error('RLS Failure: Cashier was able to delete points_ledger record!');
    }
    console.log('   ✅ Cashier CANNOT delete points records (Deletion blocked verified).');

    console.log('\n🎉 Phase 2 RLS & Roles Verification Passed Successfully!');
  } catch (err: any) {
    console.error('❌ Phase 2 Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    // Clean up test data
    console.log('\n🧹 Cleaning up test accounts & test businesses...');
    if (ownerAUser) await adminClient.auth.admin.deleteUser(ownerAUser.id);
    if (cashierAUser) await adminClient.auth.admin.deleteUser(cashierAUser.id);
    if (bizAId) await adminClient.from('businesses').delete().eq('id', bizAId);
    if (bizBId) await adminClient.from('businesses').delete().eq('id', bizBId);
    console.log('   ✅ Cleanup complete.');
  }
}

if (require.main === module) {
  runPhase2RoleTests();
}
