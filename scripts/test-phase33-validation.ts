/**
 * scripts/test-phase33-validation.ts
 * Automated Test Suite for Phase 33: Centralized Input Validation Layer
 */

import {
  validateEgyptianPhone,
  formatEgyptianPhoneToInternational,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validatePin,
  validateName,
  validatePositiveNumber,
} from '../lib/validation';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Starting Phase 33 Input Validation Tests');
  console.log('========================================\n');

  // 1. Egyptian Phone Validation Progressive Checks
  console.log('--- 1. Egyptian Phone Validation (RULES.md 3.8) ---');
  
  // Empty
  const phoneEmpty = validateEgyptianPhone('');
  assert(!phoneEmpty.isValid && phoneEmpty.stage === 'empty' && phoneEmpty.errorKey === 'phonePrefixStart', 'Empty phone gives phonePrefixStart');

  // Starts without 01
  const phoneNo01_1 = validateEgyptianPhone('1234567890');
  assert(!phoneNo01_1.isValid && phoneNo01_1.stage === 'prefix_01' && phoneNo01_1.errorKey === 'phonePrefixStart', '1234567890 gives phonePrefixStart');

  const phoneNo01_2 = validateEgyptianPhone('0212345678');
  assert(!phoneNo01_2.isValid && phoneNo01_2.stage === 'prefix_01' && phoneNo01_2.errorKey === 'phonePrefixStart', '0212345678 gives phonePrefixStart');

  // Starts with 01 but 3rd digit is invalid network (013, 014, 016, etc.)
  const phoneBadNet_1 = validateEgyptianPhone('01312345678');
  assert(!phoneBadNet_1.isValid && phoneBadNet_1.stage === 'prefix_network' && phoneBadNet_1.errorKey === 'phonePrefixValid', '01312345678 gives phonePrefixValid');

  const phoneBadNet_2 = validateEgyptianPhone('01412345678');
  assert(!phoneBadNet_2.isValid && phoneBadNet_2.stage === 'prefix_network' && phoneBadNet_2.errorKey === 'phonePrefixValid', '01412345678 gives phonePrefixValid');

  const phoneBadNet_3 = validateEgyptianPhone('01612345678');
  assert(!phoneBadNet_3.isValid && phoneBadNet_3.stage === 'prefix_network' && phoneBadNet_3.errorKey === 'phonePrefixValid', '01612345678 gives phonePrefixValid');

  // Valid prefix but length < 11
  const phoneShort_1 = validateEgyptianPhone('010123');
  assert(!phoneShort_1.isValid && phoneShort_1.stage === 'length' && phoneShort_1.errorKey === 'phoneLength', '010123 (< 11) gives phoneLength');

  const phoneShort_2 = validateEgyptianPhone('0111234567'); // 10 digits
  assert(!phoneShort_2.isValid && phoneShort_2.stage === 'length' && phoneShort_2.errorKey === 'phoneLength', '0111234567 (10 digits) gives phoneLength');

  // Valid prefix but length > 11
  const phoneLong = validateEgyptianPhone('010123456789'); // 12 digits
  assert(!phoneLong.isValid && phoneLong.stage === 'too_long' && phoneLong.errorKey === 'phoneLength', '010123456789 (12 digits) gives phoneLength');

  // Exactly 11 digits with 010 (Vodafone)
  const phoneVodafone = validateEgyptianPhone('01012345678');
  assert(phoneVodafone.isValid && phoneVodafone.stage === 'valid' && phoneVodafone.cleanPhone === '01012345678', '01012345678 (Vodafone) is valid');

  // Exactly 11 digits with 011 (Etisalat)
  const phoneEtisalat = validateEgyptianPhone('01112345678');
  assert(phoneEtisalat.isValid && phoneEtisalat.stage === 'valid' && phoneEtisalat.cleanPhone === '01112345678', '01112345678 (Etisalat) is valid');

  // Exactly 11 digits with 012 (Orange)
  const phoneOrange = validateEgyptianPhone('01212345678');
  assert(phoneOrange.isValid && phoneOrange.stage === 'valid' && phoneOrange.cleanPhone === '01212345678', '01212345678 (Orange) is valid');

  // Exactly 11 digits with 015 (WE)
  const phoneWe = validateEgyptianPhone('01512345678');
  assert(phoneWe.isValid && phoneWe.stage === 'valid' && phoneWe.cleanPhone === '01512345678', '01512345678 (WE) is valid');

  // Phone with spaces and dashes
  const phoneFormatted = validateEgyptianPhone('010-1234-5678');
  assert(phoneFormatted.isValid && phoneFormatted.cleanPhone === '01012345678', '010-1234-5678 formatted is cleaned and valid');

  // International formatting
  const formattedE164 = formatEgyptianPhoneToInternational('01012345678');
  assert(formattedE164 === '+201012345678', 'formatEgyptianPhoneToInternational returns +201012345678');


  // 2. Email Validation
  console.log('\n--- 2. Email Validation ---');
  assert(!validateEmail('').isValid, 'Empty email is invalid');
  assert(!validateEmail('plainaddress').isValid, 'Plain address is invalid');
  assert(!validateEmail('@missingusername.com').isValid, 'Missing username is invalid');
  assert(!validateEmail('user@missingtld').isValid, 'Missing TLD is invalid');
  assert(validateEmail('customer@example.com').isValid, 'customer@example.com is valid');
  assert(validateEmail('TEST.user+label@Sub.Domain.co').isValid, 'Complex valid email is accepted');


  // 3. Password Validation
  console.log('\n--- 3. Password Validation (min 8 chars, letter + number) ---');
  assert(!validatePassword('').isValid && validatePassword('').errorKey === 'passwordMinLength', 'Empty password gives passwordMinLength');
  assert(!validatePassword('1234567').isValid && validatePassword('1234567').errorKey === 'passwordMinLength', '7 chars gives passwordMinLength');
  assert(!validatePassword('abcdefgh').isValid && validatePassword('abcdefgh').errorKey === 'passwordRequirements', '8 letters without numbers gives passwordRequirements');
  assert(!validatePassword('12345678').isValid && validatePassword('12345678').errorKey === 'passwordRequirements', '8 numbers without letters gives passwordRequirements');
  assert(validatePassword('Pass1234').isValid, 'Pass1234 is valid');
  assert(validatePassword('كلمةسر1234').isValid, 'Arabic letters with numbers (كلمةسر1234) is valid');


  // 4. Password Confirmation
  console.log('\n--- 4. Password Confirmation ---');
  assert(!validatePasswordConfirmation('Pass1234', 'Pass5678').isValid && validatePasswordConfirmation('Pass1234', 'Pass5678').errorKey === 'passwordMismatch', 'Mismatch gives passwordMismatch');
  assert(validatePasswordConfirmation('Pass1234', 'Pass1234').isValid, 'Matching passwords return valid');


  // 5. PIN Validation (4 digits)
  console.log('\n--- 5. PIN Validation (4 digits) ---');
  assert(!validatePin('').isValid && validatePin('').errorKey === 'pinLength', 'Empty PIN gives pinLength');
  assert(!validatePin('123').isValid && validatePin('123').errorKey === 'pinLength', '3-digit PIN gives pinLength');
  assert(!validatePin('12345').isValid && validatePin('12345').errorKey === 'pinLength', '5-digit PIN gives pinLength');
  assert(!validatePin('abcd').isValid && validatePin('abcd').errorKey === 'pinLength', 'Non-numeric PIN gives pinLength');
  assert(validatePin('1234').isValid, '4-digit PIN 1234 is valid');
  assert(validatePin('0000').isValid, '4-digit PIN 0000 is valid');


  // 6. Name Validation
  console.log('\n--- 6. Name Validation (at least 1 letter, not pure numbers/symbols) ---');
  assert(!validateName('').isValid && validateName('').errorKey === 'nameRequired', 'Empty name gives nameRequired');
  assert(!validateName('   ').isValid && validateName('   ').errorKey === 'nameRequired', 'Whitespace name gives nameRequired');
  assert(!validateName('123456').isValid && validateName('123456').errorKey === 'nameRequired', 'Pure numbers gives nameRequired');
  assert(!validateName('!@#$%^').isValid && validateName('!@#$%^').errorKey === 'nameRequired', 'Pure symbols gives nameRequired');
  assert(validateName('أحمد محمد').isValid, 'Arabic name (أحمد محمد) is valid');
  assert(validateName('Karim Tarek').isValid, 'English name (Karim Tarek) is valid');
  assert(validateName('Store #1').isValid, 'Name with letters and numbers/symbols is valid');


  // 7. Positive Number Validation
  console.log('\n--- 7. Positive Number Validation ---');
  assert(!validatePositiveNumber(0, false).isValid && validatePositiveNumber(0, false).errorKey === 'positiveNumber', '0 with allowZero=false is invalid');
  assert(validatePositiveNumber(0, true).isValid, '0 with allowZero=true is valid');
  assert(!validatePositiveNumber(-10, true).isValid, 'Negative number is invalid');
  assert(!validatePositiveNumber('not-a-number').isValid, 'NaN is invalid');
  assert(validatePositiveNumber('15.5').isValid && validatePositiveNumber('15.5').value === 15.5, 'Numeric string 15.5 is valid and parsed');
  assert(validatePositiveNumber(100).isValid && validatePositiveNumber(100).value === 100, 'Number 100 is valid');

  console.log('\n========================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during validation testing:', err);
  process.exit(1);
});
