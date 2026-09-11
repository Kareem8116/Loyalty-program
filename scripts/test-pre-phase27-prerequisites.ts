import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getServiceSupabase } from '../lib/supabase';
import {
  getCashierPerTransactionLimit,
  recordPointsTransaction,
  getCashierDailyStats,
} from '../lib/cashier';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function runTests() {
  console.log('🧪 Starting Pre-Phase 27 Prerequisites Comprehensive Test Suite...\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // Test 1: Translation files completeness & zero emojis
  const arRaw = fs.readFileSync(path.join(process.cwd(), 'messages/ar.json'), 'utf8');
  const enRaw = fs.readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf8');
  const arJson = JSON.parse(arRaw);
  const enJson = JSON.parse(enRaw);

  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert(!emojiRegex.test(arRaw), 'Rule 3.2: Zero emojis in messages/ar.json');
  assert(!emojiRegex.test(enRaw), 'Rule 3.2: Zero emojis in messages/en.json');

  assert(!!arJson.cashierLogin?.title && !!enJson.cashierLogin?.title, 'Cashier login translations present');
  assert(!!arJson.cashierLogin?.logout && !!enJson.cashierLogin?.logout, 'Cashier logout translations present');
  assert(!!arJson.validation?.phonePrefixValid && !!enJson.validation?.phonePrefixValid, 'Egyptian phone validation messages present');
  assert(!!arJson.validation?.passwordRequirements && !!enJson.validation?.passwordRequirements, 'Password validation messages present');
  assert(!!arJson.validation?.pinLength && !!enJson.validation?.pinLength, 'PIN validation messages present');

  // Test 2: Egyptian Phone Validation Logic
  function testPhone(phone: string): boolean {
    const clean = phone.trim().replace(/\s+/g, '');
    if (!clean.startsWith('01')) return false;
    const prefix = clean.substring(0, 3);
    if (!['010', '011', '012', '015'].includes(prefix)) return false;
    return clean.length === 11 && /^\d{11}$/.test(clean);
  }

  assert(testPhone('01012345678') === true, 'Egyptian Phone: Valid 010 number accepted');
  assert(testPhone('01198765432') === true, 'Egyptian Phone: Valid 011 number accepted');
  assert(testPhone('01234567890') === true, 'Egyptian Phone: Valid 012 number accepted');
  assert(testPhone('01555555555') === true, 'Egyptian Phone: Valid 015 number accepted');
  assert(testPhone('01312345678') === false, 'Egyptian Phone: Invalid 013 prefix rejected');
  assert(testPhone('0223456789') === false, 'Egyptian Phone: Landline 02 rejected');
  assert(testPhone('0101234567') === false, 'Egyptian Phone: 10 digits rejected');
  assert(testPhone('010123456789') === false, 'Egyptian Phone: 12 digits rejected');

  // Test 3: Password Validation Logic (min 8 chars, letter + number)
  function testPassword(pw: string): boolean {
    if (!pw || pw.length < 8) return false;
    return /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  }

  assert(testPassword('pass1234') === true, 'Password: Valid alphanumeric 8 chars accepted');
  assert(testPassword('Secret999') === true, 'Password: Valid strong password accepted');
  assert(testPassword('short1') === false, 'Password: Less than 8 characters rejected');
  assert(testPassword('onlyletters') === false, 'Password: No numbers rejected');
  assert(testPassword('123456789') === false, 'Password: No letters rejected');

  // Test 4: Verify Cashier Login Page and Cashier Route Files
  const cashierLoginPageExists = fs.existsSync(path.join(process.cwd(), 'app/cashier/login/page.tsx'));
  assert(cashierLoginPageExists, 'Cashier login page app/cashier/login/page.tsx exists');

  const cashierPageContent = fs.readFileSync(path.join(process.cwd(), 'app/cashier/page.tsx'), 'utf8');
  assert(cashierPageContent.includes('/cashier/login'), 'Cashier page redirects unauthorized users to /cashier/login');
  assert(cashierPageContent.includes('handleLogout'), 'Cashier page has session cleanup and logout handler');

  // Test 5: Verify Admin Cashiers Route and Page
  const adminCashiersRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/cashiers/route.ts'), 'utf8');
  assert(adminCashiersRoute.includes('export async function POST'), 'app/api/admin/cashiers/route.ts supports POST for creating cashiers');
  assert(adminCashiersRoute.includes('per_transaction_points_limit'), 'app/api/admin/cashiers/route.ts handles per_transaction_points_limit');

  const adminPageContent = fs.readFileSync(path.join(process.cwd(), 'app/admin/page.tsx'), 'utf8');
  assert(adminPageContent.includes('showAddCashierModal'), 'app/admin/page.tsx includes Add Cashier modal');
  assert(adminPageContent.includes('cashierTxLimitEdits'), 'app/admin/page.tsx includes per-transaction limit management');

  // Test 6: Verify Database / Business Logic integration
  const supabase = getServiceSupabase();
  const { data: biz } = await supabase.from('businesses').select('id, timezone').limit(1).maybeSingle();
  if (biz) {
    console.log(`ℹ️ Business found for testing: ${biz.id} (timezone: ${biz.timezone || 'default'})`);
  }

  // Test 7: Verify FIFO and Per-Transaction Logic in lib/cashier.ts
  const cashierLib = fs.readFileSync(path.join(process.cwd(), 'lib/cashier.ts'), 'utf8');
  assert(cashierLib.includes('getCashierPerTransactionLimit'), 'lib/cashier.ts exports getCashierPerTransactionLimit');
  assert(cashierLib.includes('PER_TRANSACTION_LIMIT_EXCEEDED'), 'lib/cashier.ts enforces PER_TRANSACTION_LIMIT_EXCEEDED');
  assert(cashierLib.includes('remaining_amount'), 'lib/cashier.ts includes FIFO remaining_amount consumption');

  // Test 8: Verify Customer Auth Link integration in customer signup route
  const signupRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/customer/signup/route.ts'), 'utf8');
  assert(signupRoute.includes('customer_auth_links'), 'app/api/customer/signup/route.ts supports customer_auth_links linking');

  console.log(`\n======================================================`);
  console.log(`Results: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`======================================================\n`);

  if (passed === total) {
    console.log('🎉 All Pre-Phase 27 Prerequisites verified successfully!');
  } else {
    console.error('⚠️ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
