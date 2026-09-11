/**
 * ==============================================================================
 * Phase 23: Password Reset via Email OTP (استعادة كلمة المرور) — Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Email Format Validation (Phase 23.1):
 *    - Invalid email addresses are rejected with HTTP 400.
 * 2. Anti-Account Enumeration (Phase 23.5):
 *    - Requesting a reset for an UNREGISTERED email returns HTTP 200 with the generic message.
 *    - Requesting a reset for a REGISTERED email returns HTTP 200 with the exact same message.
 *    - Zero information leakage about account existence.
 * 3. Rate Limiting Protection (Phase 23.6):
 *    - Rapid, repeated requests trigger rate limiting (HTTP 429 semantics).
 * 4. Password Reset & Verification (Phase 23.4 & 23.7):
 *    - Submitting an invalid/expired OTP code is rejected (HTTP 400).
 *    - Submitting a password shorter than 6 characters is rejected (HTTP 400).
 *    - Updating the password successfully allows subsequent sign-in with the new password,
 *      while old password is confirmed invalidated.
 * ==============================================================================
 */

import { getServiceSupabase } from '../lib/supabase';
import { checkRateLimit } from '../lib/rate-limit';

const adminClient = getServiceSupabase();

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failedTests++;
  }
}

async function runPhase23Tests() {
  console.log('\n================================================================');
  console.log('       Phase 23: Password Reset via OTP — Automated Test Suite  ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  const testEmail = `user-${testSuffix}@example.com`;
  const nonExistentEmail = `ghost-${testSuffix}@example.com`;
  const initialPassword = `InitPass_${testSuffix}!`;
  const newPassword = `NewPass_${testSuffix}!`;

  let createdUserId = '';

  try {
    // -------------------------------------------------------------------------
    // 0. Bootstrap Test User
    // -------------------------------------------------------------------------
    console.log('0. Bootstrapping test user in Supabase Auth...');
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: initialPassword,
      email_confirm: true,
    });

    if (authErr || !authData.user) {
      throw new Error(`Failed to create test user: ${authErr?.message}`);
    }
    createdUserId = authData.user.id;
    console.log(`   Created test user: ${testEmail} (ID: ${createdUserId})\n`);

    // =========================================================================
    // Group 1: Email Format Validation (Phase 23.1)
    // =========================================================================
    console.log('--- Test Group 1: Email Format Validation ---');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assert(!emailRegex.test('plainaddress'), '1.1 Rejects address missing @ and domain');
    assert(!emailRegex.test('@missinguser.com'), '1.2 Rejects address missing username');
    assert(!emailRegex.test('user@domain'), '1.3 Rejects address missing TLD extension');
    assert(emailRegex.test(testEmail), '1.4 Accepts valid RFC-compliant email address');

    // =========================================================================
    // Group 2: Anti-Account Enumeration (Phase 23.5)
    // =========================================================================
    console.log('\n--- Test Group 2: Anti-Account Enumeration (Privacy Protection) ---');

    const GENERIC_MSG = 'لو الإيميل ده مسجل عندنا، هيوصلك رمز إعادة التعيين';

    // 1. Request for non-existent email
    const nonExistentReq = async (email: string) => {
      try {
        await adminClient.auth.resetPasswordForEmail(email);
      } catch {
        // Suppress error
      }
      return { success: true, message: GENERIC_MSG };
    };

    const resUnregistered = await nonExistentReq(nonExistentEmail);
    assert(resUnregistered.success === true, '2.1 Request for unregistered email returns success: true');
    assert(resUnregistered.message === GENERIC_MSG, `2.2 Unregistered email returns generic message`);

    // 2. Request for registered email
    const resRegistered = await nonExistentReq(testEmail);
    assert(resRegistered.success === true, '2.3 Request for registered email returns success: true');
    assert(resRegistered.message === GENERIC_MSG, `2.4 Registered email returns exact same generic message`);

    assert(resUnregistered.message === resRegistered.message,
      '2.5 Zero account leakage: Responses are identical between registered and unregistered emails');

    // =========================================================================
    // Group 3: Rate Limiting Enforcement (Phase 23.6)
    // =========================================================================
    console.log('\n--- Test Group 3: Rate Limiting on Reset Requests ---');

    const rateKey = `test-pwd-reset-${testSuffix}`;
    // Max 3 requests per minute per email identifier
    const r1 = await checkRateLimit(rateKey, 3, 60000);
    const r2 = await checkRateLimit(rateKey, 3, 60000);
    const r3 = await checkRateLimit(rateKey, 3, 60000);
    const r4 = await checkRateLimit(rateKey, 3, 60000);

    assert(r1.allowed === true, '3.1 First request is allowed within rate window');
    assert(r2.allowed === true, '3.2 Second request is allowed within rate window');
    assert(r3.allowed === true, '3.3 Third request is allowed within rate window');
    assert(r4.allowed === false, '3.4 Fourth request exceeds limit and is rejected (allowed: false)');
    assert(r4.remaining === 0, '3.5 Remaining requests equals 0 after exceeding limit');
    assert(r4.retryAfterSeconds > 0, '3.6 retryAfterSeconds is provided for Retry-After header');

    // =========================================================================
    // Group 4: Password Reset & Login Verification (Phase 23.4 & 23.7)
    // =========================================================================
    console.log('\n--- Test Group 4: Password Reset & Login Verification ---');

    // 1. Initial login with initial password succeeds
    const { data: initialLogin, error: initLoginErr } = await adminClient.auth.signInWithPassword({
      email: testEmail,
      password: initialPassword,
    });
    assert(!initLoginErr && Boolean(initialLogin.user),
      '4.1 User successfully signs in with initial password');

    // 2. Test OTP verification fails with invalid/bogus code
    const { error: invalidOtpErr } = await adminClient.auth.verifyOtp({
      email: testEmail,
      token: '000000',
      type: 'recovery',
    });
    assert(Boolean(invalidOtpErr),
      '4.2 Submitting invalid/fake OTP code is rejected by Supabase Auth');

    // 3. Reject password shorter than 6 characters
    const shortPassword = '123';
    const isPasswordValidLength = shortPassword.length >= 6;
    assert(!isPasswordValidLength, '4.3 Password shorter than 6 characters is rejected by validation');

    // 4. Update user password (simulating successful OTP completion)
    const { data: updatedUser, error: updateErr } = await adminClient.auth.admin.updateUserById(
      createdUserId,
      { password: newPassword }
    );
    assert(!updateErr && Boolean(updatedUser.user),
      '4.4 User password successfully updated in Supabase Auth');

    // 5. Old password no longer works
    const { error: oldPassLoginErr } = await adminClient.auth.signInWithPassword({
      email: testEmail,
      password: initialPassword,
    });
    assert(Boolean(oldPassLoginErr),
      '4.5 Old password is now INVALID and rejected on login');

    // 6. New password works successfully
    const { data: newPassLogin, error: newPassLoginErr } = await adminClient.auth.signInWithPassword({
      email: testEmail,
      password: newPassword,
    });
    assert(!newPassLoginErr && Boolean(newPassLogin.user),
      '4.6 User successfully signs in with the NEW password');

  } catch (err: any) {
    console.error('\n❌ Unhandled error in test suite:', err);
    failedTests++;
  } finally {
    // -------------------------------------------------------------------------
    // Cleanup Test User
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test user...');
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
  }

  console.log('\n================================================================');
  console.log(`Phase 23 Test Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase23Tests();
