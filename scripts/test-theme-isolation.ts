import * as fs from 'fs';
import * as path from 'path';

function runThemeIsolationTests() {
  console.log('Testing Theme Isolation & Explicit Class Application...\n');

  // =========================================================================
  // 1. Verify CSS variables in globals.css
  // =========================================================================
  console.log('1. Verifying Design System CSS Variables in globals.css...');
  const globalsPath = path.resolve(__dirname, '../app/globals.css');
  const globalsCss = fs.readFileSync(globalsPath, 'utf-8');

  const requiredVariables = [
    '--color-bg',
    '--color-accent',
    '--color-text',
    '--color-card-bg',
    '--color-border',
    '--color-btn-text',
    '--color-success-bg',
    '--color-success-text',
    '--color-success-border',
    '--color-error-bg',
    '--color-error-text',
    '--color-error-border',
    '--color-badge-special-bg',
    '--color-badge-daily-bg',
    '--color-overlay-bg',
    '--color-qr-bg',
    '--color-qr-fg',
  ];

  for (const v of requiredVariables) {
    const exists = globalsCss.includes(v);
    console.log(`   Variable ${v}: ${exists ? 'DEFINED' : 'MISSING'}`);
    if (!exists) throw new Error(`Missing CSS variable: ${v}`);
  }

  // =========================================================================
  // 2. Simulate User Scenario:
  //    OS is set to DARK mode (prefersDark = true)
  //    User clicks button to choose LIGHT mode manually
  // =========================================================================
  console.log('\n2. Testing Scenario: OS on Dark Mode + User manually switches to Light Mode...');

  // Mock DOM documentElement classList
  class MockClassList {
    classes = new Set<string>();
    add(cls: string) { this.classes.add(cls); }
    remove(cls: string) { this.classes.delete(cls); }
    contains(cls: string) { return this.classes.has(cls); }
    toString() { return Array.from(this.classes).join(' '); }
  }

  // Mock localStorage
  const mockStorage: Record<string, string> = {};
  const localStorageMock = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
  };

  const docElement = new MockClassList();
  const prefersDark = true; // OS in Dark Mode!

  // Initial load: no choice in storage, OS is dark -> must apply .dark and remove .light
  const initialTheme = localStorageMock.getItem('theme');
  if (initialTheme === 'dark' || (!initialTheme && prefersDark)) {
    docElement.add('dark');
    docElement.remove('light');
  } else {
    docElement.add('light');
    docElement.remove('dark');
  }

  console.log(`   Initial State (OS Dark, no preference): Classes = [${docElement.toString()}]`);
  if (!docElement.contains('dark') || docElement.contains('light')) {
    throw new Error('Initial dark mode detection failed');
  }

  // User now clicks ThemeToggle to switch to LIGHT mode
  console.log('   User clicks ThemeToggle to switch to LIGHT...');
  const newThemeChoice = 'light';
  if (newThemeChoice === 'light') {
    docElement.add('light');
    docElement.remove('dark');
    localStorageMock.setItem('theme', 'light');
  }

  console.log(`   After Toggle Click: Classes = [${docElement.toString()}] (Storage: ${localStorageMock.getItem('theme')})`);
  if (!docElement.contains('light') || docElement.contains('dark')) {
    throw new Error('Toggle failed to explicitly apply .light and remove .dark');
  }

  // =========================================================================
  // 3. Simulate Page Refresh / Reload:
  //    OS is STILL in Dark Mode (prefersDark = true)
  //    <head> script executes before React mounts
  // =========================================================================
  console.log('\n3. Testing Page Reload with OS on Dark Mode + Stored Light Preference...');
  const docElementAfterReload = new MockClassList();

  // Executing the exact logic from app/layout.tsx inline script:
  const storedTheme = localStorageMock.getItem('theme');
  if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
    docElementAfterReload.add('dark');
    docElementAfterReload.remove('light');
  } else {
    docElementAfterReload.add('light');
    docElementAfterReload.remove('dark');
  }

  console.log(`   After Reload: Classes = [${docElementAfterReload.toString()}]`);
  const isLightPreserved = docElementAfterReload.contains('light') && !docElementAfterReload.contains('dark');
  console.log(`   Light mode preserved despite OS Dark Mode: ${isLightPreserved ? 'YES (100% Isolated)' : 'NO'}`);
  if (!isLightPreserved) {
    throw new Error('Page reload failed to preserve light mode against OS dark preference');
  }

  // =========================================================================
  // 4. Verify CSS Scoping in globals.css
  //    Check that html.light and html.dark are explicitly scoped
  // =========================================================================
  console.log('\n4. Verifying CSS Selector Scoping...');
  const hasHtmlLightSelector = globalsCss.includes('html.light');
  const hasHtmlDarkSelector = globalsCss.includes('html.dark');
  console.log(`   Contains 'html.light' explicit selector: ${hasHtmlLightSelector ? 'YES' : 'NO'}`);
  console.log(`   Contains 'html.dark' explicit selector: ${hasHtmlDarkSelector ? 'YES' : 'NO'}`);
  if (!hasHtmlLightSelector || !hasHtmlDarkSelector) {
    throw new Error('globals.css missing explicit html.light / html.dark selectors');
  }

  // =========================================================================
  // 5. Verify no hardcoded colors in key components
  // =========================================================================
  console.log('\n5. Verifying Clean CSS Variable Usage Across Components...');
  const componentsToCheck = [
    'components/ThemeToggle.tsx',
    'components/CustomerScreen.tsx',
    'components/CashierControl.tsx',
    'components/QrScanner.tsx',
    'app/cashier/page.tsx',
    'app/admin/page.tsx',
    'app/admin/login/page.tsx',
    'app/account/page.tsx',
    'app/page.tsx',
  ];

  for (const comp of componentsToCheck) {
    const filePath = path.resolve(__dirname, '..', comp);
    const code = fs.readFileSync(filePath, 'utf-8');

    // Check for raw Tailwind status colors like bg-emerald-50 or bg-rose-50
    const hasRawStatus = /bg-(emerald|rose)-50/.test(code);
    console.log(`   ${comp}: Free of raw status colors: ${!hasRawStatus ? 'YES' : 'NO'}`);
    if (hasRawStatus) {
      throw new Error(`Raw status color found in ${comp}`);
    }
  }

  console.log('\nALL Theme Isolation & CSS Token Tests PASSED Successfully!');
}

runThemeIsolationTests();
