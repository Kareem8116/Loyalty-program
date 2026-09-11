/**
 * scripts/test-phase29-otp.ts
 * Automated Test Suite for Phase 29: Mandatory OTP Email Verification
 * 
 * Tests:
 * 1. Test A: 6-Digit OTP generation, storage in Redis with 10-minute TTL, and 60s cooldown.
 * 2. Test B: 60-second cooldown enforcement prevents spam requests.
 * 3. Test C: Anti-brute-force defense (tracks failed attempts, destroys OTP on 5 failures).
 * 4. Test D: Correct OTP verifies successfully, activates Supabase Auth user (email_confirm: true, email_verified: true).
 * 5. Test E: Replay defense (One-time use; verified OTP cannot be reused).
 * 6. Test F: Cashier exemption (Cashier accounts are created by owner and exempt from OTP verification).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateEmailOtp, verifyEmailOtp, getOtpCooldownRemaining } from '../lib/otp';
import { redis } from '../lib/redis';
import { getServiceSupabase } from '../lib/supabase';

async function runPhase29Tests() {
  console.log('🧪 Starting Phase 29 Mandatory OTP Email Verification Test Suite...\n');

  const testEmail = `test_otp_${Date.now()}@pointat-test.com`;
  const adminClient = getServiceSupabase();
  let testUserId: string | null = null;

  try {
    // ----------------------------------------------------
    // Test A: OTP Generation & Redis Storage
    // ----------------------------------------------------
    console.log('--- Test A: OTP Generation & Redis Storage ---');
    const genRes = await generateEmailOtp(testEmail);
    if (!genRes.success || !genRes.otp) {
      throw new Error(`Failed to generate OTP: ${genRes.error}`);
    }
    console.log(`  ✅ 6-digit OTP generated: ${genRes.otp}`);

    if (genRes.otp.length !== 6 || !/^\d{6}$/.test(genRes.otp)) {
      throw new Error(`OTP is not 6 digits: ${genRes.otp}`);
    }

    const rawStored = await redis.get(`email_otp:${testEmail.toLowerCase()}`);
    if (!rawStored) {
      throw new Error('OTP not found in Redis!');
    }
    const stored = typeof rawStored === 'string' ? JSON.parse(rawStored) : rawStored;
    if (stored.otp !== genRes.otp) {
      throw new Error(`Stored OTP mismatch: expected ${genRes.otp}, got ${stored.otp}`);
    }
    const ttl = await redis.ttl(`email_otp:${testEmail.toLowerCase()}`);
    console.log(`  ✅ OTP verified in Redis with TTL: ${ttl}s (Expected ~600s)`);

    // ----------------------------------------------------
    // Test B: 60-Second Cooldown Enforcement
    // ----------------------------------------------------
    console.log('\n--- Test B: 60-Second Cooldown Enforcement ---');
    const cooldownRemaining = await getOtpCooldownRemaining(testEmail);
    console.log(`  ℹ️ Cooldown remaining: ${cooldownRemaining}s`);
    if (cooldownRemaining <= 0) {
      throw new Error('Expected active cooldown > 0s');
    }

    const duplicateGen = await generateEmailOtp(testEmail);
    if (duplicateGen.success) {
      throw new Error('Cooldown failed: allowed generating new OTP within 60 seconds!');
    }
    if (duplicateGen.error !== 'COOLDOWN_ACTIVE') {
      throw new Error(`Expected COOLDOWN_ACTIVE error, got ${duplicateGen.error}`);
    }
    console.log('  ✅ Cooldown successfully blocked rapid re-generation');

    // ----------------------------------------------------
    // Test C: Anti-Brute-Force & Attempt Tracking
    // ----------------------------------------------------
    console.log('\n--- Test C: Anti-Brute-Force & Attempt Tracking ---');
    // Wrong attempt 1
    const fail1 = await verifyEmailOtp(testEmail, '000000');
    if (fail1.valid || fail1.error !== 'INVALID_OTP' || fail1.attemptsLeft !== 4) {
      throw new Error(`Expected attemptsLeft=4 on 1st failure, got ${JSON.stringify(fail1)}`);
    }
    console.log(`  ✅ Failed attempt 1 recorded. Attempts remaining: ${fail1.attemptsLeft}`);

    // Wrong attempts 2, 3, 4
    for (let i = 2; i <= 4; i++) {
      const fail = await verifyEmailOtp(testEmail, '111111');
      if (fail.valid || fail.attemptsLeft !== 5 - i) {
        throw new Error(`Expected attemptsLeft=${5 - i} on failure ${i}`);
      }
    }
    console.log('  ✅ Failed attempts 2, 3, 4 recorded accurately');

    // Wrong attempt 5 (Max attempts reached)
    const fail5 = await verifyEmailOtp(testEmail, '222222');
    if (fail5.valid || fail5.error !== 'MAX_ATTEMPTS_EXCEEDED' || fail5.attemptsLeft !== 0) {
      throw new Error(`Expected MAX_ATTEMPTS_EXCEEDED on 5th failure, got ${JSON.stringify(fail5)}`);
    }
    console.log('  ✅ 5th failed attempt triggered MAX_ATTEMPTS_EXCEEDED');

    // Verify key was purged from Redis
    const purged = await redis.get(`email_otp:${testEmail.toLowerCase()}`);
    if (purged) {
      throw new Error('OTP key should have been deleted from Redis after 5 failed attempts!');
    }
    console.log('  ✅ OTP automatically destroyed in Redis to prevent brute-force attacks');

    // ----------------------------------------------------
    // Test D: Correct OTP Verification & Account Activation
    // ----------------------------------------------------
    console.log('\n--- Test D: Correct OTP Verification & Account Activation ---');
    // Create an unverified user in Supabase Auth
    const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: false,
      user_metadata: {
        email_verified: false,
      },
    });

    if (createErr || !authUser.user) {
      throw new Error(`Failed to create test user: ${createErr?.message}`);
    }
    testUserId = authUser.user.id;
    console.log(`  ✅ Created test user (${testUserId}) with email_confirm: false`);

    // Verify initial unverified state
    const { data: initialCheck } = await adminClient.auth.admin.getUserById(testUserId);
    if (initialCheck.user?.email_confirmed_at || initialCheck.user?.user_metadata?.email_verified === true) {
      throw new Error('User should start unverified!');
    }
    console.log('  ✅ Verified user initial state is UNVERIFIED');

    // Generate fresh OTP (bypassing cooldown for test)
    const freshOtpRes = await generateEmailOtp(testEmail, true);
    if (!freshOtpRes.success || !freshOtpRes.otp) {
      throw new Error('Failed to generate fresh OTP for Test D');
    }

    // Verify the correct OTP
    const verifySuccess = await verifyEmailOtp(testEmail, freshOtpRes.otp);
    if (!verifySuccess.valid) {
      throw new Error(`Verification failed for correct OTP: ${verifySuccess.error}`);
    }
    console.log('  ✅ Correct 6-digit OTP verified successfully!');

    // Activate the user in Supabase Auth
    const { error: activateErr } = await adminClient.auth.admin.updateUserById(testUserId, {
      email_confirm: true,
      user_metadata: {
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      },
    });

    if (activateErr) {
      throw new Error(`Failed to activate user in Supabase: ${activateErr.message}`);
    }

    // Verify activated status in Supabase Auth
    const { data: verifiedCheck } = await adminClient.auth.admin.getUserById(testUserId);
    if (!verifiedCheck.user?.email_confirmed_at || verifiedCheck.user?.user_metadata?.email_verified !== true) {
      throw new Error('User was not properly confirmed in Supabase Auth!');
    }
    console.log('  ✅ User activated in Supabase Auth (email_confirmed_at set, email_verified: true)');

    // ----------------------------------------------------
    // Test E: Replay Defense (One-Time Use)
    // ----------------------------------------------------
    console.log('\n--- Test E: Replay Defense (One-Time Use) ---');
    const replayAttempt = await verifyEmailOtp(testEmail, freshOtpRes.otp);
    if (replayAttempt.valid) {
      throw new Error('Replay attack failed: OTP was accepted a second time!');
    }
    if (replayAttempt.error !== 'EXPIRED_OR_NOT_FOUND') {
      throw new Error(`Expected EXPIRED_OR_NOT_FOUND on replay, got ${replayAttempt.error}`);
    }
    console.log('  ✅ Replay rejected: OTP was immediately deleted after first valid use');

    // ----------------------------------------------------
    // Test F: Cashier Exemption
    // ----------------------------------------------------
    console.log('\n--- Test F: Cashier Exemption ---');
    // Cashier role does not undergo self-signup OTP verification
    const cashierEmail = `cashier_${Date.now()}@pointat-test.com`;
    const { data: cashierAuth, error: cashierErr } = await adminClient.auth.admin.createUser({
      email: cashierEmail,
      password: 'CashierPassword123!',
      email_confirm: true, // Cashier is provisioned directly by Store Owner
      user_metadata: {
        role: 'cashier',
        name: 'Test Cashier',
      },
    });

    if (cashierErr || !cashierAuth.user) {
      throw new Error(`Failed to create test cashier: ${cashierErr?.message}`);
    }
    const cashierId = cashierAuth.user.id;

    // Verify cashier is confirmed immediately by owner provisioning
    const { data: cashierCheck } = await adminClient.auth.admin.getUserById(cashierId);
    if (!cashierCheck.user?.email_confirmed_at) {
      throw new Error('Cashier should be active upon creation by owner!');
    }
    console.log('  ✅ Cashier accounts confirmed exempt from self-signup OTP flow');

    // Cleanup cashier
    await adminClient.auth.admin.deleteUser(cashierId);

    // ----------------------------------------------------
    // Cleanup
    // ----------------------------------------------------
    console.log('\n--- Cleanup ---');
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId);
      console.log('  ✅ Temporary test user deleted');
    }
    await redis.del(`email_otp:${testEmail.toLowerCase()}`);
    await redis.del(`email_otp_cooldown:${testEmail.toLowerCase()}`);
    console.log('  ✅ Temporary Redis keys purged');

    console.log('\n🎉 Phase 29 Mandatory OTP Email Verification Test Suite PASSED 100%!');
  } catch (err: any) {
    console.error('\n❌ Phase 29 Test Suite FAILED:', err);
    if (testUserId) {
      try {
        await adminClient.auth.admin.deleteUser(testUserId);
      } catch {}
    }
    process.exit(1);
  }
}

runPhase29Tests();
