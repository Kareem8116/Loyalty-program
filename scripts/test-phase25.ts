import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { generateQrToken, extractCustomerToken } from '../lib/customer';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log('  [PASS] ' + testName);
    passedTests++;
  } else {
    console.error('  [FAIL] ' + testName);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  Phase 25: 9-Character Customer Code & Hardware Scanner Suite');
  console.log('================================================================\n');

  // --- Group 1: 9-Character Code Generation ---
  console.log('--- Test Group 1: 9-Character Code Generation & Clean Alphabet ---');
  const token = generateQrToken();
  assert(token.length === 9, 'Token length is exactly 9 characters (got: ' + token + ')');
  assert(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{9}$/.test(token), 'Token matches clean unambiguous alphanumeric alphabet');
  assert(!token.includes('0') && !token.includes('O'), 'Token does not contain confusing 0 or O');
  assert(!token.includes('1') && !token.includes('I') && !token.includes('L'), 'Token does not contain confusing 1, I, or L');

  // Uniqueness check across 100 generations
  const sampleSet = new Set<string>();
  for (let i = 0; i < 100; i++) {
    sampleSet.add(generateQrToken());
  }
  assert(sampleSet.size === 100, '100 generated tokens are unique without collisions');

  // --- Group 2: Token Extraction Engine ---
  console.log('\n--- Test Group 2: Token Extraction Engine (HID Scanner Compatibility) ---');
  const code9 = '7X9K2M4P1';
  assert(extractCustomerToken(code9) === '7X9K2M4P1', 'Extracts direct 9-character code');
  assert(extractCustomerToken('7x9k2m4p1') === '7X9K2M4P1', 'Normalizes lowercase 9-character code to uppercase');
  assert(extractCustomerToken(' 7X9-K2M-4P1 ') === '7X9K2M4P1', 'Normalizes hyphenated 9-character code (7X9-K2M-4P1)');
  assert(
    extractCustomerToken('https://demo.loyalty.app/card/7X9K2M4P1') === '7X9K2M4P1',
    'Extracts 9-character code from full customer card URL'
  );
  assert(
    extractCustomerToken('https://coffee.domain.com/card/7x9-k2m-4p1?ref=cashier') === '7X9K2M4P1',
    'Extracts hyphenated lowercase code from card URL with query params'
  );

  const uuidSample = 'a80b7b05-a05e-463f-bf74-cd38d215990a';
  assert(extractCustomerToken(uuidSample) === uuidSample, 'Extracts raw 36-character UUID');
  assert(
    extractCustomerToken('https://demo.loyalty.app/card/' + uuidSample) === uuidSample,
    'Extracts UUID from full card URL'
  );

  // --- Group 3: Zero Emojis Compliance (RULES.md 3.2) ---
  console.log('\n--- Test Group 3: Zero Emojis Compliance Across UI & Translations ---');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

  const arPath = path.join(process.cwd(), 'messages/ar.json');
  const enPath = path.join(process.cwd(), 'messages/en.json');
  const arRaw = fs.readFileSync(arPath, 'utf8');
  const enRaw = fs.readFileSync(enPath, 'utf8');
  const qrScannerSrc = fs.readFileSync(path.join(process.cwd(), 'components/QrScanner.tsx'), 'utf8');

  assert(!emojiRegex.test(arRaw), 'Arabic translation catalog contains ZERO emojis');
  assert(!emojiRegex.test(enRaw), 'English translation catalog contains ZERO emojis');
  assert(!emojiRegex.test(qrScannerSrc), 'QrScanner.tsx component source contains ZERO emojis');

  // --- Group 4: Translation Parity ---
  console.log('\n--- Test Group 4: 100% Translation Key Parity ---');
  const arObj = JSON.parse(arRaw);
  const enObj = JSON.parse(enRaw);

  const arQrKeys = Object.keys(arObj.qrScanner || {}).sort();
  const enQrKeys = Object.keys(enObj.qrScanner || {}).sort();
  assert(
    JSON.stringify(arQrKeys) === JSON.stringify(enQrKeys),
    'qrScanner translation keys have 100% parity between ar.json and en.json'
  );
  assert(arQrKeys.includes('modeExternal') && arQrKeys.includes('modeCamera'), 'Contains mode switcher keys');
  assert(arQrKeys.includes('externalReady') && arQrKeys.includes('externalHint'), 'Contains external scanner status keys');

  // --- Summary ---
  console.log('\n================================================================');
  console.log('Phase 25 Test Summary: ' + passedTests + ' PASSED, ' + failedTests + ' FAILED');
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});