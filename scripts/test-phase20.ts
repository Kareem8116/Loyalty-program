/**
 * ==============================================================================
 * Phase 20: Owner Analytics Dashboard (لوحة تحليلات المالك) — Automated Test Suite
 * ==============================================================================
 * 
 * Verifies:
 * 1. Timeframe cutoffs ('7d', '30d', '90d', 'all') calculation.
 * 2. Analytics computation for empty business (graceful handling of zero values).
 * 3. Accurate points aggregation from points_ledger (Single Source of Truth):
 *    - totalPointsIssued (points_change > 0)
 *    - totalPointsRedeemed (points_change < 0 and reason != 'expired')
 *    - totalPointsExpired (reason = 'expired')
 *    - redemptionRate ((redeemed / issued) * 100)
 * 4. Customer activity metrics:
 *    - totalCustomers (total in DB)
 *    - activeCustomers (distinct customers with transactions in timeframe)
 *    - activeRatePercent ((active / total) * 100)
 * 5. Top 5 redeemed rewards ranking (correct count and points sorted descending).
 * 6. Multi-tenant isolation: Analytics for Business A never leak transactions from Business B.
 * 7. Daily activity timeline grouping (date, pointsIssued, pointsRedeemed).
 * ==============================================================================
 */

import { getServiceSupabase } from '../lib/supabase';
import { getOwnerAnalytics, getTimeframeCutoff } from '../lib/analytics';
import { recordPointsTransaction } from '../lib/cashier';

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

