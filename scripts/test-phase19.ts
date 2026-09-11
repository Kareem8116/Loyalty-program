/**
 * ==============================================================================
 * Phase 19: Referral Program (نظام الإحالة) — Automated Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Unique referral code generation format ('REF-XXXXXX').
 * 2. Referral settings default configuration (50 referrer / 25 referee) and updates.
 * 3. Referral code validation within business and rejection of invalid codes.
 * 4. Multi-tenant isolation: Codes from Business A are rejected in Business B.
 * 5. Customer creation with referral code triggers points awards to both referrer and referee.
 * 6. Single Source of Truth (RULES.md 3.1): Points recorded in points_ledger with reason='referral'.
 * 7. Self-referral prevention (referrer cannot refer self).
 * 8. Multiple referrals tracking and stats accuracy.
 * 9. Customer API returns customer referral_code.
 * 10. Anon RLS enforcement: Public cannot modify referral_settings or read points_ledger.
 * ==============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '../lib/supabase';
import {
  generateReferralCode,
  getReferralSettings,
  updateReferralSettings,
  validateReferralCode,
  processReferralReward,
} from '../lib/referral';
import { createCustomer, getCustomerPointsBalance, getCustomerByQrToken } from '../lib/customer';

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

async function runPhase19Tests() {
  console.log('\n================================================================');
  console.log('         Phase 19: Referral Program — Automated Test Suite       ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let businessAId = '';
  let businessBId = '';
  let cust1Id = '';
  let cust1Code = '';
  let cust1Token = '';
  let cust2Id = '';
  let cust2Code = '';
  let cust3Id = '';

  try {
    // -------------------------------------------------------------------------
    // 0. Environment Setup
    // -------------------------------------------------------------------------
    console.log('0. Bootstrapping test businesses...');
    const { data: bizA, error: errA } = await adminClient
      .from('businesses')
      .insert({
        name: `Referral Cafe A ${testSuffix}`,
        subdomain: `ref-a-${testSuffix}`,
      })
      .select()
      .single();

    if (errA || !bizA) throw new Error(`Failed to create business A: ${errA?.message}`);
    businessAId = bizA.id;

    const { data: bizB, error: errB } = await adminClient
      .from('businesses')
      .insert({
        name: `Referral Cafe B ${testSuffix}`,
        subdomain: `ref-b-${testSuffix}`,
      })
      .select()
      .single();

    if (errB || !bizB) throw new Error(`Failed to create business B: ${errB?.message}`);
    businessBId = bizB.id;

    console.log(`   Business A: ${businessAId}`);
    console.log(`   Business B: ${businessBId}\n`);

    // -------------------------------------------------------------------------
    // Test 1: Referral Code Generation Format
    // -------------------------------------------------------------------------
    console.log('1. Testing referral code generator format...');
    const sampleCode1 = generateReferralCode();
    const sampleCode2 = generateReferralCode();

    assert(
      sampleCode1.startsWith('REF-') && sampleCode1.length === 10,
      'Referral code format starts with REF- and is 10 characters long',
      `Got: ${sampleCode1}`
    );
    assert(
      sampleCode1 !== sampleCode2,
      'Consecutive generated referral codes are distinct and random'
    );

    // -------------------------------------------------------------------------
    // Test 2: Referral Settings Management
    // -------------------------------------------------------------------------
    console.log('\n2. Testing referral settings (defaults and updates)...');
    const defaultSettings = await getReferralSettings(businessAId);
    assert(
      defaultSettings.referrerRewardPoints === 50 && defaultSettings.refereeRewardPoints === 25,
      'Default referral settings are 50 pts for referrer and 25 pts for referee',
      `Got: ${defaultSettings.referrerRewardPoints} / ${defaultSettings.refereeRewardPoints}`
    );

    const updatedSettings = await updateReferralSettings(businessAId, {
      referrerRewardPoints: 60,
      refereeRewardPoints: 30,
    });
    assert(
      updatedSettings.referrerRewardPoints === 60 && updatedSettings.refereeRewardPoints === 30,
      'Referral settings successfully updated and persisted in DB',
      `Got: ${updatedSettings.referrerRewardPoints} / ${updatedSettings.refereeRewardPoints}`
    );

    // Revert to 50 / 25 for standardized testing
    await updateReferralSettings(businessAId, {
      referrerRewardPoints: 50,
      refereeRewardPoints: 25,
    });

    // -------------------------------------------------------------------------
    // Test 3: Customer 1 Creation & Automatic Referral Code Assignment
    // -------------------------------------------------------------------------
    console.log('\n3. Creating initial customer (Customer 1)...');
    const cust1 = await createCustomer({
      businessId: businessAId,
      name: `Referrer Alice ${testSuffix}`,
      phoneNumber: `+20110001${testSuffix.slice(-4)}`,
      consentGiven: true,
    });

    cust1Id = cust1.id;
    cust1Code = cust1.referral_code!;
    cust1Token = cust1.qr_token;

    assert(Boolean(cust1Code && cust1Code.startsWith('REF-')), 'Customer 1 automatically received unique referral code', cust1Code);
    assert(cust1.referred_by === null || cust1.referred_by === undefined, 'Customer 1 has no referrer (referred_by is null)');

    const cust1BalanceInitial = await getCustomerPointsBalance(cust1Id, businessAId);
    assert(cust1BalanceInitial === 0, 'Customer 1 initial points balance is 0');

    // -------------------------------------------------------------------------
    // Test 4: Referral Code Validation & Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n4. Testing referral code validation and tenant isolation...');
    const validLookup = await validateReferralCode(businessAId, cust1Code);
    assert(
      validLookup !== null && validLookup.id === cust1Id,
      'Valid referral code lookup within Business A returns referrer info'
    );

    const caseInsensitiveLookup = await validateReferralCode(businessAId, cust1Code.toLowerCase());
    assert(
      caseInsensitiveLookup !== null && caseInsensitiveLookup.id === cust1Id,
      'Referral code lookup is case-insensitive (lowercase input resolves correctly)'
    );

    const crossTenantLookup = await validateReferralCode(businessBId, cust1Code);
    assert(
      crossTenantLookup === null,
      'Multi-tenant isolation: Code from Business A is REJECTED in Business B'
    );

    const nonExistentLookup = await validateReferralCode(businessAId, 'REF-ZZZZZZ');
    assert(
      nonExistentLookup === null,
      'Non-existent referral code is rejected'
    );

    // -------------------------------------------------------------------------
    // Test 5: Customer 2 Creation With Valid Referral Code (Reward Distribution)
    // -------------------------------------------------------------------------
    console.log('\n5. Registering Customer 2 using Customer 1 referral code...');
    const cust2 = await createCustomer({
      businessId: businessAId,
      name: `Referee Bob ${testSuffix}`,
      phoneNumber: `+20110002${testSuffix.slice(-4)}`,
      consentGiven: true,
      referralCode: cust1Code,
    });

    cust2Id = cust2.id;
    cust2Code = cust2.referral_code!;

    assert(cust2.referred_by === cust1Id, 'Customer 2 referred_by is set to Customer 1 ID', cust2.referred_by);

    // Verify points in ledger (SSOT)
    const cust1BalanceAfter = await getCustomerPointsBalance(cust1Id, businessAId);
    const cust2BalanceAfter = await getCustomerPointsBalance(cust2Id, businessAId);

    assert(
      cust1BalanceAfter === 50,
      'Customer 1 (referrer) received exactly +50 referral reward points',
      `Got: ${cust1BalanceAfter}`
    );
    assert(
      cust2BalanceAfter === 25,
      'Customer 2 (referee) received exactly +25 referee reward points',
      `Got: ${cust2BalanceAfter}`
    );

    // Verify ledger entries
    const { data: ledgerRows } = await adminClient
      .from('points_ledger')
      .select('customer_id, points_change, reason')
      .eq('business_id', businessAId)
      .eq('reason', 'referral');

    assert(
      (ledgerRows || []).length === 2,
      'Exactly 2 points_ledger entries created with reason="referral"'
    );

    // -------------------------------------------------------------------------
    // Test 6: Self-Referral Prevention
    // -------------------------------------------------------------------------
    console.log('\n6. Testing self-referral prevention...');
    let selfReferralError = false;
    try {
      await processReferralReward({
        businessId: businessAId,
        referrerId: cust1Id,
        refereeId: cust1Id, // Self-referral attempt
      });
    } catch {
      selfReferralError = true;
    }
    assert(selfReferralError, 'processReferralReward strictly rejects self-referral (referrer === referee)');

    // -------------------------------------------------------------------------
    // Test 7: Multiple Referrals by Same Referrer (Customer 3)
    // -------------------------------------------------------------------------
    console.log('\n7. Registering Customer 3 using Customer 1 referral code (Multiple Referrals)...');
    const cust3 = await createCustomer({
      businessId: businessAId,
      name: `Referee Charlie ${testSuffix}`,
      phoneNumber: `+20110003${testSuffix.slice(-4)}`,
      consentGiven: true,
      referralCode: cust1Code,
    });
    cust3Id = cust3.id;

    const cust1BalanceFinal = await getCustomerPointsBalance(cust1Id, businessAId);
    const cust3BalanceFinal = await getCustomerPointsBalance(cust3Id, businessAId);

    assert(
      cust1BalanceFinal === 100,
      'Customer 1 received another +50 points (total 100 points for 2 referrals)',
      `Got: ${cust1BalanceFinal}`
    );
    assert(
      cust3BalanceFinal === 25,
      'Customer 3 received +25 points as new referred customer',
      `Got: ${cust3BalanceFinal}`
    );

    // -------------------------------------------------------------------------
    // Test 8: Referral Stats Accuracy
    // -------------------------------------------------------------------------
    console.log('\n8. Checking referral stats aggregation in DB...');
    const { count: totalReferrals } = await adminClient
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessAId)
      .not('referred_by', 'is', null);

    const { data: allReferralLedger } = await adminClient
      .from('points_ledger')
      .select('points_change')
      .eq('business_id', businessAId)
      .eq('reason', 'referral');

    const totalPointsAwarded = (allReferralLedger || []).reduce(
      (sum, row) => sum + (row.points_change || 0),
      0
    );

    assert(totalReferrals === 2, 'Total referrals count for Business A is exactly 2', `Got: ${totalReferrals}`);
    assert(
      totalPointsAwarded === 150,
      'Total referral points awarded for Business A is exactly 150 (50+25 + 50+25)',
      `Got: ${totalPointsAwarded}`
    );

    // -------------------------------------------------------------------------
    // Test 9: Customer Data Retrieval by Token Includes referral_code
    // -------------------------------------------------------------------------
    console.log('\n9. Testing getCustomerByQrToken includes referral_code...');
    const custByToken = await getCustomerByQrToken(cust1Token);
    assert(
      custByToken !== null && custByToken.referral_code === cust1Code,
      'getCustomerByQrToken successfully returns referral_code for account page display',
      `Got: ${custByToken?.referral_code}`
    );

    // -------------------------------------------------------------------------
    // Test 10: Anonymous Client RLS Security
    // -------------------------------------------------------------------------
    console.log('\n10. Testing Anonymous Client RLS security policies...');
    // Anon can read settings
    const { data: anonReadSettings, error: anonReadErr } = await anonClient
      .from('referral_settings')
      .select('*')
      .eq('business_id', businessAId);

    assert(
      !anonReadErr && (anonReadSettings?.length || 0) >= 1,
      'Public/anon client can read referral_settings for customer transparency'
    );

    // Anon CANNOT update settings (blocked by RLS)
    const { data: anonUpdateData, error: anonUpdateErr } = await anonClient
      .from('referral_settings')
      .update({ referrer_reward_points: 9999 })
      .eq('business_id', businessAId)
      .select();

    const postUpdateSettings = await getReferralSettings(businessAId);
    assert(
      (Boolean(anonUpdateErr) || (anonUpdateData && anonUpdateData.length === 0)) &&
        postUpdateSettings.referrerRewardPoints !== 9999,
      'Public/anon client CANNOT update referral_settings (blocked by RLS)'
    );

    // Anon CANNOT read points_ledger directly
    const { data: anonLedger, error: anonLedgerErr } = await anonClient
      .from('points_ledger')
      .select('*')
      .eq('business_id', businessAId);

    assert(
      Boolean(anonLedgerErr) || (anonLedger && anonLedger.length === 0),
      'Public/anon client CANNOT query points_ledger (blocked by RLS)'
    );

  } catch (err: any) {
    console.error('\n💥 Unexpected error during test execution:', err);
    failedTests++;
  } finally {
    // Cleanup test artifacts
    console.log('\n🧹 Cleaning up test data...');
    if (businessAId) {
      await adminClient.from('businesses').delete().eq('id', businessAId);
    }
    if (businessBId) {
      await adminClient.from('businesses').delete().eq('id', businessBId);
    }
  }

  console.log('\n================================================================');
  console.log(`Phase 19 Test Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase19Tests();
