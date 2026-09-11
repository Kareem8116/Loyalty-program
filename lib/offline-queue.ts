/**
 * lib/offline-queue.ts
 * Phase 32: Pointat Offline Resilience Engine via IndexedDB
 * 
 * Features:
 * 1. Safe client-side storage for cashier transactions when network is offline.
 * 2. Configurable dynamic max limit (default 25) to prevent unbounded risk.
 * 3. Honest FIFO sequential synchronization upon internet recovery.
 * 4. Preservation of unique Idempotency Key generated at time of original action.
 * 5. Permanent error segregation (failed items marked so they are not retried endlessly).
 */

export interface OfflineTransaction {
  id: string;
  idempotencyKey: string;
  businessId: string;
  customerId: string;
  customerName?: string;
  customerQrToken?: string;
  pointsChange: number;
  reason: string;
  invoiceReference?: string | null;
  managerPin?: string;
  customerPin?: string;
  status: 'pending' | 'failed';
  failureReason?: string;
  createdAt: string;
}

export type OfflineTransactionInput = Omit<
  OfflineTransaction,
  'id' | 'idempotencyKey' | 'status' | 'failureReason' | 'createdAt'
>;

const DB_NAME = 'pointat_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_transactions';

// In-memory fallback for SSR or environments without IndexedDB
const memoryStore = new Map<string, OfflineTransaction>();

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      return reject(new Error('IndexedDB not available in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'offline-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function notifyQueueUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointat:offline-queue-updated'));
  }
}

/**
 * 32.1 & 32.2: Save a transaction locally in IndexedDB when offline.
 * Enforces dynamic maxLimit (default 25).
 */
export async function saveOfflineTransaction(
  input: OfflineTransactionInput,
  maxLimit: number = 25
): Promise<{ success: boolean; error?: string; item?: OfflineTransaction }> {
  const pending = await getPendingOfflineTransactions();

  if (pending.length >= maxLimit) {
    return {
      success: false,
      error: 'MAX_LIMIT_REACHED',
    };
  }

  const transactionItem: OfflineTransaction = {
    ...input,
    id: generateUuid(),
    idempotencyKey: generateUuid(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (!isIndexedDbAvailable()) {
    memoryStore.set(transactionItem.id, transactionItem);
    return { success: true, item: transactionItem };
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(transactionItem);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    notifyQueueUpdated();
    return { success: true, item: transactionItem };
  } catch (err: any) {
    console.warn('[OfflineQueue] Falling back to in-memory store:', err);
    memoryStore.set(transactionItem.id, transactionItem);
    notifyQueueUpdated();
    return { success: true, item: transactionItem };
  }
}

/**
 * Get all pending transactions in FIFO order (oldest first).
 */
export async function getPendingOfflineTransactions(): Promise<OfflineTransaction[]> {
  if (!isIndexedDbAvailable()) {
    return Array.from(memoryStore.values())
      .filter((t) => t.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result as OfflineTransaction[])
          .filter((t) => t.status === 'pending')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Error reading pending transactions from IndexedDB:', err);
    return Array.from(memoryStore.values())
      .filter((t) => t.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}

/**
 * Get all transactions that failed during sync.
 */
export async function getFailedOfflineTransactions(): Promise<OfflineTransaction[]> {
  if (!isIndexedDbAvailable()) {
    return Array.from(memoryStore.values()).filter((t) => t.status === 'failed');
  }

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result as OfflineTransaction[]).filter((t) => t.status === 'failed');
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return Array.from(memoryStore.values()).filter((t) => t.status === 'failed');
  }
}

/**
 * 32.5: Remove an offline transaction after successful synchronization.
 */
export async function removeOfflineTransaction(id: string): Promise<void> {
  memoryStore.delete(id);

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Error deleting transaction from IndexedDB:', err);
  }
  notifyQueueUpdated();
}

/**
 * 32.5: Mark an offline transaction as failed with reason (prevents endless retry).
 */
export async function markOfflineTransactionFailed(id: string, reason: string): Promise<void> {
  const memItem = memoryStore.get(id);
  if (memItem) {
    memItem.status = 'failed';
    memItem.failureReason = reason;
  }

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result as OfflineTransaction;
        if (item) {
          item.status = 'failed';
          item.failureReason = reason;
          const putReq = store.put(item);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Error updating failed item in IndexedDB:', err);
  }
  notifyQueueUpdated();
}

/**
 * Dismiss/Clear all failed offline transactions from the alert.
 */
export async function clearFailedOfflineTransactions(): Promise<void> {
  const failed = await getFailedOfflineTransactions();
  for (const item of failed) {
    await removeOfflineTransaction(item.id);
  }
  notifyQueueUpdated();
}

/**
 * 32.4: Sequential FIFO Synchronization upon internet reconnection.
 */
export async function syncPendingTransactions(
  getAuthHeaders: () => Promise<Record<string, string>>,
  onItemProcessed?: (result: { item: OfflineTransaction; success: boolean; error?: string }) => void
): Promise<{ syncedCount: number; failedCount: number; remainingCount: number }> {
  const pending = await getPendingOfflineTransactions();
  if (pending.length === 0) {
    return { syncedCount: 0, failedCount: 0, remainingCount: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of pending) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cashier/points', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify({
          businessId: item.businessId,
          customerId: item.customerId,
          pointsChange: item.pointsChange,
          reason: item.reason,
          invoiceReference: item.invoiceReference || undefined,
          managerPin: item.managerPin || undefined,
          customerPin: item.customerPin || undefined,
          isOfflineSync: true,
          offlineCreatedAt: item.createdAt,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Sync successful: remove from local DB immediately
        await removeOfflineTransaction(item.id);
        syncedCount++;
        if (onItemProcessed) {
          onItemProcessed({ item, success: true });
        }
      } else {
        // Business logic rejection: mark failed with reason
        const failReason = data.error || `HTTP ${res.status}: Failed to sync`;
        await markOfflineTransactionFailed(item.id, failReason);
        failedCount++;
        if (onItemProcessed) {
          onItemProcessed({ item, success: false, error: failReason });
        }
      }
    } catch (netErr: any) {
      // Network is still down, stop iteration to preserve FIFO order
      console.warn('[OfflineQueue] Network error during sync, pausing:', netErr);
      break;
    }
  }

  const remaining = await getPendingOfflineTransactions();
  return {
    syncedCount,
    failedCount,
    remainingCount: remaining.length,
  };
}
