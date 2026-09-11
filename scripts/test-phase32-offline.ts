/**
 * scripts/test-phase32-offline.ts
 * Comprehensive Test Suite for Phase 32: Offline Resilience for Cashier
 */

import {
  saveOfflineTransaction,
  getPendingOfflineTransactions,
  getFailedOfflineTransactions,
  markOfflineTransactionFailed,
  removeOfflineTransaction,
  clearFailedOfflineTransactions,
  syncPendingTransactions,
  OfflineTransaction,
} from '../lib/offline-queue';
import { STANDARD_FEATURE_DEFINITIONS, getDefaultFeatureStatus } from '../lib/features';
import { getServiceSupabase } from '../lib/supabase';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   PHASE 32: OFFLINE RESILIENCE TEST SUITE');
  console.log('======================================================\n');

  // Test Group 1: Feature Definitions & Default Status
  console.log('--- Test Group 1: Feature Definitions & Super Admin Flag ---');
  const syncFailureFeature = STANDARD_FEATURE_DEFINITIONS.find(
    (f) => f.key === 'notify_owner_sync_failure'
  );
  assert(
    !!syncFailureFeature,
    'notify_owner_sync_failure is registered in STANDARD_FEATURE_DEFINITIONS',
    JSON.stringify(syncFailureFeature)
  );

  const defaultStatus = getDefaultFeatureStatus('notify_owner_sync_failure');
  assert(
    defaultStatus === false,
    'notify_owner_sync_failure defaults to FALSE (optional owner SMS alert)'
  );

  // Check DB feature_definitions table
  try {
    const supabase = getServiceSupabase();
    const { data: dbDef } = await supabase
      .from('feature_definitions')
      .select('key, name')
      .eq('key', 'notify_owner_sync_failure')
      .maybeSingle();

    assert(
      !!dbDef,
      'notify_owner_sync_failure exists in Supabase feature_definitions table'
    );
  } catch (err: any) {
    console.warn('DB check note:', err.message);
  }

  // Test Group 2: Local Offline Queue Operations (In-Memory / IndexedDB)
  console.log('\n--- Test Group 2: Queue Storage & Unique Keys ---');

  // Clear any existing items first
  const initialPending = await getPendingOfflineTransactions();
  for (const item of initialPending) {
    await removeOfflineTransaction(item.id);
  }
  await clearFailedOfflineTransactions();

  const testBizId = '00000000-0000-0000-0000-000000000001';
  const testCustId = '00000000-0000-0000-0000-000000000002';

  const saveRes1 = await saveOfflineTransaction({
    businessId: testBizId,
    customerId: testCustId,
    customerName: 'Customer Alpha',
    pointsChange: 50,
    reason: 'purchase_bill: 50 EGP',
    invoiceReference: 'INV-TEST-001',
  }, 25);

  assert(saveRes1.success === true, 'Successfully saved transaction 1 offline');
  assert(!!saveRes1.item?.id, 'Transaction has a unique ID');
  assert(!!saveRes1.item?.idempotencyKey, 'Transaction has a unique Idempotency Key');
  assert(saveRes1.item?.status === 'pending', 'Transaction status is pending');

  const saveRes2 = await saveOfflineTransaction({
    businessId: testBizId,
    customerId: testCustId,
    customerName: 'Customer Beta',
    pointsChange: -20,
    reason: 'menu_item_redemption: Coffee',
  }, 25);

  assert(saveRes2.success === true, 'Successfully saved transaction 2 offline (redemption)');
  assert(
    saveRes1.item?.idempotencyKey !== saveRes2.item?.idempotencyKey,
    'Each transaction receives a distinct, unique idempotency key'
  );

  // Test Group 3: Dynamic Max Limit Enforcement (Option 2)
  console.log('\n--- Test Group 3: Dynamic Configurable Limit ---');
  // Clear queue
  const currentItems = await getPendingOfflineTransactions();
  for (const item of currentItems) {
    await removeOfflineTransaction(item.id);
  }

  const customLimit = 3;
  const resA = await saveOfflineTransaction({ businessId: testBizId, customerId: testCustId, pointsChange: 10, reason: 'r1' }, customLimit);
  const resB = await saveOfflineTransaction({ businessId: testBizId, customerId: testCustId, pointsChange: 20, reason: 'r2' }, customLimit);
  const resC = await saveOfflineTransaction({ businessId: testBizId, customerId: testCustId, pointsChange: 30, reason: 'r3' }, customLimit);

  assert(resA.success && resB.success && resC.success, `Saved 3 items under custom limit of ${customLimit}`);

  const resOverLimit = await saveOfflineTransaction(
    { businessId: testBizId, customerId: testCustId, pointsChange: 40, reason: 'r4' },
    customLimit
  );

  assert(
    resOverLimit.success === false && resOverLimit.error === 'MAX_LIMIT_REACHED',
    `Rejected 4th transaction when limit is ${customLimit} (Option 2 Dynamic Limit)`
  );

  // Test Group 4: Strict Chronological FIFO Ordering
  console.log('\n--- Test Group 4: FIFO Chronological Ordering ---');
  const pendingItems = await getPendingOfflineTransactions();
  assert(pendingItems.length === 3, 'Queue has exactly 3 pending transactions');
  assert(pendingItems[0].pointsChange === 10, 'First pending item is transaction A (FIFO oldest)');
  assert(pendingItems[1].pointsChange === 20, 'Second pending item is transaction B');
  assert(pendingItems[2].pointsChange === 30, 'Third pending item is transaction C (FIFO newest)');

  // Test Group 5: Failure Segregation & Dismissal
  console.log('\n--- Test Group 5: Failure Segregation (No Infinite Retries) ---');
  const failedItem = pendingItems[1];
  await markOfflineTransactionFailed(failedItem.id, 'INSUFFICIENT_BALANCE: Customer only had 5 points');

  const pendingAfterFail = await getPendingOfflineTransactions();
  assert(pendingAfterFail.length === 2, 'Failed transaction removed from pending queue (prevents retry loops)');

  const failedQueue = await getFailedOfflineTransactions();
  assert(failedQueue.length === 1, 'Failed transaction is placed into failed transactions store');
  assert(
    failedQueue[0].failureReason === 'INSUFFICIENT_BALANCE: Customer only had 5 points',
    'Failure reason is accurately stored'
  );

  await clearFailedOfflineTransactions();
  const failedQueueAfterClear = await getFailedOfflineTransactions();
  assert(failedQueueAfterClear.length === 0, 'clearFailedOfflineTransactions dismissed all failed records');

  // Test Group 6: Mock Synchronization with Headers & Idempotency Key
  console.log('\n--- Test Group 6: Sync Engine Execution ---');
  const remainingPending = await getPendingOfflineTransactions();
  assert(remainingPending.length === 2, '2 transactions left to sync');

  // Mock global.fetch to simulate sync
  const originalFetch = global.fetch;
  const syncRequests: any[] = [];

  global.fetch = (async (url: any, init?: any) => {
    syncRequests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, newBalance: 150 }),
    } as any;
  }) as any;

  try {
    const syncResult = await syncPendingTransactions(async () => ({
      Authorization: 'Bearer test-token',
    }));

    assert(syncResult.syncedCount === 2, 'Successfully synced both transactions');
    assert(syncResult.remainingCount === 0, 'No remaining transactions in queue');
    assert(syncRequests.length === 2, 'Dispatched 2 HTTP requests to server');

    // Verify headers and body format
    const req1 = syncRequests[0];
    assert(
      req1.init.headers['X-Idempotency-Key'] === remainingPending[0].idempotencyKey,
      'X-Idempotency-Key header preserves client original idempotency key'
    );

    const body1 = JSON.parse(req1.init.body);
    assert(body1.isOfflineSync === true, 'Payload includes isOfflineSync: true');
    assert(!!body1.offlineCreatedAt, 'Payload includes original offlineCreatedAt timestamp');
  } finally {
    global.fetch = originalFetch;
  }

  // Summary
  console.log('\n======================================================');
  console.log(`   TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
