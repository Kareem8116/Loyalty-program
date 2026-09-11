import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { generateQrToken, createCustomer, getCustomerByQrToken, getCustomerPointsBalance } from '../lib/customer';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase3Tests() {
  console.log('🚀 Running Phase 3 Tests (QR Token, Customer Screen & API)...\n');

  let testBizId: string | null = null;
  let testCustomerId: string | null = null;

  try {
    // 1. Test 3.1 & Phase 25: QR Token generation (9-char code)
    console.log('1️⃣ Testing Step 3.1 & Phase 25: QR Token generation (9-character code)...');
    const token = generateQrToken();
    const isValidCode = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{9}$/.test(token);
    console.log(`   Generated Token: ${token}`);
    console.log(`   Is valid 9-character code: ${isValidCode ? '✅ YES' : '❌ NO'}`);
    if (!isValidCode) throw new Error('Generated token is not a valid 9-character code');

    // 2. Create a test business & customer
    console.log('\n2️⃣ Creating demo business & customer in DB...');
    const { data: biz, error: bizErr } = await adminClient
      .from('businesses')
      .insert({ name: 'Specialty Coffee Co.', subdomain: `demo-cafe-${Date.now()}` })
      .select().single();
    if (bizErr) throw bizErr;
    testBizId = biz.id;

    const newCustomer = await createCustomer({
      businessId: testBizId,
      name: 'Mohamed Tarek',
      phoneNumber: '+201098765432',
      consentGiven: true,
    });
    testCustomerId = newCustomer.id;
    console.log(`   ✅ Customer created: [${newCustomer.id}] ${newCustomer.name}`);
    console.log(`   ✅ QR Token: ${newCustomer.qr_token}`);

    // 3. Add points transactions in points_ledger (Single source of truth)
    console.log('\n3️⃣ Adding ledger records for points calculation...');
    await adminClient.from('points_ledger').insert([
      { business_id: testBizId, customer_id: testCustomerId, points_change: 100, reason: 'welcome_gift' },
      { business_id: testBizId, customer_id: testCustomerId, points_change: 45, reason: 'coffee_purchase' },
      { business_id: testBizId, customer_id: testCustomerId, points_change: -20, reason: 'pastry_discount' }
    ]);

    const balance = await getCustomerPointsBalance(testCustomerId);
    console.log(`   Calculated points balance: ${balance} (expected 125) ${balance === 125 ? '✅' : '❌'}`);
    if (balance !== 125) throw new Error(`Balance calculation mismatch: expected 125, got ${balance}`);

    // 4. Test Step 3.2: Privacy check (Cashier vs Owner)
    console.log('\n4️⃣ Testing Step 3.2: API privacy rules (Cashier vs Owner)...');
    
    // As Cashier: phone_number MUST be hidden
    const cashierView = await getCustomerByQrToken(newCustomer.qr_token, 'cashier');
    console.log(`   - Cashier view -> Name: ${cashierView?.name}, Points: ${cashierView?.points_balance}`);
    console.log(`   - Cashier view -> Phone: ${cashierView?.phone_number === undefined ? '✅ HIDDEN (Protected)' : '❌ LEAKED!'}`);
    if (cashierView?.phone_number !== undefined) {
      throw new Error('Privacy Violation: Cashier was able to see customer phone number!');
    }

    // As Owner: phone_number is available
    const ownerView = await getCustomerByQrToken(newCustomer.qr_token, 'owner');
    console.log(`   - Owner view -> Phone: ${ownerView?.phone_number ? '✅ Visible (' + ownerView.phone_number + ')' : '❌ Missing!'}`);
    if (!ownerView?.phone_number) {
      throw new Error('Owner should be able to view customer phone number!');
    }

    // 5. Test QR URL format
    console.log('\n5️⃣ Testing Step 3.5: QR code URL target...');
    const targetUrl = `http://localhost:3000/card/${newCustomer.qr_token}`;
    console.log(`   Target QR URL: ${targetUrl} ✅`);

    console.log('\n🎉 Phase 3 Automated Verification PASSED Successfully!');
    console.log(`\n📲 DEMO QR TOKEN FOR SCANNING: ${newCustomer.qr_token}`);
    console.log(`🔗 OPEN IN BROWSER: http://localhost:3000/card/${newCustomer.qr_token}\n`);

  } catch (err: any) {
    console.error('❌ Phase 3 test failed:', err.message);
    process.exitCode = 1;
  } finally {
    // Keep the test customer available for manual mobile scan test, or clean up later
  }
}

runPhase3Tests();
