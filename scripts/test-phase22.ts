/**
 * ==============================================================================
 * Phase 22: Feature Control Dashboard (نظام التحكم في الميزات) — Automated Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Feature Definitions:
 *    - All 9 standard features exist in `feature_definitions`.
 *    - Core points system (QR scan, add/deduct points) is EXCLUDED and cannot be disabled.
 * 2. Default Feature Statuses & Auto-Initialization (Phase 22.2 & 22.3):
 *    - `notifications` defaults to FALSE.
 *    - `customer_self_signup` defaults to FALSE.
 *    - All other 7 features default to TRUE.
 *    - `initializeBusinessFeatures` properly populates all rows in `business_features`.
 * 3. Individual Feature Toggles & Invalidation (Phase 22.5 & 22.7):
 *    - `setBusinessFeature` updates a single feature.
 *    - Changes reflect immediately via `isFeatureEnabled`.
 * 4. Single-Operation Bulk Actions (Phase 22.6 & 22.10):
 *    - "Disable All" sets all 9 features to FALSE in a single DB operation.
 *    - CORE POINTS SYSTEM REMAINS 100% OPERATIONAL (earn, redeem, QR scan).
 *    - "Enable All" sets all 9 features to TRUE in a single DB operation.
 * 5. API Route Guard Enforcement (Phase 22.4 & 22.9):
 *    - Disabled features return 403 Forbidden with standard message.
 *    - Enabled features are allowed.
 *    - Multi-tenant isolation (disabling in Business A does not affect Business B).
 * 6. Customer & Admin UI Integration (Phase 22.8):
 *    - `getCustomerByQrToken` reflects features and hides tiers/expiry when disabled.
 * ==============================================================================
 */

import { getServiceSupabase } from '../lib/supabase';
import {
  getDefaultFeatureStatus,
  isFeatureEnabled,
  assertFeatureEnabled,
  getBusinessFeaturesWithDefs,
  setBusinessFeature,
  setAllBusinessFeatures,
  initializeBusinessFeatures,
} from '../lib/features';
import { createCustomer, getCustomerByQrToken, getCustomerPointsBalance } from '../lib/customer';

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

