import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPhase7Tests() {
  console.log('Testing Phase 7: Personal Account & Theme Toggle Persistence...\n');

  let testBizId: string | null = null;

  try {
    // 1. Create a demo customer
    console.log('1. Setting up test customer...');
    const { data: biz } = await adminClient
      .from('businesses')
      .insert({ name: 'Theme Cafe', subdomain: `theme-test-${Date.now()}` })
      .select().single();
    testBizId = biz.id;

    const { data: customer } = await adminClient
      .from('customers')
      .insert({
        business_id: testBizId,
        name: 'Original Customer Name',
        phone_number: '+201011112222',
      })
      .select().single();

    console.log(`   Customer created: [${customer.id}] ${customer.name} (Phone: ${customer.phone_number})`);

    // 2. Test 7.1: Edit customer profile (Name & Phone) via API logic
    console.log('\n2. Testing Step 7.1: Update customer profile...');
    const updatedName = 'Karim Updated';
    const updatedPhone = '+201099998888';

    const { data: updatedCustomer, error: updateErr } = await adminClient
      .from('customers')
      .update({
        name: updatedName,
        phone_number: updatedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('qr_token', customer.qr_token)
      .select()
      .single();

    if (updateErr) throw updateErr;

    console.log(`   Updated Name: ${updatedCustomer.name} (expected ${updatedName}) -> ${updatedCustomer.name === updatedName ? 'YES' : 'NO'}`);
    console.log(`   Updated Phone: ${updatedCustomer.phone_number} (expected ${updatedPhone}) -> ${updatedCustomer.phone_number === updatedPhone ? 'YES' : 'NO'}`);

    if (updatedCustomer.name !== updatedName || updatedCustomer.phone_number !== updatedPhone) {
      throw new Error('Profile update failed in database!');
    }

    // 3. Test 7.2: Verify ThemeToggle is implemented across ALL system pages
    console.log('\n3. Testing Step 7.2: Universal ThemeToggle presence across all screens...');
    const pagesToCheck = [
      { name: 'Home Page', path: 'components/HomeContent.tsx' },
      { name: 'Customer Screen', path: 'components/CustomerScreen.tsx' },
      { name: 'Customer Account Page', path: 'app/account/page.tsx' },
      { name: 'Cashier Screen', path: 'app/cashier/page.tsx' },
      { name: 'Admin Dashboard', path: 'app/admin/page.tsx' },
      { name: 'Admin Login', path: 'app/admin/login/page.tsx' },
    ];

    for (const page of pagesToCheck) {
      const filePath = path.resolve(__dirname, '..', page.path);
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasThemeToggle = content.includes('<ThemeToggle');
      console.log(`   ${page.name} (${page.path}) has ThemeToggle: ${hasThemeToggle ? 'YES' : 'NO'}`);
      if (!hasThemeToggle) {
        throw new Error(`ThemeToggle missing on ${page.name}!`);
      }
    }

    // 4. Test 7.3: Verify theme persistence in localStorage and layout script
    console.log('\n4. Testing Step 7.3: Theme persistence in localStorage and RootLayout...');
    const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
    const hasPersistenceScript = layoutContent.includes("localStorage.getItem('theme')");
    console.log(`   RootLayout has anti-FOUC localStorage theme script: ${hasPersistenceScript ? 'YES' : 'NO'}`);
    if (!hasPersistenceScript) {
      throw new Error('RootLayout missing theme persistence script!');
    }

    const themeTogglePath = path.resolve(__dirname, '../components/ThemeToggle.tsx');
    const toggleContent = fs.readFileSync(themeTogglePath, 'utf-8');
    const hasLocalStorageSet = toggleContent.includes("localStorage.setItem('theme'");
    console.log(`   ThemeToggle saves preference to localStorage: ${hasLocalStorageSet ? 'YES' : 'NO'}`);
    if (!hasLocalStorageSet) {
      throw new Error('ThemeToggle does not persist to localStorage!');
    }

    // 5. Test Zero Emojis compliance
    console.log('\n5. Checking Zero Emojis rule compliance in Account page...');
    const accountPath = path.resolve(__dirname, '../app/account/page.tsx');
    const accountContent = fs.readFileSync(accountPath, 'utf-8');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const hasEmojis = emojiRegex.test(accountContent);
    console.log(`   Account page is free of emojis: ${!hasEmojis ? 'YES (Clean SVG only)' : 'NO'}`);
    if (hasEmojis) {
      throw new Error('Emoji found in Account page!');
    }

    console.log('\nPhase 7 Personal Account & Theme Toggle Tests PASSED Successfully!');

  } catch (err: any) {
    console.error('\nPhase 7 Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (testBizId) {
      console.log('Cleaning up test data...');
      await adminClient.from('businesses').delete().eq('id', testBizId);
      console.log('Cleanup complete.');
    }
  }
}

runPhase7Tests();