async function runPhase20Tests() {
  console.log('\n================================================================');
  console.log('       Phase 20: Owner Analytics Dashboard — Test Suite         ');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString().slice(-6);
  let businessAId = '';
  let businessBId = '';
  let custA1Id = '';
  let custA2Id = '';
  let custA3Id = '';
  let custB1Id = '';

  try {
    // -------------------------------------------------------------------------
    // 0. Bootstrap Test Environment
    // -------------------------------------------------------------------------
    console.log('0. Bootstrapping test businesses and customers...');
    
    // Business A
    const { data: bizA, error: errA } = await adminClient
      .from('businesses')
      .insert({
        name: `Analytics Cafe A ${testSuffix}`,
        subdomain: `analytics-a-${testSuffix}`,
      })
      .select()
      .single();

    if (errA || !bizA) throw new Error(`Failed to create business A: ${errA?.message}`);
    businessAId = bizA.id;

    // Business B (for multi-tenant isolation tests)
    const { data: bizB, error: errB } = await adminClient
      .from('businesses')
      .insert({
        name: `Analytics Cafe B ${testSuffix}`,
        subdomain: `analytics-b-${testSuffix}`,
      })
      .select()
      .single();

    if (errB || !bizB) throw new Error(`Failed to create business B: ${errB?.message}`);
    businessBId = bizB.id;

    // Create 3 customers for Business A
    const { data: custA1 } = await adminClient
      .from('customers')
      .insert({
        business_id: businessAId,
        name: `Cust A1 ${testSuffix}`,
        phone_number: `+201201${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();
    custA1Id = custA1!.id;

    const { data: custA2 } = await adminClient
      .from('customers')
      .insert({
        business_id: businessAId,
        name: `Cust A2 ${testSuffix}`,
        phone_number: `+201202${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();
    custA2Id = custA2!.id;

    const { data: custA3 } = await adminClient
      .from('customers')
      .insert({
        business_id: businessAId,
        name: `Cust A3 ${testSuffix}`,
        phone_number: `+201203${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();
    custA3Id = custA3!.id;

    // Create 1 customer for Business B
    const { data: custB1 } = await adminClient
      .from('customers')
      .insert({
        business_id: businessBId,
        name: `Cust B1 ${testSuffix}`,
        phone_number: `+201204${testSuffix.slice(-4)}`,
        qr_token: crypto.randomUUID(),
        consent_given_at: new Date().toISOString(),
      })
      .select()
      .single();
    custB1Id = custB1!.id;

    console.log(`   Business A: ${businessAId} (3 customers)`);
    console.log(`   Business B: ${businessBId} (1 customer)\n`);

    // -------------------------------------------------------------------------
    // Test Group 1: Timeframe Cutoffs
    // -------------------------------------------------------------------------
    console.log('--- Test Group 1: Timeframe Cutoff Logic ---');
    const cutoff7d = getTimeframeCutoff('7d');
    const cutoff30d = getTimeframeCutoff('30d');
    const cutoff90d = getTimeframeCutoff('90d');
    const cutoffAll = getTimeframeCutoff('all');

    assert(cutoff7d !== null && cutoff7d instanceof Date, '1.1 7d returns a valid Date cutoff');
    assert(cutoff30d !== null && cutoff30d < (cutoff7d as Date), '1.2 30d cutoff is older than 7d cutoff');
    assert(cutoff90d !== null && cutoff90d < (cutoff30d as Date), '1.3 90d cutoff is older than 30d cutoff');
    assert(cutoffAll === null, '1.4 all returns null (unbounded range)');

    // -------------------------------------------------------------------------
    // Test Group 2: Empty Business Analytics
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 2: Initial Empty Business Analytics ---');
    const initialAnalytics = await getOwnerAnalytics(businessAId, '30d');

    assert(initialAnalytics.totalCustomers === 3, '2.1 totalCustomers equals 3 registered customers');
    assert(initialAnalytics.activeCustomers === 0, '2.2 activeCustomers is 0 when no ledger records exist');
    assert(initialAnalytics.activeRatePercent === 0, '2.3 activeRatePercent is 0%');
    assert(initialAnalytics.totalPointsIssued === 0, '2.4 totalPointsIssued is 0');
    assert(initialAnalytics.totalPointsRedeemed === 0, '2.5 totalPointsRedeemed is 0');
    assert(initialAnalytics.totalPointsExpired === 0, '2.6 totalPointsExpired is 0');
    assert(initialAnalytics.redemptionRate === 0, '2.7 redemptionRate is 0%');
    assert(initialAnalytics.topRedeemedItems.length === 0, '2.8 topRedeemedItems is empty array');
    assert(initialAnalytics.dailyActivity.length === 0, '2.9 dailyActivity is empty array');

    // -------------------------------------------------------------------------
    // Test Group 3: Points Issuance, Redemption, and Expiry Aggregation
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 3: Points Issuance, Redemption & Aggregations ---');
    
    // Cust A1 earns 150 pts
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA1Id,
      pointsChange: 150,
      reason: 'purchase',
    });

    // Cust A2 earns 250 pts
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA2Id,
      pointsChange: 250,
      reason: 'purchase',
    });

    // Cust A1 redeems 50 pts for "Iced Americano"
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA1Id,
      pointsChange: -50,
      reason: 'menu_item_redemption: Iced Americano',
    });

    // Cust A2 redeems 100 pts for "Spanish Latte"
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA2Id,
      pointsChange: -100,
      reason: 'menu_item_redemption: Spanish Latte',
    });

    // Cust A1 redeems 30 pts for another "Iced Americano"
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA1Id,
      pointsChange: -30,
      reason: 'menu_item_redemption: Iced Americano',
    });

    // Cust A1 has 20 pts expired
    await recordPointsTransaction({
      businessId: businessAId,
      customerId: custA1Id,
      pointsChange: -20,
      reason: 'expired',
    });

    // Cust A3 has 0 transactions (remains inactive)

    const analyticsA = await getOwnerAnalytics(businessAId, '30d');

    assert(
      analyticsA.totalCustomers === 3,
      '3.1 totalCustomers remains 3',
      `Got: ${analyticsA.totalCustomers}`
    );
    assert(
      analyticsA.activeCustomers === 2,
      '3.2 activeCustomers is exactly 2 (Cust A1 & A2 active, A3 inactive)',
      `Got: ${analyticsA.activeCustomers}`
    );
    assert(
      analyticsA.activeRatePercent === 66.7,
      '3.3 activeRatePercent is 66.7% (2 / 3 * 100)',
      `Got: ${analyticsA.activeRatePercent}%`
    );
    assert(
      analyticsA.totalPointsIssued === 400,
      '3.4 totalPointsIssued equals 400 (150 + 250)',
      `Got: ${analyticsA.totalPointsIssued}`
    );
    assert(
      analyticsA.totalPointsRedeemed === 180,
      '3.5 totalPointsRedeemed equals 180 (50 + 100 + 30)',
      `Got: ${analyticsA.totalPointsRedeemed}`
    );
    assert(
      analyticsA.totalPointsExpired === 20,
      '3.6 totalPointsExpired equals 20 (expired points separated from redemptions)',
      `Got: ${analyticsA.totalPointsExpired}`
    );
    assert(
      analyticsA.redemptionRate === 45.0,
      '3.7 redemptionRate equals 45.0% (180 / 400 * 100)',
      `Got: ${analyticsA.redemptionRate}%`
    );

    // -------------------------------------------------------------------------
    // Test Group 4: Top 5 Redeemed Rewards Ranking
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 4: Top 5 Redeemed Rewards Ranking ---');
    assert(analyticsA.topRedeemedItems.length === 2, '4.1 Exactly 2 distinct redeemed items found');

    const top1 = analyticsA.topRedeemedItems[0];
    const top2 = analyticsA.topRedeemedItems[1];

    assert(
      top1?.name === 'Iced Americano' && top1?.count === 2 && top1?.points === 80,
      '4.2 #1 item is "Iced Americano" with count=2 and points=80 (50+30)',
      `Got: ${JSON.stringify(top1)}`
    );
    assert(
      top2?.name === 'Spanish Latte' && top2?.count === 1 && top2?.points === 100,
      '4.3 #2 item is "Spanish Latte" with count=1 and points=100',
      `Got: ${JSON.stringify(top2)}`
    );

    // -------------------------------------------------------------------------
    // Test Group 5: Daily Activity Timeline Series
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 5: Daily Activity Timeline Series ---');
    assert(analyticsA.dailyActivity.length >= 1, '5.1 dailyActivity contains at least 1 day entry');

    const todayEntry = analyticsA.dailyActivity[analyticsA.dailyActivity.length - 1];
    assert(
      todayEntry.pointsIssued === 400 && todayEntry.pointsRedeemed === 180,
      '5.2 Today entry in dailyActivity correctly tallies pointsIssued=400 and pointsRedeemed=180',
      `Got: ${JSON.stringify(todayEntry)}`
    );

    // -------------------------------------------------------------------------
    // Test Group 6: Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 6: Multi-Tenant Data Isolation ---');
    // Add transaction for Business B
    await recordPointsTransaction({
      businessId: businessBId,
      customerId: custB1Id,
      pointsChange: 500,
      reason: 'purchase',
    });
    await recordPointsTransaction({
      businessId: businessBId,
      customerId: custB1Id,
      pointsChange: -200,
      reason: 'menu_item_redemption: Blueberry Cheesecake',
    });

    const analyticsA_Recheck = await getOwnerAnalytics(businessAId, 'all');
    const analyticsB = await getOwnerAnalytics(businessBId, 'all');

    assert(
      analyticsA_Recheck.totalPointsIssued === 400 && analyticsA_Recheck.totalPointsRedeemed === 180,
      '6.1 Business A analytics are completely unaffected by Business B activity',
      `Got: issued=${analyticsA_Recheck.totalPointsIssued}, redeemed=${analyticsA_Recheck.totalPointsRedeemed}`
    );
    assert(
      !analyticsA_Recheck.topRedeemedItems.some((i) => i.name.includes('Cheesecake')),
      '6.2 Business A top items do NOT contain Business B items'
    );
    assert(
      analyticsB.totalCustomers === 1 &&
        analyticsB.activeCustomers === 1 &&
        analyticsB.totalPointsIssued === 500 &&
        analyticsB.totalPointsRedeemed === 200 &&
        analyticsB.redemptionRate === 40.0 &&
        analyticsB.topRedeemedItems[0]?.name === 'Blueberry Cheesecake',
      '6.3 Business B analytics strictly reflect its own transactions',
      `Got: issued=${analyticsB.totalPointsIssued}, redeemed=${analyticsB.totalPointsRedeemed}, rate=${analyticsB.redemptionRate}%`
    );

    // -------------------------------------------------------------------------
    // Test Group 7: Timeframe Filtering Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 7: Timeframe Boundaries ---');
    // Insert a historical record dated 45 days ago for Business A
    const date45dAgo = new Date();
    date45dAgo.setDate(date45dAgo.getDate() - 45);

    await adminClient.from('points_ledger').insert({
      business_id: businessAId,
      customer_id: custA3Id,
      points_change: 100,
      reason: 'purchase',
      created_at: date45dAgo.toISOString(),
    });

    const analytics7d = await getOwnerAnalytics(businessAId, '7d');
    const analytics30d = await getOwnerAnalytics(businessAId, '30d');
    const analytics90d = await getOwnerAnalytics(businessAId, '90d');

    assert(
      analytics7d.totalPointsIssued === 400 && analytics30d.totalPointsIssued === 400,
      '7.1 7d and 30d analytics exclude the 45-day-old points (issued remains 400)'
    );
    assert(
      analytics90d.totalPointsIssued === 500,
      '7.2 90d analytics successfully includes the 45-day-old points (issued becomes 500)',
      `Got: ${analytics90d.totalPointsIssued}`
    );
    assert(
      analytics90d.activeCustomers === 3,
      '7.3 Cust A3 becomes active in 90d analytics due to 45-day-old record',
      `Got: ${analytics90d.activeCustomers}`
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
  console.log(`Phase 20 Test Summary: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase20Tests();