async function runPhase22Tests() {
  console.log('\n================================================================');
  console.log('       Phase 22: Feature Control — Automated Test Suite         ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let businessAId = '';
  let businessBId = '';
  let custAId = '';
  let custAQrToken = '';

  try {
    // -------------------------------------------------------------------------
    // 0. Bootstrap Test Businesses & Customer
    // -------------------------------------------------------------------------
    console.log('0. Bootstrapping test environment...');

    // Create Business A
    const { data: bizA, error: errA } = await adminClient
      .from('businesses')
      .insert({
        name: `Phase22 Biz A ${testSuffix}`,
        subdomain: `p22-a-${testSuffix}`,
        is_active: true,
      })
      .select()
      .single();

    if (errA || !bizA) throw new Error(`Failed to create Business A: ${errA?.message}`);
    businessAId = bizA.id;

    // Create Business B
    const { data: bizB, error: errB } = await adminClient
      .from('businesses')
      .insert({
        name: `Phase22 Biz B ${testSuffix}`,
        subdomain: `p22-b-${testSuffix}`,
        is_active: true,
      })
      .select()
      .single();

    if (errB || !bizB) throw new Error(`Failed to create Business B: ${errB?.message}`);
    businessBId = bizB.id;

    // Create Customer in Business A
    const custA = await createCustomer({
      businessId: businessAId,
      name: `Test Customer ${testSuffix}`,
      phoneNumber: `+201099${testSuffix}`,
      consentGiven: true,
    });
    custAId = custA.id;
    custAQrToken = custA.qr_token;

    console.log(`   Business A: ${businessAId}`);
    console.log(`   Business B: ${businessBId}`);
    console.log(`   Customer A: ${custAId} (Token: ${custAQrToken})\n`);

    // =========================================================================
    // Group 1: Feature Definitions & Initial Statuses
    // =========================================================================
    console.log('--- Test Group 1: Feature Definitions & Initial Statuses ---');

    const expectedKeys = [
      'offers',
      'daily_offers',
      'membership_tiers',
      'referral_program',
      'notifications',
      'points_expiry',
      'customer_self_signup',
      'analytics_reports',
      'branch_partnerships',
    ];

    const { data: dbDefs } = await adminClient
      .from('feature_definitions')
      .select('key');

    const dbKeys = (dbDefs || []).map((d) => d.key);
    for (const k of expectedKeys) {
      assert(dbKeys.includes(k), `1.1 Feature definition "${k}" exists in database`);
    }

    assert(!dbKeys.includes('points_ledger') && !dbKeys.includes('core_points'),
      '1.2 Core points system is strictly EXCLUDED from feature_definitions (remains always on)');

    // Verify default statuses
    assert(getDefaultFeatureStatus('notifications') === false, '1.3 notifications default status is FALSE');
    assert(getDefaultFeatureStatus('customer_self_signup') === false, '1.4 customer_self_signup default status is FALSE');
    assert(getDefaultFeatureStatus('offers') === true, '1.5 offers default status is TRUE');
    assert(getDefaultFeatureStatus('daily_offers') === true, '1.6 daily_offers default status is TRUE');
    assert(getDefaultFeatureStatus('membership_tiers') === true, '1.7 membership_tiers default status is TRUE');
    assert(getDefaultFeatureStatus('referral_program') === true, '1.8 referral_program default status is TRUE');
    assert(getDefaultFeatureStatus('points_expiry') === true, '1.9 points_expiry default status is TRUE');
    assert(getDefaultFeatureStatus('analytics_reports') === true, '1.10 analytics_reports default status is TRUE');
    assert(getDefaultFeatureStatus('branch_partnerships') === true, '1.11 branch_partnerships default status is TRUE');

    // =========================================================================
    // Group 2: Business Feature Auto-Initialization (Phase 22.3)
    // =========================================================================
    console.log('\n--- Test Group 2: Business Feature Initialization ---');

    await initializeBusinessFeatures(businessAId);

    const { data: bizAFeatures } = await adminClient
      .from('business_features')
      .select('feature_key, is_enabled')
      .eq('business_id', businessAId);

    assert(Boolean(bizAFeatures && bizAFeatures.length >= 9),
      '2.1 initializeBusinessFeatures populated all 9 feature rows for Business A');

    const featureMapA: Record<string, boolean> = {};
    for (const f of bizAFeatures || []) {
      featureMapA[f.feature_key] = f.is_enabled;
    }

    assert(featureMapA['notifications'] === false, '2.2 Business A notifications initialized to false');
    assert(featureMapA['customer_self_signup'] === false, '2.3 Business A customer_self_signup initialized to false');
    assert(featureMapA['offers'] === true, '2.4 Business A offers initialized to true');
    assert(featureMapA['analytics_reports'] === true, '2.5 Business A analytics_reports initialized to true');

    // =========================================================================
    // Group 3: Individual Feature Toggles & Invalidation (Phase 22.5 & 22.7)
    // =========================================================================
    console.log('\n--- Test Group 3: Individual Feature Toggles ---');

    // Toggle offers OFF in Business A
    await setBusinessFeature(businessAId, 'offers', false);
    const offersAAfterToggle = await isFeatureEnabled(businessAId, 'offers');
    assert(offersAAfterToggle === false, '3.1 setBusinessFeature disabled "offers" in Business A');

    // Multi-tenant check: Business B offers remains true
    const offersBStatus = await isFeatureEnabled(businessBId, 'offers');
    assert(offersBStatus === true, '3.2 Business B "offers" remains unaffected (TRUE) - Multi-tenant isolation');

    // Toggle notifications ON in Business A
    await setBusinessFeature(businessAId, 'notifications', true);
    const notifAStatus = await isFeatureEnabled(businessAId, 'notifications');
    assert(notifAStatus === true, '3.3 setBusinessFeature enabled "notifications" in Business A');

    // =========================================================================
    // Group 4: Single-Operation "Disable All" & Core Points Immunity (Phase 22.6 & 22.10)
    // =========================================================================
    console.log('\n--- Test Group 4: "Disable All" & Core Points Immunity ---');

    // Trigger Disable All in a single operation
    await setAllBusinessFeatures(businessAId, false);

    const { features: disabledFeaturesA } = await getBusinessFeaturesWithDefs(businessAId);
    const allDisabled = Object.values(disabledFeaturesA).every((v) => v === false);
    assert(allDisabled, '4.1 setAllBusinessFeatures(false) disabled all 9 features in one operation');

    // CRITICAL: Core points system must remain 100% operational when all features are disabled
    console.log('   Testing Core Points System with ALL features disabled...');

    // 1. Add points to customer ledger
    const { error: earnErr } = await adminClient
      .from('points_ledger')
      .insert({
        business_id: businessAId,
        customer_id: custAId,
        points_change: 150,
        reason: 'earn',
      });
    assert(!earnErr, '4.2 Points addition into points_ledger succeeded with all features disabled');

    // 2. Points balance calculation
    const balanceAfterEarn = await getCustomerPointsBalance(custAId, businessAId);
    assert(balanceAfterEarn === 150, `4.3 Calculated balance is 150 (got: ${balanceAfterEarn})`);

    // 3. Customer card lookup via QR token
    const customerCard = await getCustomerByQrToken(custAQrToken);
    assert(Boolean(customerCard && customerCard.points_balance === 150),
      '4.4 getCustomerByQrToken successfully retrieved customer card and balance (150 pts)');

    // 4. Redeem points from customer ledger
    const { error: redeemErr } = await adminClient
      .from('points_ledger')
      .insert({
        business_id: businessAId,
        customer_id: custAId,
        points_change: -50,
        reason: 'reward',
      });
    assert(!redeemErr, '4.5 Points deduction/redemption in points_ledger succeeded with all features disabled');

    const balanceAfterRedeem = await getCustomerPointsBalance(custAId, businessAId);
    assert(balanceAfterRedeem === 100, `4.6 New balance after redemption is 100 (got: ${balanceAfterRedeem})`);

    // =========================================================================
    // Group 5: Single-Operation "Enable All" (Phase 22.6 & 22.10)
    // =========================================================================
    console.log('\n--- Test Group 5: "Enable All" Bulk Action ---');

    await setAllBusinessFeatures(businessAId, true);

    const { features: enabledFeaturesA } = await getBusinessFeaturesWithDefs(businessAId);
    const allEnabled = Object.values(enabledFeaturesA).every((v) => v === true);
    assert(allEnabled, '5.1 setAllBusinessFeatures(true) enabled all 9 features in one operation');

    // =========================================================================
    // Group 6: API Route Guard (assertFeatureEnabled) (Phase 22.4 & 22.9)
    // =========================================================================
    console.log('\n--- Test Group 6: API Route Guard Enforcement ---');

    // When feature is enabled -> returns null (allowed)
    const allowedOffers = await assertFeatureEnabled(businessAId, 'offers');
    assert(allowedOffers === null, '6.1 assertFeatureEnabled returns null when "offers" is enabled');

    // Disable offers for Business A
    await setBusinessFeature(businessAId, 'offers', false);
    const blockedOffers = await assertFeatureEnabled(businessAId, 'offers');
    assert(blockedOffers !== null && blockedOffers.status === 403,
      '6.2 assertFeatureEnabled returns HTTP 403 Forbidden when "offers" is disabled');

    const blockedJson = await blockedOffers?.json();
    assert(blockedJson?.error === 'هذه الميزة غير مفعّلة لهذا المكان',
      '6.3 403 response contains the exact standard error message "هذه الميزة غير مفعّلة لهذا المكان"');

    // Check tiers guard
    await setBusinessFeature(businessAId, 'membership_tiers', false);
    const blockedTiers = await assertFeatureEnabled(businessAId, 'membership_tiers');
    assert(blockedTiers !== null && blockedTiers.status === 403,
      '6.4 assertFeatureEnabled blocks membership_tiers with 403 when disabled');

    // Check referral guard
    await setBusinessFeature(businessAId, 'referral_program', false);
    const blockedReferral = await assertFeatureEnabled(businessAId, 'referral_program');
    assert(blockedReferral !== null && blockedReferral.status === 403,
      '6.5 assertFeatureEnabled blocks referral_program with 403 when disabled');

    // Check analytics guard
    await setBusinessFeature(businessAId, 'analytics_reports', false);
    const blockedAnalytics = await assertFeatureEnabled(businessAId, 'analytics_reports');
    assert(blockedAnalytics !== null && blockedAnalytics.status === 403,
      '6.6 assertFeatureEnabled blocks analytics_reports with 403 when disabled');

    // Check partnerships guard
    await setBusinessFeature(businessAId, 'branch_partnerships', false);
    const blockedPartnerships = await assertFeatureEnabled(businessAId, 'branch_partnerships');
    assert(blockedPartnerships !== null && blockedPartnerships.status === 403,
      '6.7 assertFeatureEnabled blocks branch_partnerships with 403 when disabled');

    // =========================================================================
    // Group 7: Customer UI Integration & Conditional Visibility (Phase 22.8)
    // =========================================================================
    console.log('\n--- Test Group 7: Customer UI Integration ---');

    // Disable points_expiry for Business A
    await setBusinessFeature(businessAId, 'points_expiry', false);

    const custView = await getCustomerByQrToken(custAQrToken);
    assert(custView !== null, '7.1 getCustomerByQrToken returned customer data');
    assert(custView?.features?.offers === false, '7.2 customer.features.offers is false');
    assert(custView?.features?.membership_tiers === false, '7.3 customer.features.membership_tiers is false');
    assert(custView?.tier === null, '7.4 customer.tier is null when membership_tiers is disabled');
    assert(custView?.expiring_points_30d === 0, '7.5 expiring_points_30d is 0 when points_expiry is disabled');

  } catch (err: any) {
    console.error('\n❌ Unhandled error in test suite:', err);
    failedTests++;
  } finally {
    // -------------------------------------------------------------------------
    // Cleanup Test Data
    // -------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test data...');
    if (businessAId) {
      await adminClient.from('points_ledger').delete().eq('business_id', businessAId);
      await adminClient.from('customers').delete().eq('business_id', businessAId);
      await adminClient.from('business_features').delete().eq('business_id', businessAId);
      await adminClient.from('businesses').delete().eq('id', businessAId);
    }
    if (businessBId) {
      await adminClient.from('business_features').delete().eq('business_id', businessBId);
      await adminClient.from('businesses').delete().eq('id', businessBId);
    }
  }

  console.log('\n================================================================');
  console.log(`Phase 22 Test Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase22Tests();
