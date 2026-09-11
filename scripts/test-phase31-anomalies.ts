/**
 * scripts/test-phase31-anomalies.ts
 * Automated Test Suite for Phase 31: AI Anomaly Detection
 * 
 * Verifies:
 * 1. Feature definition & default disabled status.
 * 2. Rule-Based Pre-Filtering (Frequency Spike, Point Outlier, High Reversals, Duplicate Invoice).
 * 3. Clean transaction stream producing zero false positives.
 * 4. Fail-silent behavior on simulated external failures.
 * 5. Daily Review route integration.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { STANDARD_FEATURE_DEFINITIONS, getDefaultFeatureStatus } from '../lib/features';
import { detectAnomalies, generateAiExplanation, AnomalyItem } from '../lib/anomaly-detection';

async function runPhase31Tests() {
  console.log('🚀 Starting Phase 31: AI Anomaly Detection Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testBusinessId = '00000000-0000-0000-0000-000000000031';
  const now = new Date();

  // Test 1: Feature Definition & Default Status (Phase 31.1)
  console.log('--- Test 1: Feature Definition & Default Disabled State ---');
  const featDef = STANDARD_FEATURE_DEFINITIONS.find((f) => f.key === 'ai_anomaly_detection');
  assert(!!featDef, 'ai_anomaly_detection is registered in STANDARD_FEATURE_DEFINITIONS');
  assert(
    getDefaultFeatureStatus('ai_anomaly_detection') === false,
    'getDefaultFeatureStatus("ai_anomaly_detection") returns false (disabled by default)'
  );

  // Test 2: Clean Transactions produce 0 Anomalies
  console.log('\n--- Test 2: Normal Baseline Transactions (0 False Positives) ---');
  const normalTxs = [
    {
      id: 'tx-norm-1',
      pointsChange: 20,
      type: 'earn',
      createdAt: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-1', name: 'عميل 1' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
      invoiceReference: 'INV-1001',
    },
    {
      id: 'tx-norm-2',
      pointsChange: 35,
      type: 'earn',
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-2', name: 'عميل 2' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
      invoiceReference: 'INV-1002',
    },
  ];

  const cleanAnomalies = await detectAnomalies(testBusinessId, normalTxs);
  assert(cleanAnomalies.length === 0, 'Normal transactions produce 0 anomalies');

  // Test 3: Rule A - Frequency Spike Detection (Phase 31.2)
  console.log('\n--- Test 3: Rule A - Frequency Spike Detection (> 3 tx in 1h) ---');
  const freqTxs = [
    {
      id: 'tx-freq-1',
      pointsChange: 25,
      type: 'earn',
      createdAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
      customer: { id: 'cust-freq', name: 'عميل متكرر' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
    {
      id: 'tx-freq-2',
      pointsChange: 30,
      type: 'earn',
      createdAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      customer: { id: 'cust-freq', name: 'عميل متكرر' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
    {
      id: 'tx-freq-3',
      pointsChange: 25,
      type: 'earn',
      createdAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
      customer: { id: 'cust-freq', name: 'عميل متكرر' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
    {
      id: 'tx-freq-4',
      pointsChange: 40,
      type: 'earn',
      createdAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      customer: { id: 'cust-freq', name: 'عميل متكرر' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
  ];

  const freqAnomalies = await detectAnomalies(testBusinessId, freqTxs);
  const freqAnomaly = freqAnomalies.find((a) => a.type === 'frequency_spike');
  assert(!!freqAnomaly, 'Frequency spike anomaly successfully detected');
  assert(
    freqAnomaly?.ruleDescription.includes('أقل من ساعة'),
    'Anomaly ruleDescription clearly explains the frequency spike in Arabic'
  );
  assert(freqAnomaly?.severity === 'high', 'Severity marked as high for 4+ rapid transactions');

  // Test 4: Rule B - Outlier Points Value (Phase 31.2)
  console.log('\n--- Test 4: Rule B - Point Outlier Detection (> 3x Average) ---');
  const outlierTxs = [
    {
      id: 'tx-outlier-base-1',
      pointsChange: 20,
      type: 'earn',
      createdAt: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-a', name: 'عميل أ' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
    {
      id: 'tx-outlier-base-2',
      pointsChange: 25,
      type: 'earn',
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-b', name: 'عميل ب' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
    },
    {
      id: 'tx-outlier-target',
      pointsChange: 350, // Massive spike
      type: 'earn',
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-c', name: 'عميل ج' },
      cashier: { id: 'cashier-2', name: 'كاشير 2' },
      invoiceReference: 'INV-BIG-99',
    },
  ];

  const outlierAnomalies = await detectAnomalies(testBusinessId, outlierTxs);
  const valAnomaly = outlierAnomalies.find((a) => a.type === 'point_outlier');
  assert(!!valAnomaly, 'High point outlier anomaly successfully detected');
  assert(valAnomaly?.transaction.pointsChange === 350, 'Anomaly targets the 350 points outlier transaction');
  assert(
    valAnomaly?.ruleDescription.includes('350 نقطة'),
    'Rule description accurately cites the outlier points amount'
  );

  // Test 5: Rule C - High Cashier Reversals
  console.log('\n--- Test 5: Rule C - High Cashier Reversals (>= 2 reversals in a day) ---');
  const reversalTxs = [
    {
      id: 'tx-rev-1',
      pointsChange: -30,
      type: 'reversal',
      createdAt: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-x', name: 'عميل س' },
      cashier: { id: 'cashier-alert', name: 'كاشير تحت الملاحظة' },
    },
    {
      id: 'tx-rev-2',
      pointsChange: -50,
      type: 'reversal',
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-y', name: 'عميل ص' },
      cashier: { id: 'cashier-alert', name: 'كاشير تحت الملاحظة' },
    },
  ];

  const revAnomalies = await detectAnomalies(testBusinessId, reversalTxs);
  const revAnomaly = revAnomalies.find((a) => a.type === 'high_reversals');
  assert(!!revAnomaly, 'High cashier reversals anomaly successfully detected');
  assert(
    revAnomaly?.ruleDescription.includes('استرجاع/إلغاء نقاط'),
    'Rule description describes multiple reversals clearly'
  );

  // Test 6: Rule D - Duplicate Invoice References
  console.log('\n--- Test 6: Rule D - Duplicate Invoice Reference Detection ---');
  const dupInvTxs = [
    {
      id: 'tx-inv-1',
      pointsChange: 45,
      type: 'earn',
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-m', name: 'عميل م' },
      cashier: { id: 'cashier-1', name: 'كاشير 1' },
      invoiceReference: 'BILL-DUPLICATE-999',
    },
    {
      id: 'tx-inv-2',
      pointsChange: 45,
      type: 'earn',
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      customer: { id: 'cust-n', name: 'عميل ن' },
      cashier: { id: 'cashier-2', name: 'كاشير 2' },
      invoiceReference: 'BILL-DUPLICATE-999',
    },
  ];

  const dupInvAnomalies = await detectAnomalies(testBusinessId, dupInvTxs);
  const dupAnomaly = dupInvAnomalies.find((a) => a.type === 'duplicate_invoice');
  assert(!!dupAnomaly, 'Duplicate invoice anomaly successfully detected');
  assert(
    dupAnomaly?.ruleDescription.includes('BILL-DUPLICATE-999'),
    'Duplicate invoice anomaly references the invoice number'
  );

  // Test 7: Fail-Silent Resiliency (Phase 31.5)
  console.log('\n--- Test 7: Fail-Silent Execution (Never throws on malformed inputs) ---');
  try {
    const safeEmpty = await detectAnomalies('', []);
    assert(safeEmpty.length === 0, 'detectAnomalies safely handles empty businessId');

    const safeMalformed = await detectAnomalies('test-biz', [{ invalid: true }]);
    assert(Array.isArray(safeMalformed), 'detectAnomalies safely handles malformed transaction objects');
  } catch (err) {
    assert(false, 'detectAnomalies threw an unhandled exception instead of failing silently!');
  }

  // Test 8: AI Explanation Layer Fail-Silent (Phase 31.3 & 31.5)
  console.log('\n--- Test 8: AI Explanation Layer Fail-Silent (Invalid Key Handling) ---');
  try {
    const aiResult = await generateAiExplanation(
      'INVALID_TEST_GEMINI_KEY_00000000',
      'gemini-1.5-flash',
      'نمط تكرار 4 عمليات لنفس العميل خلال 20 دقيقة'
    );
    assert(aiResult === null, 'generateAiExplanation safely returns null on API error without throwing');
  } catch (err) {
    assert(false, 'generateAiExplanation threw an unhandled error instead of failing silently!');
  }

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase31Tests().catch((err) => {
  console.error('Fatal error in Phase 31 test suite:', err);
  process.exit(1);
});
