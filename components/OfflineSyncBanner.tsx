'use client';

import { useState, useEffect, useCallback } from 'react';
import { WifiHigh, WifiSlash, CircleNotch, WarningCircle, CheckCircle, X } from '@phosphor-icons/react';
import { useLocale } from './LocaleProvider';
import { supabase } from '@/lib/supabase';
import {
  getPendingOfflineTransactions,
  getFailedOfflineTransactions,
  syncPendingTransactions,
  clearFailedOfflineTransactions,
  OfflineTransaction,
} from '@/lib/offline-queue';

interface OfflineSyncBannerProps {
  maxLimit?: number;
  onSyncComplete?: (result: { syncedCount: number; failedCount: number; remainingCount: number }) => void;
}

export default function OfflineSyncBanner({
  maxLimit = 25,
  onSyncComplete,
}: OfflineSyncBannerProps) {
  const { t } = useLocale();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState<OfflineTransaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const refreshQueue = useCallback(async () => {
    try {
      const pending = await getPendingOfflineTransactions();
      const failed = await getFailedOfflineTransactions();
      setPendingCount(pending.length);
      setFailedItems(failed);
    } catch (err) {
      console.warn('Failed to read offline queue state:', err);
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const result = await syncPendingTransactions(getAuthHeaders);
      await refreshQueue();

      if (result.syncedCount > 0) {
        setSyncFeedback(
          t('cashierControl.syncSuccess', { count: result.syncedCount }) ||
          `تمت مزامنة ${result.syncedCount} عملية بنجاح`
        );
        setTimeout(() => setSyncFeedback(null), 5000);
      }

      if (onSyncComplete) {
        onSyncComplete(result);
      }
    } catch (err: any) {
      console.error('Error syncing offline transactions:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSyncComplete, refreshQueue, t]);

  useEffect(() => {
    refreshQueue();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto sync when coming back online
      handleSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdated = () => {
      refreshQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pointat:offline-queue-updated', handleQueueUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pointat:offline-queue-updated', handleQueueUpdated);
    };
  }, [handleSync, refreshQueue]);

  const handleDismissFailed = async () => {
    await clearFailedOfflineTransactions();
    await refreshQueue();
  };

  // If online and no pending or failed items, show a minimal subtle indicator or nothing
  if (isOnline && pendingCount === 0 && failedItems.length === 0 && !syncFeedback) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-2 mb-3 animate-in fade-in duration-200">
      {/* 1. Offline or Pending Sync Banner */}
      {(!isOnline || pendingCount > 0) && (
        <div
          className="p-3.5 rounded-2xl border-[0.5px] shadow-sm flex items-center justify-between gap-3 text-xs transition-colors backdrop-blur-md"
          style={{
            backgroundColor: !isOnline ? 'var(--color-error-bg)' : 'var(--color-card-bg)',
            borderColor: !isOnline ? 'var(--color-error-border)' : 'var(--color-border)',
            color: !isOnline ? 'var(--color-error-text)' : 'var(--color-text)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`p-1.5 rounded-xl shrink-0 flex items-center justify-center ${
                !isOnline ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-500'
              }`}
            >
              {!isOnline ? (
                <WifiSlash weight="light" className="w-4 h-4" />
              ) : (
                <WifiHigh weight="light" className="w-4 h-4" />
              )}
            </span>

            <div className="flex flex-col min-w-0">
              <span className="font-bold truncate">
                {!isOnline
                  ? t('cashierControl.offlineStatus') || 'غير متصل بالإنترنت'
                  : t('cashierControl.onlineStatus') || 'متصل بالإنترنت'}
              </span>
              <span className="text-[11px] opacity-75 truncate">
                {t('cashierControl.offlineQueue', { count: pendingCount, limit: maxLimit }) ||
                  `عمليات معلقة محلياً: ${pendingCount} من ${maxLimit}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            id="sync-offline-queue-btn"
            onClick={handleSync}
            disabled={!isOnline || isSyncing || pendingCount === 0}
            className="ios-btn-primary py-1.5 px-3 rounded-xl font-bold shrink-0 transition-transform active:scale-95 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            {isSyncing ? (
              <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            <span>
              {isSyncing
                ? t('cashierControl.syncing') || 'جاري المزامنة...'
                : t('cashierControl.syncNow') || 'مزامنة الآن'}
            </span>
          </button>
        </div>
      )}

      {/* 2. Success feedback message after sync */}
      {syncFeedback && (
        <div
          className="p-3 rounded-2xl border-[0.5px] text-xs flex items-center justify-between gap-2 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--color-success-bg)',
            borderColor: 'var(--color-success-border)',
            color: 'var(--color-success-text)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle weight="light" className="w-4 h-4 shrink-0" />
            <span className="font-medium">{syncFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            <X weight="light" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Failed transactions alert (Phase 32.5 & 32.6) */}
      {failedItems.length > 0 && (
        <div
          className="p-3.5 rounded-2xl border-[0.5px] flex flex-col gap-2 text-xs backdrop-blur-md"
          style={{
            backgroundColor: 'var(--color-error-bg)',
            borderColor: 'var(--color-error-border)',
            color: 'var(--color-error-text)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold">
              <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
              <span>
                {t('cashierControl.syncFailedAlert', { count: failedItems.length }) ||
                  `فشلت مزامنة ${failedItems.length} عملية غير متصلة:`}
              </span>
            </div>
            <button
              type="button"
              id="dismiss-offline-failed-btn"
              onClick={handleDismissFailed}
              className="text-[11px] font-semibold underline opacity-80 hover:opacity-100"
            >
              {t('cashierControl.dismissFailed') || 'تجاهل'}
            </button>
          </div>

          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pt-1">
            {failedItems.map((item) => (
              <div
                key={item.id}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-between gap-2 text-[11px]"
              >
                <div className="min-w-0">
                  <span className="font-semibold block truncate">
                    {item.customerName || item.customerId} (
                    {item.pointsChange > 0 ? `+${item.pointsChange}` : item.pointsChange} نقطة)
                  </span>
                  <span className="opacity-75 block truncate">
                    {item.failureReason || 'فشل التحقق من العملية على السيرفر'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
