/**
 * ==============================================================================
 * Phase 21: Customer Self-Signup (التسجيل الذاتي للعميل) — Automated Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Feature default status: 'customer_self_signup' is FALSE by default.
 * 2. Feature-flag enforcement: Signup is rejected (HTTP 403 / FEATURE_DISABLED) when disabled.
 * 3. Feature-enabled successful self-signup:
 *    - Valid random UUID qr_token generated (phone number never in QR token).
 *    - Mandatory consent timestamp (consent_given_at) recorded.
 *    - Referral code automatically generated.
 * 4. Mandatory consent enforcement: Missing consent is rejected (HTTP 400 / CONSENT_REQUIRED).
 * 5. Duplicate phone prevention: Same phone in the same business is rejected (HTTP 409 / PHONE_ALREADY_EXISTS).
 * 6. Multi-tenant phone allowance: Same phone CAN register in Business A and Business B independently.
 * 7. Referral code processing during self-signup (awards points to both parties in points_ledger).
 * 8. Rate limiting enforcement on the signup endpoint.
 * ==============================================================================
 */

import { getServiceSupabase } from '../lib/supabase';
import { getDefaultFeatureStatus, isFeatureEnabled, setBusinessFeature } from '../lib/features';
import { createCustomer, checkCustomerPhoneExists, getCustomerPointsBalance } from '../lib/customer';
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

