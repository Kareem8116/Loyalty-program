/**
 * Phase 17 Test Suite: Membership Tiers (Loyalty Levels)
 *
 * Tests:
 * 1.1  Create Bronze tier (0 pts)
 * 1.2  Create Silver tier (100 pts)
 * 1.3  Create Gold tier (300 pts)
 * 1.4  getBusinessTiers returns tiers sorted ascending by min_points_earned
 * 2.1  Baseline: Customer with 0 lifetime earned points is assigned Bronze tier
 * 2.2  Automatic Promotion: Customer earning 120 pts is promoted to Silver tier
 * 2.3  Single Source of Truth: Redemptions do NOT demote the tier (lifetime earned points preserved)
 * 2.4  Top Tier Promotion: Customer earning 200 additional pts is promoted to Gold tier (nextTier=null, progress=100%)
 * 3.1  getCustomerByQrToken returns complete tier object with currentTier, nextTier, and progress
 * 4.1  updateBusinessTier updates tier properties successfully
 * 4.2  deleteBusinessTier removes tier successfully
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { recordPointsTransaction } from '../lib/cashier';
import { createCustomer, getCustomerByQrToken } from '../lib/customer';
import {
  getBusinessTiers,
  getCustomerTierInfo,
  createBusinessTier,
  updateBusinessTier,
  deleteBusinessTier,
  getLifetimeEarnedPoints,
} from '../lib/tiers';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

const cleanupIds: {
  customerIds: string[];
  businessIds: string[];
} = { customerIds: [], businessIds: [] };

async function main() {
  console.log('\n================================================================');
  console.log('       Phase 17: Membership Tiers — Test Suite                ');
  console.log('================================================================\n');

  const ts = Date.now();

  // ─────────────────────────────────────────────────────────────────────────
  // 0. Bootstrap test business and customer
  // ─────────────────────────────────────────────────────────────────────────
  console.log('0. Bootstrapping test environment...');

  const { data: testBiz, error: bizErr } = await adminClient
    .from('businesses')
    .insert({
      name: `Phase17 Tiers Cafe ${ts}`,
      subdomain: `test-p17-tiers-${ts}`,
      is_active: true,
    })
    .select()
    .single();

  if (bizErr || !testBiz) {
    console.error('Failed to create test business:', bizErr);
    process.exit(1);
  }
  cleanupIds.businessIds.push(testBiz.id);

  const { data: testBranch, error: branchErr } = await adminClient
    .from('branches')
    .insert({
      business_id: testBiz.id,
      name: 'Main Branch',
    })
    .select()
    .single();

  if (branchErr || !testBranch) {
    console.error('Failed to create test branch:', branchErr);
    process.exit(1);
  }

  // Create test customer
  const testCustomer = await createCustomer({
    businessId: testBiz.id,
    name: `Tiers Customer ${ts}`,
    phoneNumber: '+201099887766',
    consentGiven: true,
  });
  cleanupIds.customerIds.push(testCustomer.id);

  console.log(`   Business ID: ${testBiz.id}`);
  console.log(`   Customer ID: ${testCustomer.id}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Tier Creation & Ordering (PLAN.md 17.1, 17.2)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Test Group 1: Tier Creation & Ordering ---');

  const tierBronze = await createBusinessTier({
    businessId: testBiz.id,
    name: 'Bronze',
    minPointsEarned: 0,
    benefitsDescription: 'Welcome tier with standard point accumulation',
  });
  assert(tierBronze.name === 'Bronze' && tierBronze.min_points_earned === 0, '1.1 Create Bronze tier (0 pts)');

  const tierSilver = await createBusinessTier({
    businessId: testBiz.id,
    name: 'Silver',
    minPointsEarned: 100,
    benefitsDescription: '5% bonus on redemptions',
  });
  assert(tierSilver.name === 'Silver' && tierSilver.min_points_earned === 100, '1.2 Create Silver tier (100 pts)');

  const tierGold = await createBusinessTier({
    businessId: testBiz.id,
    name: 'Gold',
    minPointsEarned: 300,
    benefitsDescription: '15% bonus and priority service',
  });
  assert(tierGold.name === 'Gold' && tierGold.min_points_earned === 300, '1.3 Create Gold tier (300 pts)');

  const allTiers = await getBusinessTiers(testBiz.id);
  assert(
    allTiers.length === 3 &&
    allTiers[0].name === 'Bronze' &&
    allTiers[1].name === 'Silver' &&
    allTiers[2].name === 'Gold',
    '1.4 getBusinessTiers returns tiers sorted ascending by min_points_earned'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Dynamic Tier Calculation & Automatic Upgrade (PLAN.md 17.3, 17.5 & RULES.md 3.1)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 2: Dynamic Calculation & Automatic Promotions ---');

  // 2.1: Customer starts with 0 points -> Bronze
  const tierInfoInitial = await getCustomerTierInfo(testCustomer.id, testBiz.id);
  assert(
    tierInfoInitial !== null &&
    tierInfoInitial.currentTier.name === 'Bronze' &&
    tierInfoInitial.nextTier?.name === 'Silver' &&
    tierInfoInitial.pointsToNextTier === 100 &&
    tierInfoInitial.progressPercent === 0,
    '2.1 Customer with 0 earned points starts at Bronze tier with 100 pts needed for Silver'
  );

  // 2.2: Customer earns 120 points -> Automatically promoted to Silver!
  await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: 120,
    reason: 'purchase_coffee_batch_1',
  });

  const lifetime1 = await getLifetimeEarnedPoints(testCustomer.id, testBiz.id);
  assert(lifetime1 === 120, '2.2 Lifetime earned points equals 120');

  const tierInfoSilver = await getCustomerTierInfo(testCustomer.id, testBiz.id);
  assert(
    tierInfoSilver !== null &&
    tierInfoSilver.currentTier.name === 'Silver' &&
    tierInfoSilver.nextTier?.name === 'Gold' &&
    tierInfoSilver.pointsToNextTier === 180 && // 300 - 120 = 180
    tierInfoSilver.progressPercent === 10, // ((120 - 100) / (300 - 100)) * 100 = 10%
    '2.2 Customer earning 120 pts is automatically promoted to Silver tier (180 pts to Gold, 10% progress)'
  );

  // 2.3: Single Source of Truth: Points redemption does NOT demote customer (RULES.md 3.1)
  await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: -80,
    reason: 'redeem_pastry',
  });

  const lifetimeAfterRedeem = await getLifetimeEarnedPoints(testCustomer.id, testBiz.id);
  assert(
    lifetimeAfterRedeem === 120,
    '2.3 Lifetime earned points remains 120 after 80 pts redemption (redemption does not decrease lifetime earnings)'
  );

  const tierInfoAfterRedeem = await getCustomerTierInfo(testCustomer.id, testBiz.id);
  assert(
    tierInfoAfterRedeem?.currentTier.name === 'Silver',
    '2.3 Customer remains at Silver tier after redeeming points (no demotion)'
  );

  // 2.4: Customer earns 200 more points -> Automatically promoted to Gold (Top Tier)!
  await recordPointsTransaction({
    businessId: testBiz.id,
    customerId: testCustomer.id,
    pointsChange: 200,
    reason: 'purchase_lunch_batch_2',
  });

  const lifetime2 = await getLifetimeEarnedPoints(testCustomer.id, testBiz.id);
  assert(lifetime2 === 320, '2.4 Lifetime earned points equals 320 (120 + 200)');

  const tierInfoGold = await getCustomerTierInfo(testCustomer.id, testBiz.id);
  assert(
    tierInfoGold !== null &&
    tierInfoGold.currentTier.name === 'Gold' &&
    tierInfoGold.nextTier === null &&
    tierInfoGold.pointsToNextTier === 0 &&
    tierInfoGold.progressPercent === 100,
    '2.4 Customer earning 320 lifetime pts reaches Gold tier (top tier reached, nextTier=null, 100% progress)'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Customer Details API Integration (PLAN.md 17.4)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 3: Customer API Integration ---');

  const customerData = await getCustomerByQrToken(testCustomer.qr_token);
  assert(
    customerData !== null && customerData.tier !== undefined && customerData.tier?.currentTier.name === 'Gold',
    '3.1 getCustomerByQrToken returns computed tier object matching Gold status'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: CRUD & Maintenance
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 4: Tier CRUD & Maintenance ---');

  const updatedTier = await updateBusinessTier(tierSilver.id, testBiz.id, {
    name: 'Silver Elite',
    benefitsDescription: 'Updated benefits description',
  });
  assert(
    updatedTier.name === 'Silver Elite' && updatedTier.benefits_description === 'Updated benefits description',
    '4.1 updateBusinessTier updates name and benefits description successfully'
  );

  const deleteSuccess = await deleteBusinessTier(tierBronze.id, testBiz.id);
  assert(deleteSuccess === true, '4.2 deleteBusinessTier deletes tier successfully');

  const remainingTiers = await getBusinessTiers(testBiz.id);
  assert(
    remainingTiers.length === 2 && !remainingTiers.some((t) => t.id === tierBronze.id),
    '4.2 Remaining tiers list reflects deleted tier'
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Cleanup Test Data ---');
  try {
    if (cleanupIds.customerIds.length > 0) {
      await adminClient.from('points_ledger').delete().in('customer_id', cleanupIds.customerIds);
      await adminClient.from('customers').delete().in('id', cleanupIds.customerIds);
    }
    if (cleanupIds.businessIds.length > 0) {
      await adminClient.from('membership_tiers').delete().in('business_id', cleanupIds.businessIds);
      await adminClient.from('branches').delete().in('business_id', cleanupIds.businessIds);
      await adminClient.from('businesses').delete().in('id', cleanupIds.businessIds);
    }
    console.log('  🧹 Cleaned up test tiers, customer, and business records.');
  } catch (err: any) {
    console.warn('  ⚠️ Cleanup warning:', err.message);
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Test suite fatal error:', err);
  process.exit(1);
});
