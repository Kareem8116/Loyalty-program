/**
 * scripts/test-phase34-profile-otp.ts
 * Verification suite for Phase 34: Profile Edit & OTP Verification Engine
 * 
 * Verifies:
 * 1. GET /api/account/profile returns authenticated user profile.
 * 2. PATCH /api/account/profile with action 'update_name' directly updates name.
 * 3. PATCH /api/account/profile with action 'request_otp' for duplicate email returns error.
 * 4. PATCH /api/account/profile with action 'request_otp' generates OTP in Redis and sends simulated/real SMS/Email.
 * 5. PATCH /api/account/profile with action 'verify_and_update' rejects invalid OTP.
 * 6. PATCH /api/account/profile with action 'verify_and_update' accepts valid OTP and commits changes.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log('--- STARTING PHASE 34 PROFILE OTP TEST SUITE ---');

  const testEmail = `profile_test_${Date.now()}@example.com`;
  const duplicateEmail = `existing_user_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let testUserId: string | null = null;
  let dupUserId: string | null = null;
  let authToken: string | null = null;

  try {
    // Step 0: Create duplicate user to test uniqueness validation
    const { data: dupUser, error: dupErr } = await adminClient.auth.admin.createUser({
      email: duplicateEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (dupErr || !dupUser?.user) throw new Error(`Failed to create duplicate user: ${dupErr?.message}`);
    dupUserId = dupUser.user.id;

    // Step 1: Create primary test user
    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        name: 'Test Profile Original',
        phone: '01011112222',
      },
    });
    if (createErr || !createdUser?.user) throw new Error(`Failed to create test user: ${createErr?.message}`);
    testUserId = createdUser.user.id;

    // Login as test user to get JWT token
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (loginErr || !loginData?.session) throw new Error(`Failed to login test user: ${loginErr?.message}`);
    authToken = loginData.session.access_token;
    console.log('✓ Test user authenticated, token received.');

    // Step 2: Test GET /api/account/profile
    const { GET, PATCH } = await import('../app/api/account/profile/route');
    const { NextRequest } = await import('next/server');

    const getReq = new NextRequest('http://localhost:3000/api/account/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const getRes = await GET(getReq);
    const getData = await getRes.json();
    console.log('GET /api/account/profile response:', getData);
    if (!getData.success || getData.profile.email !== testEmail || getData.profile.name !== 'Test Profile Original') {
      throw new Error('GET profile returned incorrect data');
    }
    console.log('✓ GET /api/account/profile returned correct profile');

    // Step 3: Test direct name update (action: 'update_name')
    const updateNameReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'update_name',
        name: 'Karim Updated Name',
      }),
    });
    const updateNameRes = await PATCH(updateNameReq);
    const updateNameData = await updateNameRes.json();
    if (!updateNameData.success || updateNameData.profile.name !== 'Karim Updated Name') {
      throw new Error(`Direct name update failed: ${JSON.stringify(updateNameData)}`);
    }
    console.log('✓ PATCH action update_name updated name directly without OTP');

    // Step 4: Test request_otp with duplicate email -> should be rejected
    const dupEmailReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'request_otp',
        type: 'email',
        target: duplicateEmail,
      }),
    });
    const dupEmailRes = await PATCH(dupEmailReq);
    const dupEmailData = await dupEmailRes.json();
    if (dupEmailRes.status !== 400 || dupEmailData.code !== 'EMAIL_ALREADY_EXISTS') {
      throw new Error(`Duplicate email was not rejected properly: ${JSON.stringify(dupEmailData)}`);
    }
    console.log('✓ Duplicate email rejected as expected');

    // Step 5: Test request_otp for new valid email
    const newEmail = `profile_new_${Date.now()}@example.com`;
    const newEmailReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'request_otp',
        type: 'email',
        target: newEmail,
      }),
    });
    const newEmailRes = await PATCH(newEmailReq);
    const newEmailData = await newEmailRes.json();
    if (!newEmailData.success || newEmailData.cooldownSeconds !== 60) {
      throw new Error(`Email OTP request failed: ${JSON.stringify(newEmailData)}`);
    }
    console.log('✓ Email OTP requested successfully and stored in Redis');

    // Read generated OTP from Redis
    const { redis } = await import('../lib/redis');
    const rawOtp = await redis.get(`email_otp:${newEmail.toLowerCase()}`);
    const otpData = typeof rawOtp === 'string' ? JSON.parse(rawOtp) : rawOtp;
    const emailOtpCode = otpData?.otp;
    if (!emailOtpCode) throw new Error('Failed to retrieve OTP from Redis for verification test');

    // Step 6: Test verify_and_update with wrong OTP -> must fail
    const wrongOtpReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'verify_and_update',
        type: 'email',
        target: newEmail,
        otp: '000000',
      }),
    });
    const wrongOtpRes = await PATCH(wrongOtpReq);
    const wrongOtpData = await wrongOtpRes.json();
    if (wrongOtpData.success || wrongOtpRes.status !== 400) {
      throw new Error('Wrong OTP was accepted!');
    }
    console.log('✓ Invalid OTP rejected correctly');

    // Step 7: Test verify_and_update with correct OTP -> must succeed
    const validOtpReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'verify_and_update',
        type: 'email',
        target: newEmail,
        otp: emailOtpCode,
      }),
    });
    const validOtpRes = await PATCH(validOtpReq);
    const validOtpData = await validOtpRes.json();
    if (!validOtpData.success || validOtpData.profile.email !== newEmail.toLowerCase()) {
      throw new Error(`Valid email OTP verification failed: ${JSON.stringify(validOtpData)}`);
    }
    console.log('✓ Valid Email OTP verified and email updated in Supabase Auth');

    // Step 8: Test request_otp for new valid Egyptian phone
    const newPhone = '01288889999';
    const newPhoneReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'request_otp',
        type: 'phone',
        target: newPhone,
      }),
    });
    const newPhoneRes = await PATCH(newPhoneReq);
    const newPhoneData = await newPhoneRes.json();
    if (!newPhoneData.success || !newPhoneData.simulatedSms?.otp) {
      throw new Error(`Phone OTP request failed: ${JSON.stringify(newPhoneData)}`);
    }
    console.log('✓ Phone OTP requested and returned simulated SMS:', newPhoneData.simulatedSms);

    // Step 9: Test verify_and_update for phone
    const phoneOtpCode = newPhoneData.simulatedSms.otp;
    const validPhoneOtpReq = new NextRequest('http://localhost:3000/api/account/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'verify_and_update',
        type: 'phone',
        target: newPhone,
        otp: phoneOtpCode,
      }),
    });
    const validPhoneOtpRes = await PATCH(validPhoneOtpReq);
    const validPhoneOtpData = await validPhoneOtpRes.json();
    if (!validPhoneOtpData.success || validPhoneOtpData.profile.phone !== newPhone) {
      throw new Error(`Valid phone OTP verification failed: ${JSON.stringify(validPhoneOtpData)}`);
    }
    console.log('✓ Valid Phone OTP verified and phone updated in Supabase Auth user_metadata');

    console.log('\n=============================================');
    console.log('🎉 ALL PHASE 34 PROFILE OTP TESTS PASSED! 🎉');
    console.log('=============================================\n');
  } catch (err: any) {
    console.error('❌ PHASE 34 TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    // Cleanup test users
    if (testUserId) {
      try {
        await adminClient.auth.admin.deleteUser(testUserId);
      } catch (_) {}
    }
    if (dupUserId) {
      try {
        await adminClient.auth.admin.deleteUser(dupUserId);
      } catch (_) {}
    }
  }
}

runTests();
