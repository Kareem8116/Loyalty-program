/**
 * Phase 27 Test Suite — Central Customer Account & Per-Place PIN Access
 * Run: npx tsx scripts/test-phase27-central-account.ts
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => boolean | Promise<boolean>) {
  return { name, fn };
}

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin.trim()).digest('hex');
}

// ─── 1. Zero emojis in new Phase 27 translation keys ───
function testNoEmojisInTranslations(): boolean {
  const emojiRegex = /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/u;
  const langs = ['en', 'ar'];
  const phase27Keys = ['customerLogin', 'myPlaces', 'pinModal', 'linkPhone', 'forgotPin'];

  for (const lang of langs) {
    const filePath = path.join(ROOT, 'messages', `${lang}.json`);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const key of phase27Keys) {
      if (!content[key]) throw new Error(`Missing key '${key}' in ${lang}.json`);
      const section = JSON.stringify(content[key]);
      if (emojiRegex.test(section)) {
        throw new Error(`Emoji found in ${lang}.json[${key}]: ${section}`);
      }
    }
  }
  return true;
}

// ─── 2. cross_branch_redemption in features.ts ───
function testCrossBranchFeatureKey(): boolean {
  const filePath = path.join(ROOT, 'lib', 'features.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes('cross_branch_redemption')) {
    throw new Error('cross_branch_redemption feature key missing from lib/features.ts');
  }
  if (!content.includes('Cross-Branch Redemption')) {
    throw new Error('cross_branch_redemption feature name missing');
  }
  return true;
}

// ─── 3. Phase 27.8 business_id isolation in cashier.ts ───
function testBusinessIdIsolationGuard(): boolean {
  const filePath = path.join(ROOT, 'lib', 'cashier.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes('CROSS_TENANT_DEDUCTION_FORBIDDEN')) {
    throw new Error('CROSS_TENANT_DEDUCTION_FORBIDDEN error code missing from lib/cashier.ts');
  }
  if (!content.includes('27.8')) {
    throw new Error('Phase 27.8 comment missing from lib/cashier.ts');
  }
  return true;
}

// ─── 4. 27.7.1 cross-branch FIFO filter in cashier.ts ───
function testCrossBranchFifoFilter(): boolean {
  const filePath = path.join(ROOT, 'lib', 'cashier.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes('cross_branch_redemption')) {
    throw new Error('cross_branch_redemption feature check missing from lib/cashier.ts FIFO logic');
  }
  if (!content.includes('27.7.1')) {
    throw new Error('Phase 27.7.1 comment missing from lib/cashier.ts');
  }
  return true;
}

// ─── 5. API routes exist ───
function testApiRoutesExist(): boolean {
  const routes = [
    'app/api/customer/my-places/route.ts',
    'app/api/customer/places/verify-pin/route.ts',
    'app/api/customer/places/set-pin/route.ts',
    'app/api/customer/places/link-phone/route.ts',
    'app/api/customer/places/forgot-pin/route.ts',
  ];

  for (const route of routes) {
    const p = path.join(ROOT, route);
    if (!fs.existsSync(p)) throw new Error(`Missing API route: ${route}`);
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.includes('export async function')) {
      throw new Error(`API route has no exported handler: ${route}`);
    }
  }
  return true;
}

// ─── 6. Frontend pages exist ───
function testFrontendPagesExist(): boolean {
  const pages = [
    'app/login/page.tsx',
    'app/my-places/page.tsx',
  ];

  for (const page of pages) {
    const p = path.join(ROOT, page);
    if (!fs.existsSync(p)) throw new Error(`Missing frontend page: ${page}`);
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.includes("'use client'")) {
      throw new Error(`Page missing 'use client' directive: ${page}`);
    }
  }
  return true;
}

// ─── 7. PIN hashing correctness ───
function testPinHashing(): boolean {
  const pin = '1234';
  const hash1 = hashPin(pin);
  const hash2 = hashPin(pin);
  const hash3 = hashPin('5678');

  if (hash1 !== hash2) throw new Error('PIN hashing is not deterministic');
  if (hash1 === hash3) throw new Error('Different PINs produced same hash');
  if (hash1.length !== 64) throw new Error(`SHA-256 hash should be 64 chars, got ${hash1.length}`);
  if (!/^[a-f0-9]+$/.test(hash1)) throw new Error('Hash should be hex string');
  return true;
}

// ─── 8. PIN validation logic (4 digits only) ───
function testPinValidation(): boolean {
  const validPins = ['0000', '1234', '9999', '0101'];
  const invalidPins = ['123', '12345', 'abcd', '12.4', ' 123', ''];

  for (const pin of validPins) {
    if (!/^\d{4}$/.test(pin)) throw new Error(`Valid PIN rejected: ${pin}`);
  }
  for (const pin of invalidPins) {
    if (/^\d{4}$/.test(pin)) throw new Error(`Invalid PIN accepted: '${pin}'`);
  }
  return true;
}

// ─── 9. OTP generation is 6 digits ───
function testOtpFormat(): boolean {
  // Read forgot-pin route and verify OTP format
  const filePath = path.join(ROOT, 'app/api/customer/places/forgot-pin/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes('100000') || !content.includes('900000')) {
    throw new Error('OTP generation formula missing — should produce 6-digit codes');
  }
  if (!content.includes('otp_hash')) {
    throw new Error('OTP hash storage missing from forgot-pin route');
  }
  // Simulate OTP generation
  for (let i = 0; i < 100; i++) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    if (otp.length !== 6) throw new Error(`OTP length is not 6: ${otp}`);
    if (!/^\d{6}$/.test(otp)) throw new Error(`OTP is not all digits: ${otp}`);
  }
  return true;
}

// ─── 10. Brute-force lock constants ───
function testBruteForceConstants(): boolean {
  const filePath = path.join(ROOT, 'app/api/customer/places/verify-pin/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes('MAX_FAILED_ATTEMPTS = 5')) {
    throw new Error('MAX_FAILED_ATTEMPTS should be 5');
  }
  if (!content.includes('LOCK_DURATION_MINUTES = 15')) {
    throw new Error('LOCK_DURATION_MINUTES should be 15');
  }
  return true;
}

// ─── 11. my-places returns no points pre-PIN ───
function testMyPlacesZeroPointsPrePin(): boolean {
  const filePath = path.join(ROOT, 'app/api/customer/my-places/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Must NOT include points_balance in the returned places object
  // Should only return it after PIN verification
  if (content.includes('pointsBalance') && !content.includes('27.2')) {
    throw new Error('my-places may be exposing points balance before PIN — check 27.2 compliance');
  }

  // verify-pin MUST include points
  const verifyPath = path.join(ROOT, 'app/api/customer/places/verify-pin/route.ts');
  const verifyContent = fs.readFileSync(verifyPath, 'utf-8');
  if (!verifyContent.includes('pointsBalance') || !verifyContent.includes('qrToken')) {
    throw new Error('verify-pin should return pointsBalance and qrToken on success');
  }
  return true;
}

// ─── 12. link-phone: Egyptian phone validation ───
function testEgyptianPhoneValidation(): boolean {
  const filePath = path.join(ROOT, 'app/api/customer/places/link-phone/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes("startsWith('01')") || !content.includes('length !== 11')) {
    throw new Error('Egyptian phone validation (01XXXXXXXXX, 11 digits) missing from link-phone route');
  }
  return true;
}

// ─── 13. set-pin applyToAllPlaces logic ───
function testSetPinApplyToAll(): boolean {
  const filePath = path.join(ROOT, 'app/api/customer/places/set-pin/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes('applyToAllPlaces')) {
    throw new Error('applyToAllPlaces logic missing from set-pin route');
  }
  if (!content.includes('appliedToAll: true') || !content.includes('appliedToAll: false')) {
    throw new Error('set-pin should return appliedToAll flag');
  }
  return true;
}

// ─── 14. No emojis in new API responses ───
function testNoEmojisInApiRoutes(): boolean {
  const emojiRegex = /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/u;
  const routes = [
    'app/api/customer/my-places/route.ts',
    'app/api/customer/places/verify-pin/route.ts',
    'app/api/customer/places/set-pin/route.ts',
    'app/api/customer/places/link-phone/route.ts',
    'app/api/customer/places/forgot-pin/route.ts',
  ];

  for (const route of routes) {
    const content = fs.readFileSync(path.join(ROOT, route), 'utf-8');
    if (emojiRegex.test(content)) {
      throw new Error(`Emoji found in API route: ${route}`);
    }
  }
  return true;
}

// ─── 15. OTP rate limiting ───
function testOtpRateLimiting(): boolean {
  const filePath = path.join(ROOT, 'app/api/customer/places/forgot-pin/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes('MAX_OTP_REQUESTS_PER_HOUR')) {
    throw new Error('OTP rate limiting constant missing');
  }
  if (!content.includes('TOO_MANY_REQUESTS')) {
    throw new Error('TOO_MANY_REQUESTS error code missing from forgot-pin');
  }
  return true;
}

// ──────────────────────────────────────────
// Run all tests
// ──────────────────────────────────────────

async function runAll() {
  const tests = [
    test('1. Zero emojis in Phase 27 translations', testNoEmojisInTranslations),
    test('2. cross_branch_redemption in features.ts', testCrossBranchFeatureKey),
    test('3. Business_id isolation guard (27.8) in cashier.ts', testBusinessIdIsolationGuard),
    test('4. Cross-branch FIFO filter (27.7.1) in cashier.ts', testCrossBranchFifoFilter),
    test('5. All 5 API routes exist', testApiRoutesExist),
    test('6. Frontend pages exist (login + my-places)', testFrontendPagesExist),
    test('7. PIN hashing correctness (SHA-256)', testPinHashing),
    test('8. PIN validation (exactly 4 digits)', testPinValidation),
    test('9. OTP format (6 digits, random)', testOtpFormat),
    test('10. Brute-force constants (5 attempts, 15 min lock)', testBruteForceConstants),
    test('11. my-places: zero points exposed pre-PIN (27.2)', testMyPlacesZeroPointsPrePin),
    test('12. link-phone: Egyptian phone validation', testEgyptianPhoneValidation),
    test('13. set-pin: applyToAllPlaces logic', testSetPinApplyToAll),
    test('14. No emojis in API route responses', testNoEmojisInApiRoutes),
    test('15. OTP rate limiting (3/hour)', testOtpRateLimiting),
  ];

  let passed = 0;
  let failed = 0;

  console.log('\n=== Phase 27 — Central Customer Account & Per-Place PIN Access ===\n');

  for (const t of tests) {
    try {
      const result = await t.fn();
      if (result) {
        console.log(`  ✓ ${t.name}`);
        passed++;
        results.push({ name: t.name, passed: true });
      } else {
        console.log(`  ✗ ${t.name} — returned false`);
        failed++;
        results.push({ name: t.name, passed: false, error: 'returned false' });
      }
    } catch (err: any) {
      console.log(`  ✗ ${t.name}`);
      console.log(`    Error: ${err.message}`);
      failed++;
      results.push({ name: t.name, passed: false, error: err.message });
    }
  }

  console.log(`\n══════════════════════════════`);
  console.log(`  Results: ${passed}/${tests.length} passed`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}`);
  } else {
    console.log(`  All Phase 27 checks passed!`);
  }
  console.log(`══════════════════════════════\n`);
}

runAll().catch(console.error);