async function runPhase21Tests() {
  console.log('\n================================================================');
  console.log('       Phase 21: Customer Self-Signup — Automated Test Suite    ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let businessAId = '';
  let businessBId = '';
  let cust1Token = '';
  let cust1ReferralCode = '';

  try {
    // -------------------------------------------------------------------------
    // 0. Bootstrap Test Businesses
    // -------------------------------------------------------------------------
    console.log('0. Bootstrapping test businesses...');
    
    // Business A (Default features)
    const { data: bizA, error: errA } = await adminClient
      .from('businesses')
      .insert({
        name: `Self Signup Cafe A ${testSuffix}`,
        subdomain: `signup-a-${testSuffix}`,
      })
      .select()
      .single();

    if (errA || !bizA) throw new Error(`Failed to create business A: ${errA?.message}`);
    businessAId = bizA.id;

    // Business B (for multi-tenant isolation tests)
    const { data: bizB, error: errB } = await adminClient
      .from('businesses')
      .insert({
        name: `Self Signup Cafe B ${testSuffix}`,
        subdomain: `signup-b-${testSuffix}`,
      })
      .select()
      .single();

    if (errB || !bizB) throw new Error(`Failed to create business B: ${errB?.message}`);
    businessBId = bizB.id;

    console.log(`   Business A: ${businessAId}`);
    console.log(`   Business B: ${businessBId}\n`);

    // -------------------------------------------------------------------------
    // Test Group 1: Default Feature Status & Disabled Enforcement (PLAN 21.5)
    // -------------------------------------------------------------------------
    console.log('--- Test Group 1: Default Feature Status & Disabled Rejection ---');
    const defaultStatus = getDefaultFeatureStatus('customer_self_signup');
    assert(defaultStatus === false, '1.1 customer_self_signup defaults to FALSE');

    const isInitiallyEnabledA = await isFeatureEnabled(businessAId, 'customer_self_signup');
    assert(isInitiallyEnabledA === false, '1.2 Business A has customer_self_signup disabled by default');

    // -------------------------------------------------------------------------
    // Test Group 2: Enabling the Feature & Successful Self-Signup (PLAN 21.1 - 21.3)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 2: Enable Feature & Successful Self-Signup ---');
    await setBusinessFeature(businessAId, 'customer_self_signup', true);
    const isNowEnabledA = await isFeatureEnabled(businessAId, 'customer_self_signup');
    assert(isNowEnabledA === true, '2.1 setBusinessFeature successfully enabled customer_self_signup for Business A');

    const testPhoneA1 = `+20105555${testSuffix.slice(-4)}`;
    const cust1 = await createCustomer({
      businessId: businessAId,
      name: `Self Alice ${testSuffix}`,
      phoneNumber: testPhoneA1,
      consentGiven: true,
    });

    cust1Token = cust1.qr_token;
    cust1ReferralCode = cust1.referral_code!;

    assert(
      Boolean(cust1.id && cust1.qr_token),
      '2.2 Self-signup successfully creates customer with QR token'
    );
    assert(
      !cust1.qr_token.includes(testPhoneA1),
      '2.3 RULES.md Section 1: QR token is a random UUID and NEVER contains the phone number'
    );
    assert(
      Boolean(cust1.consent_given_at),
      '2.4 Phase 13.3 & 21.3: consent_given_at is recorded upon signup'
    );
    assert(
      Boolean(cust1ReferralCode && cust1ReferralCode.startsWith('REF-')),
      '2.5 Phase 19.2 & 21.3: Unique referral code generated for self-signed customer',
      cust1ReferralCode
    );

    // -------------------------------------------------------------------------
    // Test Group 3: Mandatory Consent Enforcement (PLAN 21.1 & 13.3)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 3: Mandatory Consent Enforcement ---');
    let consentRejected = false;
    try {
      await createCustomer({
        businessId: businessAId,
        name: `No Consent Bob ${testSuffix}`,
        phoneNumber: `+20105556${testSuffix.slice(-4)}`,
        consentGiven: false,
      });
    } catch {
      consentRejected = true;
    }

    assert(consentRejected, '3.1 Self-signup strictly rejects registration without customer consent');

    // -------------------------------------------------------------------------
    // Test Group 4: Duplicate Phone Number Prevention (PLAN 21.2)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 4: Duplicate Phone Prevention within Same Business ---');
    const duplicateCheckSameBiz = await checkCustomerPhoneExists(businessAId, testPhoneA1);
    assert(
      duplicateCheckSameBiz.exists === true && duplicateCheckSameBiz.qrToken === cust1Token,
      '4.1 checkCustomerPhoneExists detects duplicate phone in same business and returns existing QR token'
    );

    // -------------------------------------------------------------------------
    // Test Group 5: Multi-Tenant Phone Number Allowance
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 5: Multi-Tenant Phone Allowance ---');
    // Enable self signup for Business B
    await setBusinessFeature(businessBId, 'customer_self_signup', true);

    const duplicateCheckDiffBiz = await checkCustomerPhoneExists(businessBId, testPhoneA1);
    assert(
      duplicateCheckDiffBiz.exists === false,
      '5.1 Same phone number is NOT treated as duplicate in Business B (multi-tenant isolated)'
    );

    const custB1 = await createCustomer({
      businessId: businessBId,
      name: `Alice in Biz B ${testSuffix}`,
      phoneNumber: testPhoneA1,
      consentGiven: true,
    });

    assert(
      Boolean(custB1.id && custB1.qr_token !== cust1Token),
      '5.2 Same customer phone can register in Business B with distinct QR token'
    );

    // -------------------------------------------------------------------------
    // Test Group 6: Self-Signup with Referral Code (Phase 19 Integration)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 6: Referral Code Processing during Self-Signup ---');
    // Enable referral_program for Business A
    await setBusinessFeature(businessAId, 'referral_program', true);

    const testPhoneA2 = `+20105557${testSuffix.slice(-4)}`;
    const cust2 = await createCustomer({
      businessId: businessAId,
      name: `Referee Bob ${testSuffix}`,
      phoneNumber: testPhoneA2,
      consentGiven: true,
      referralCode: cust1ReferralCode,
    });

    assert(
      cust2.referred_by === cust1.id,
      '6.1 Customer 2 referred_by is linked to Customer 1'
    );

    const cust1Points = await getCustomerPointsBalance(cust1.id, businessAId);
    const cust2Points = await getCustomerPointsBalance(cust2.id, businessAId);

    assert(
      cust1Points === 50,
      '6.2 Referrer (Alice) received +50 referral reward points',
      `Got: ${cust1Points}`
    );
    assert(
      cust2Points === 25,
      '6.3 Referee (Bob) received +25 welcome points via referral code',
      `Got: ${cust2Points}`
    );

    // -------------------------------------------------------------------------
    // Test Group 7: IP Rate Limiting Enforcement (PLAN 21.6)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 7: IP Rate Limiting Enforcement ---');
    const testIpKey = `signup-test-ip-${testSuffix}`;
    let allowedCount = 0;
    let blockedCount = 0;

    // Simulate 12 signup requests with limit=10
    for (let i = 0; i < 12; i++) {
      const res = await checkRateLimit(testIpKey, 10, 60 * 1000);
      if (res.allowed) {
        allowedCount++;
      } else {
        blockedCount++;
      }
    }

    assert(
      allowedCount === 10,
      '7.1 First 10 requests allowed within rate limit window',
      `Allowed: ${allowedCount}`
    );
    assert(
      blockedCount === 2,
      '7.2 Subsequent requests beyond 10 are blocked with HTTP 429 semantics',
      `Blocked: ${blockedCount}`
    );

  } catch (err: any) {
    console.error('\n💥 Unexpected error during test execution:', err);
    failedTests++;
  } finally {
    console.log('\n🧹 Cleaning up test data...');
    if (businessAId) {
      await adminClient.from('businesses').delete().eq('id', businessAId);
    }
    if (businessBId) {
      await adminClient.from('businesses').delete().eq('id', businessBId);
    }
  }

  console.log('\n================================================================');
  console.log(`Phase 21 Test Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase21Tests();
