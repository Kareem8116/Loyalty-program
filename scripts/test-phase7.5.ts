import * as fs from 'fs';
import * as path from 'path';

function runPhase75Tests() {
  console.log('Testing Phase 7.5 — i18n & RTL/LTR Localization...\n');

  // =========================================================================
  // 1. Verify translation files existence & JSON validity
  // =========================================================================
  console.log('1. Checking translation files existence and validity...');
  const arPath = path.resolve(__dirname, '../messages/ar.json');
  const enPath = path.resolve(__dirname, '../messages/en.json');

  if (!fs.existsSync(arPath)) throw new Error('messages/ar.json is missing');
  if (!fs.existsSync(enPath)) throw new Error('messages/en.json is missing');

  const arContent = fs.readFileSync(arPath, 'utf-8');
  const enContent = fs.readFileSync(enPath, 'utf-8');

  let arJson: Record<string, any>;
  let enJson: Record<string, any>;

  try {
    arJson = JSON.parse(arContent);
    enJson = JSON.parse(enContent);
  } catch (err: any) {
    throw new Error(`Failed to parse JSON translation files: ${err.message}`);
  }

  console.log('   messages/ar.json: Valid JSON');
  console.log('   messages/en.json: Valid JSON');

  // =========================================================================
  // 2. Verify 100% Key Parity between AR and EN
  // =========================================================================
  console.log('\n2. Verifying 100% key parity between Arabic and English catalogs...');

  function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
    let keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys = keys.concat(getAllKeys(v, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }

  const arKeys = getAllKeys(arJson).sort();
  const enKeys = getAllKeys(enJson).sort();

  console.log(`   Total Arabic keys: ${arKeys.length}`);
  console.log(`   Total English keys: ${enKeys.length}`);

  const missingInEn = arKeys.filter((k) => !enKeys.includes(k));
  const missingInAr = enKeys.filter((k) => !arKeys.includes(k));

  if (missingInEn.length > 0) {
    throw new Error(`Keys in AR but missing in EN: ${missingInEn.join(', ')}`);
  }
  if (missingInAr.length > 0) {
    throw new Error(`Keys in EN but missing in AR: ${missingInAr.join(', ')}`);
  }

  console.log('   100% Key Parity Confirmed! Zero missing translation keys.');

  // =========================================================================
  // 3. Test Translation Helper & Parameter Interpolation
  // =========================================================================
  console.log('\n3. Testing translation helper & dynamic interpolation...');
  const { getTranslation } = require('../lib/locale');

  const arGreeting = getTranslation('ar', 'customer.greeting', { name: 'كريم' });
  const enGreeting = getTranslation('en', 'customer.greeting', { name: 'Karim' });

  console.log(`   AR: ${arGreeting} (expected: أهلاً، كريم)`);
  console.log(`   EN: ${enGreeting} (expected: Hello, Karim)`);

  if (arGreeting !== 'أهلاً، كريم') throw new Error('Arabic greeting interpolation failed');
  if (enGreeting !== 'Hello, Karim') throw new Error('English greeting interpolation failed');

  const arPoints = getTranslation('ar', 'cashierControl.addSuccess', { points: 50 });
  const enPoints = getTranslation('en', 'cashierControl.addSuccess', { points: 50 });
  console.log(`   AR: ${arPoints}`);
  console.log(`   EN: ${enPoints}`);

  if (!arPoints.includes('50')) throw new Error('Arabic points interpolation failed');
  if (!enPoints.includes('50')) throw new Error('English points interpolation failed');

  // =========================================================================
  // 4. Test Pre-hydration Script in app/layout.tsx
  // =========================================================================
  console.log('\n4. Verifying RootLayout pre-hydration script & LocaleProvider integration...');
  const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
  const layoutCode = fs.readFileSync(layoutPath, 'utf-8');

  const hasLocaleInit = layoutCode.includes("localStorage.getItem('locale')");
  const hasRtlDir = layoutCode.includes("document.documentElement.dir = 'rtl'");
  const hasLtrDir = layoutCode.includes("document.documentElement.dir = 'ltr'");
  const hasProvider = layoutCode.includes('<LocaleProvider>');

  console.log(`   Has localStorage('locale') check in <head>: ${hasLocaleInit ? 'YES' : 'NO'}`);
  console.log(`   Sets dir='rtl' for Arabic: ${hasRtlDir ? 'YES' : 'NO'}`);
  console.log(`   Sets dir='ltr' for English: ${hasLtrDir ? 'YES' : 'NO'}`);
  console.log(`   Wraps children with LocaleProvider: ${hasProvider ? 'YES' : 'NO'}`);

  if (!hasLocaleInit || !hasRtlDir || !hasLtrDir || !hasProvider) {
    throw new Error('RootLayout is missing pre-hydration locale script or LocaleProvider wrapper');
  }

  // =========================================================================
  // 5. Verify useLocale presence across all target components & pages
  // =========================================================================
  console.log('\n5. Verifying useLocale integration across screens...');
  const targets = [
    'components/CustomerScreen.tsx',
    'app/account/page.tsx',
    'app/cashier/page.tsx',
    'components/CashierControl.tsx',
    'components/QrScanner.tsx',
    'app/admin/login/page.tsx',
    'app/admin/page.tsx',
    'components/HomeContent.tsx',
  ];

  for (const t of targets) {
    const filePath = path.resolve(__dirname, '..', t);
    const code = fs.readFileSync(filePath, 'utf-8');
    const hasUseLocale = code.includes('useLocale()') || code.includes('useLocale');
    console.log(`   ${t}: uses useLocale -> ${hasUseLocale ? 'YES' : 'NO'}`);
    if (!hasUseLocale) throw new Error(`${t} does not use useLocale`);
  }

  // =========================================================================
  // 6. Check Zero Emojis rule compliance
  // =========================================================================
  console.log('\n6. Checking Zero Emojis rule compliance across catalogs and LanguageSwitcher...');
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  if (emojiRegex.test(arContent)) {
    throw new Error('Found disallowed emoji in messages/ar.json!');
  }
  if (emojiRegex.test(enContent)) {
    throw new Error('Found disallowed emoji in messages/en.json!');
  }

  const switcherPath = path.resolve(__dirname, '../components/LanguageSwitcher.tsx');
  if (!fs.existsSync(switcherPath)) {
    throw new Error('components/LanguageSwitcher.tsx does not exist!');
  }
  const switcherContent = fs.readFileSync(switcherPath, 'utf-8');
  if (emojiRegex.test(switcherContent)) {
    throw new Error('Found disallowed emoji in components/LanguageSwitcher.tsx!');
  }
  console.log('   Zero Emojis rule verified: Clean! No emojis in catalogs or LanguageSwitcher.');

  // =========================================================================
  // 7. Test LanguageSwitcher Component Structure & Implementation
  // =========================================================================
  console.log('\n7. Testing LanguageSwitcher component structure & attributes...');
  if (!switcherContent.includes('useLocale')) {
    throw new Error('LanguageSwitcher does not use useLocale context');
  }
  if (!switcherContent.includes('id="language-switcher-btn"')) {
    throw new Error('LanguageSwitcher missing id="language-switcher-btn"');
  }
  if (!switcherContent.includes('Languages') && !switcherContent.includes('Globe')) {
    throw new Error('LanguageSwitcher missing SVG icon from lucide-react');
  }
  console.log('   LanguageSwitcher: Uses useLocale, has language-switcher-btn ID, uses SVG icon');

  // =========================================================================
  // 8. Test Universal LanguageSwitcher Presence across ALL 10 Pages (PLAN 7.5.5)
  // =========================================================================
  console.log('\n8. Verifying Universal LanguageSwitcher presence across ALL 10 system pages...');
  const allPages = [
    { name: 'Home/Landing Page', path: 'components/HomeContent.tsx', isPublic: true },
    { name: 'Customer Loyalty Card', path: 'components/CustomerScreen.tsx', isPublic: true },
    { name: 'Customer Account Page', path: 'app/account/page.tsx', isPublic: false },
    { name: 'Cashier Scanner & Terminal', path: 'app/cashier/page.tsx', isPublic: false },
    { name: 'Admin Dashboard', path: 'app/admin/page.tsx', isPublic: false },
    { name: 'Admin Login', path: 'app/admin/login/page.tsx', isPublic: true },
    { name: 'Super Admin Dashboard', path: 'app/super-admin/page.tsx', isPublic: false },
    { name: 'Super Admin Login', path: 'app/super-admin/login/page.tsx', isPublic: true },
    { name: 'Customer Self-Signup (Phase 21)', path: 'app/signup/page.tsx', isPublic: true },
    { name: 'Forgot Password OTP (Phase 23)', path: 'app/forgot-password/page.tsx', isPublic: true },
  ];

  for (const page of allPages) {
    const filePath = path.resolve(__dirname, '..', page.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Page file not found: ${page.path}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const hasImport = content.includes('LanguageSwitcher');
    const hasRender = content.includes('<LanguageSwitcher') || content.includes('<LanguageSwitcher />');
    console.log(`   ${page.name} (${page.path}) [${page.isPublic ? 'PUBLIC' : 'AUTHENTICATED'}]: has LanguageSwitcher -> ${hasRender ? 'YES' : 'NO'}`);
    if (!hasImport || !hasRender) {
      throw new Error(`LanguageSwitcher missing on ${page.name} (${page.path})!`);
    }
  }

  console.log('\nAll 10 pages confirmed to include Universal Language Switcher!');
  console.log('Phase 7.5 i18n, RTL/LTR & Universal Language Switcher PASSED Successfully!');
}

runPhase75Tests();
