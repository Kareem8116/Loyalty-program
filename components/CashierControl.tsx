'use client';

import { useState, useEffect } from 'react';
import { PlusCircle, MinusCircle, RefreshCw, Coffee, Receipt, Check, AlertCircle, ArrowLeft, ShieldAlert, RotateCcw, History } from 'lucide-react';
import { useLocale } from './LocaleProvider';
import { supabase } from '@/lib/supabase';
import OfflineSyncBanner from './OfflineSyncBanner';
import { saveOfflineTransaction } from '@/lib/offline-queue';

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

interface CashierControlProps {
  customer: {
    id: string;
    business_id: string;
    name: string;
    qr_token: string;
    points_balance: number;
    business_name?: string;
  };
  onReset: () => void;
}

export default function CashierControl({ customer, onReset }: CashierControlProps) {
  const { t, isRtl } = useLocale();
  const [pointsBalance, setPointsBalance] = useState(customer.points_balance);
  const [activeTab, setActiveTab] = useState<'add' | 'redeem' | 'reversal'>('add');
  const [maxOfflineLimit, setMaxOfflineLimit] = useState(25);
  
  // Add Points State (4.3)
  const [billAmount, setBillAmount] = useState('');
  const [manualAddPoints, setManualAddPoints] = useState('');
  const [addMode, setAddMode] = useState<'bill' | 'manual'>('bill');

  // Redeem Points State (4.4)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [manualDeductPoints, setManualDeductPoints] = useState('');
  const [deductMode, setDeductMode] = useState<'menu' | 'manual'>('menu');

  // 15.10: POS Invoice Reference
  const [invoiceReference, setInvoiceReference] = useState('');

  // 15.6: High-Value Redemption Customer PIN
  const [customerPin, setCustomerPin] = useState('');
  const [showCustomerPinModal, setShowCustomerPinModal] = useState(false);
  const [highValueThreshold, setHighValueThreshold] = useState<number | null>(null);

  // 15.8: Manager PIN Retry
  const [managerPin, setManagerPin] = useState('');
  const [showManagerPinModal, setShowManagerPinModal] = useState(false);

  // Rates (4.3, 4.4 & RULES.md: redemption_type controls which tabs are available)
  const [pointsPerCurrency, setPointsPerCurrency] = useState(1.0);
  const [currencyPerPoint, setCurrencyPerPoint] = useState(0.1);
  const [redemptionType, setRedemptionType] = useState<'product' | 'cash' | 'both'>('both');

  // Operation feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // 15.3: Track if last error was a daily limit exceeded (to show special UI)
  const [dailyLimitError, setDailyLimitError] = useState<{
    pointsAddedToday: number;
    dailyLimit: number;
    requested: number;
  } | null>(null);

  // Phase 28: Reversals State (28.4)
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedTxForReversal, setSelectedTxForReversal] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // UX: Success flash animation on balance card
  const [successFlash, setSuccessFlash] = useState(false);
  const triggerSuccessFlash = () => {
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 1200);
  };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  useEffect(() => {
    // Load menu items and rates for customer's business
    async function loadMenuAndRates() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/cashier/menu?businessId=${customer.business_id}`, { headers });
        const data = await res.json();
        if (data.success) {
          setMenuItems(data.menuItems || []);
          if (data.rates) {
            setPointsPerCurrency(data.rates.points_per_currency_unit);
            setCurrencyPerPoint(data.rates.currency_per_point);
            if (data.rates.high_value_redemption_threshold) {
              setHighValueThreshold(Number(data.rates.high_value_redemption_threshold));
            }
            if (data.rates.max_offline_transactions) {
              setMaxOfflineLimit(Number(data.rates.max_offline_transactions));
            }
            if (data.rates.redemption_type) {
              setRedemptionType(data.rates.redemption_type);
              // 4.4: If only 'product' or 'cash' allowed, force the correct default tab
              if (data.rates.redemption_type === 'product') setDeductMode('menu');
              if (data.rates.redemption_type === 'cash') setDeductMode('manual');
            }
          }
        }
      } catch (err) {
        console.error('Failed to load menu items:', err);
      }
    }
    loadMenuAndRates();
  }, [customer.business_id]);

  // Points to add calculation (4.3)
  const calculatedPointsToAdd = addMode === 'bill'
    ? Math.floor((parseFloat(billAmount) || 0) * pointsPerCurrency)
    : parseInt(manualAddPoints, 10) || 0;

  // Points to redeem calculation (4.4)
  const calculatedPointsToDeduct = deductMode === 'menu'
    ? selectedMenuItem ? Math.ceil(selectedMenuItem.price / currencyPerPoint) : 0
    : parseInt(manualDeductPoints, 10) || 0;

  const hasEnoughPoints = pointsBalance >= calculatedPointsToDeduct;

  const handleSyncComplete = async (result: { syncedCount: number }) => {
    if (result.syncedCount > 0) {
      try {
        const res = await fetch(`/api/customer/${customer.qr_token}`);
        const data = await res.json();
        if (data.success && data.customer) {
          setPointsBalance(data.customer.points_balance);
        }
      } catch (err) {
        console.warn('Failed to refresh customer balance after sync:', err);
      }
    }
  };

  // Handle Add Points (4.3 & 4.5 & 15.10 & 15.8)
  const handleAddPoints = async (e?: React.FormEvent, overrideManagerPin?: string) => {
    if (e) e.preventDefault();
    if (calculatedPointsToAdd <= 0) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      const reason = addMode === 'bill' 
        ? `purchase_bill: ${billAmount} EGP`
        : 'manual_addition_by_cashier';

      const saveRes = await saveOfflineTransaction({
        businessId: customer.business_id,
        customerId: customer.id,
        customerName: customer.name,
        customerQrToken: customer.qr_token,
        pointsChange: calculatedPointsToAdd,
        reason,
        invoiceReference: invoiceReference.trim() || undefined,
        managerPin: overrideManagerPin || managerPin.trim() || undefined,
      }, maxOfflineLimit);

      setIsSubmitting(false);

      if (!saveRes.success) {
        setStatusMessage({
          type: 'error',
          text: t('cashierControl.offlineLimitReached', { limit: maxOfflineLimit }) ||
            `وصلت للحد الأقصى للعمليات غير المتصلة (${maxOfflineLimit} عملية). يرجى الاتصال بالإنترنت أولاً.`
        });
        return;
      }

      setStatusMessage({
        type: 'success',
        text: t('cashierControl.savedOffline') || 'تم حفظ العملية محلياً — في انتظار الاتصال بالإنترنت',
      });
      setBillAmount('');
      setManualAddPoints('');
      setInvoiceReference('');
      setManagerPin('');
      setShowManagerPinModal(false);
      return;
    }

    try {
      const reason = addMode === 'bill' 
        ? `purchase_bill: ${billAmount} EGP`
        : 'manual_addition_by_cashier';

      const res = await fetch('/api/cashier/points', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId: customer.business_id,
          customerId: customer.id,
          pointsChange: calculatedPointsToAdd,
          reason,
          invoiceReference: invoiceReference.trim(),
          managerPin: overrideManagerPin || managerPin.trim() || undefined,
        }),
      });

      const data = await res.json();

      // 15.3: Handle daily limit exceeded with dedicated UI
      if (!data.success && data.errorCode === 'DAILY_LIMIT_EXCEEDED') {
        setDailyLimitError({
          pointsAddedToday: data.pointsAddedToday,
          dailyLimit: data.dailyLimit,
          requested: calculatedPointsToAdd,
        });
        setStatusMessage(null);
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('cashierControl.addFailed'));
      }

      setDailyLimitError(null);
      setPointsBalance(data.newBalance);
      triggerSuccessFlash();
      setStatusMessage({ 
        type: 'success', 
        text: data.message || t('cashierControl.addSuccess', { points: calculatedPointsToAdd }) 
      });
      setBillAmount('');
      setManualAddPoints('');
      setInvoiceReference('');
      setManagerPin('');
      setShowManagerPinModal(false);
    } catch (err: any) {
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err instanceof TypeError ||
        err.message?.toLowerCase().includes('fetch') ||
        err.message?.toLowerCase().includes('network')
      ) {
        const reason = addMode === 'bill' 
          ? `purchase_bill: ${billAmount} EGP`
          : 'manual_addition_by_cashier';

        const saveRes = await saveOfflineTransaction({
          businessId: customer.business_id,
          customerId: customer.id,
          customerName: customer.name,
          customerQrToken: customer.qr_token,
          pointsChange: calculatedPointsToAdd,
          reason,
          invoiceReference: invoiceReference.trim() || undefined,
          managerPin: overrideManagerPin || managerPin.trim() || undefined,
        }, maxOfflineLimit);

        if (saveRes.success) {
          setStatusMessage({
            type: 'success',
            text: t('cashierControl.savedOffline') || 'تم حفظ العملية محلياً — في انتظار الاتصال بالإنترنت',
          });
          setBillAmount('');
          setManualAddPoints('');
          setInvoiceReference('');
          setManagerPin('');
          setShowManagerPinModal(false);
          return;
        }
      }

      setDailyLimitError(null);
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Redeem Points (4.4 & 4.5 & 15.6)
  const handleRedeemPoints = async (e?: React.FormEvent, overrideCustomerPin?: string) => {
    if (e) e.preventDefault();
    if (calculatedPointsToDeduct <= 0 || !hasEnoughPoints) return;

    // 15.6: Check if high-value threshold applies and customerPin is not entered yet
    const pinToUse = overrideCustomerPin || customerPin.trim();
    if (highValueThreshold && calculatedPointsToDeduct >= highValueThreshold && !pinToUse) {
      setShowCustomerPinModal(true);
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      const reason = deductMode === 'menu' && selectedMenuItem
        ? `menu_item_redemption: ${selectedMenuItem.name}`
        : 'manual_redemption_by_cashier';

      const saveRes = await saveOfflineTransaction({
        businessId: customer.business_id,
        customerId: customer.id,
        customerName: customer.name,
        customerQrToken: customer.qr_token,
        pointsChange: -calculatedPointsToDeduct,
        reason,
        customerPin: pinToUse || undefined,
      }, maxOfflineLimit);

      setIsSubmitting(false);

      if (!saveRes.success) {
        setStatusMessage({
          type: 'error',
          text: t('cashierControl.offlineLimitReached', { limit: maxOfflineLimit }) ||
            `وصلت للحد الأقصى للعمليات غير المتصلة (${maxOfflineLimit} عملية). يرجى الاتصال بالإنترنت أولاً.`
        });
        return;
      }

      setStatusMessage({
        type: 'success',
        text: t('cashierControl.savedOffline') || 'تم حفظ العملية محلياً — في انتظار الاتصال بالإنترنت',
      });
      setSelectedMenuItem(null);
      setManualDeductPoints('');
      setCustomerPin('');
      setShowCustomerPinModal(false);
      return;
    }

    try {
      const reason = deductMode === 'menu' && selectedMenuItem
        ? `menu_item_redemption: ${selectedMenuItem.name}`
        : 'manual_redemption_by_cashier';

      const res = await fetch('/api/cashier/points', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId: customer.business_id,
          customerId: customer.id,
          pointsChange: -calculatedPointsToDeduct,
          reason,
          customerPin: pinToUse || undefined,
        }),
      });

      const data = await res.json();

      if (!data.success && data.errorCode === 'CUSTOMER_PIN_REQUIRED') {
        setShowCustomerPinModal(true);
        setStatusMessage({ type: 'error', text: t('cashierControl.customerPinPrompt') });
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('cashierControl.redeemFailed'));
      }

      setPointsBalance(data.newBalance);
      triggerSuccessFlash();
      setStatusMessage({ 
        type: 'success', 
        text: t('cashierControl.redeemSuccess', { 
          item: selectedMenuItem?.name || '', 
          points: calculatedPointsToDeduct 
        }) 
      });
      setSelectedMenuItem(null);
      setManualDeductPoints('');
      setCustomerPin('');
      setShowCustomerPinModal(false);
    } catch (err: any) {
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err instanceof TypeError ||
        err.message?.toLowerCase().includes('fetch') ||
        err.message?.toLowerCase().includes('network')
      ) {
        const reason = deductMode === 'menu' && selectedMenuItem
          ? `menu_item_redemption: ${selectedMenuItem.name}`
          : 'manual_redemption_by_cashier';

        const saveRes = await saveOfflineTransaction({
          businessId: customer.business_id,
          customerId: customer.id,
          customerName: customer.name,
          customerQrToken: customer.qr_token,
          pointsChange: -calculatedPointsToDeduct,
          reason,
          customerPin: pinToUse || undefined,
        }, maxOfflineLimit);

        if (saveRes.success) {
          setStatusMessage({
            type: 'success',
            text: t('cashierControl.savedOffline') || 'تم حفظ العملية محلياً — في انتظار الاتصال بالإنترنت',
          });
          setSelectedMenuItem(null);
          setManualDeductPoints('');
          setCustomerPin('');
          setShowCustomerPinModal(false);
          return;
        }
      }

      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 28.4: Load customer history for reversals
  const loadCustomerHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/customer/${customer.qr_token}/history?limit=30`);
      const data = await res.json();
      if (data.success && data.transactions) {
        setCustomerHistory(data.transactions);
      }
    } catch (err) {
      console.error('Failed to load customer history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForReversal) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setReversalError(t('cashierControl.reversalNotAllowedOffline') || 'عمليات الاسترجاع تتطلب اتصالاً مباشراً بالإنترنت');
      return;
    }

    setIsSubmittingReversal(true);
    setReversalError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cashier/reversal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: customer.business_id,
          transactionId: selectedTxForReversal.id,
          reason: reversalReason.trim() || 'استرجاع عملية',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل استرجاع العملية');
      }

      setPointsBalance(data.newBalance);
      setStatusMessage({
        type: 'success',
        text: isRtl ? 'تم استرجاع العملية بنجاح وتحديث رصيد العميل' : 'Transaction reversed successfully',
      });
      setSelectedTxForReversal(null);
      setReversalReason('');
      loadCustomerHistory();
    } catch (err: any) {
      setReversalError(err.message || 'حدث خطأ أثناء الاسترجاع');
    } finally {
      setIsSubmittingReversal(false);
    }
  };

  return (
    <div className="w-full max-w-sm flex flex-col gap-4">
      {/* Phase 32: Offline Resilience Banner */}
      <OfflineSyncBanner maxLimit={maxOfflineLimit} onSyncComplete={handleSyncComplete} />

      {/* 4.2: Customer Header & Current Balance Card */}
      <div 
        className="rounded-3xl p-5 border shadow-sm flex flex-col relative overflow-hidden backdrop-blur-xl"
        style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <span className="text-[11px] uppercase tracking-wider block opacity-60">{t('cashierControl.currentCustomer')}</span>
            <h2 className="text-base font-bold" id="cashier-customer-name">{customer.name}</h2>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs py-1 px-2.5 rounded-lg border transition-all active:scale-95"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
          >
            <ArrowLeft className={`w-3.5 h-3.5 ${isRtl ? '' : 'rotate-180'}`} />
            <span>{t('cashierControl.anotherScan')}</span>
          </button>
        </div>

        <div 
          className="pt-3 flex items-baseline justify-between"
        >
          <span className="text-xs opacity-70">{t('cashierControl.pointsBalanceLabel')}</span>
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1.5">
              <span 
                className="text-3xl font-black transition-all duration-300"
                style={{ color: successFlash ? '#22c55e' : 'var(--color-accent)' }}
                id="cashier-points-display"
              >
                {pointsBalance.toLocaleString()}
              </span>
              <span className="text-xs opacity-80">{t('cashierControl.pts')}</span>
            </div>
            {/* Monetary value of customer's points */}
            <span className="text-[11px] opacity-55 font-mono">
              ≈ {(pointsBalance * currencyPerPoint).toFixed(2)} {t('common.currencyUnit')}
            </span>
          </div>
        </div>
      </div>

      {/* 15.3: Daily Limit Exceeded — special prominent warning */}
      {dailyLimitError && (
        <div
          className="p-4 rounded-2xl border-2 flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--color-error-bg)',
            borderColor: 'var(--color-error-border)',
            color: 'var(--color-error-text)',
          }}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{t('cashierControl.dailyLimitExceeded')}</span>
          </div>
          <p className="text-xs opacity-80">
            {t('cashierControl.dailyLimitExceededDetail', {
              today: dailyLimitError.pointsAddedToday,
              limit: dailyLimitError.dailyLimit,
              requested: dailyLimitError.requested,
            })}
          </p>
        </div>
      )}

      {/* Feedback Message */}
      {statusMessage && (
        <div 
          className="p-3 rounded-2xl text-xs font-medium flex items-center gap-2 border"
          style={{
            backgroundColor: statusMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: statusMessage.type === 'success' ? 'var(--color-success-text)' : 'var(--color-error-text)',
            borderColor: statusMessage.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
          }}
        >
          {statusMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Action Tabs: Add vs Redeem vs Reversals — Phase 28.4 */}
      <div 
        className="grid grid-cols-3 p-1 rounded-2xl border backdrop-blur-xl gap-1"
        style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        {/* Add Points tab */}
        <button
          onClick={() => { setActiveTab('add'); setStatusMessage(null); }}
          id="tab-add-points"
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'add' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
          }`}
          style={activeTab === 'add' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{t('cashierControl.addTab')}</span>
        </button>

        {/* Redeem tab */}
        <button
          onClick={() => { setActiveTab('redeem'); setStatusMessage(null); }}
          id="tab-redeem-points"
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'redeem' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
          }`}
          style={activeTab === 'redeem' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
        >
          <MinusCircle className="w-3.5 h-3.5" />
          <span>{t('cashierControl.redeemTab')}</span>
        </button>

        {/* Phase 28.4: Reversal & Returns tab */}
        <button
          onClick={() => {
            setActiveTab('reversal');
            setStatusMessage(null);
            loadCustomerHistory();
          }}
          id="tab-reversal-points"
          className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'reversal' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
          }`}
          style={activeTab === 'reversal' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isRtl ? 'استرجاع' : 'Returns'}</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: 4.3 إضافة نقاط (Add Points)
         ========================================================================= */}
      {activeTab === 'add' && (
        <form 
          onSubmit={handleAddPoints}
          className="rounded-3xl p-5 border shadow-sm flex flex-col gap-4 backdrop-blur-xl"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between text-xs pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="font-semibold">{t('cashierControl.addModeLabel')}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddMode('bill')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${addMode === 'bill' ? 'font-bold' : 'opacity-60'}`}
                style={addMode === 'bill' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
              >
                {t('cashierControl.byBill')}
              </button>
              <button
                type="button"
                onClick={() => setAddMode('manual')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${addMode === 'manual' ? 'font-bold' : 'opacity-60'}`}
                style={addMode === 'manual' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
              >
                {t('cashierControl.directPoints')}
              </button>
            </div>
          </div>

          {addMode === 'bill' ? (
            <div>
              <label className="block text-xs font-medium opacity-80 mb-1.5">
                {t('cashierControl.billAmount')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="any"
                  id="bill-amount-input"
                  dir="ltr"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="150"
                  className={`w-full py-2.5 px-3 rounded-xl text-sm border focus:outline-hidden ${isRtl ? 'pl-9' : 'pr-9'}`}
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  required
                />
                <Receipt className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
              <span className="text-[11px] opacity-60 mt-1 block">
                {t('cashierControl.rateHint', { rate: pointsPerCurrency })}
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium opacity-80 mb-1.5">
                {t('cashierControl.pointsToAdd')}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                id="manual-points-input"
                dir="ltr"
                value={manualAddPoints}
                onChange={(e) => setManualAddPoints(e.target.value)}
                placeholder="50"
                className="w-full py-2.5 px-3 rounded-xl text-sm border focus:outline-hidden"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                required
              />
            </div>
          )}

          {/* 15.10: POS Invoice Reference Input */}
          <div>
            <label className="block text-xs font-medium opacity-80 mb-1.5">
              {t('cashierControl.invoiceReference')}
            </label>
            <input
              type="text"
              id="invoice-reference-input"
              value={invoiceReference}
              onChange={(e) => setInvoiceReference(e.target.value)}
              placeholder={t('cashierControl.invoiceReferencePlaceholder')}
              className="w-full py-2.5 px-3 rounded-xl text-sm border focus:outline-hidden"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              required
            />
            <span className="text-[11px] opacity-60 mt-1 block">
              {t('cashierControl.invoiceReferenceHint')}
            </span>
          </div>

          {/* Points summary to add */}
          <div 
            className="p-3 rounded-xl flex items-center justify-between text-xs"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            <span className="opacity-70">{t('cashierControl.pointsDue')}</span>
            <span className="font-bold text-base" style={{ color: 'var(--color-accent)' }}>
              +{calculatedPointsToAdd} {t('cashierControl.pts')}
            </span>
          </div>

          <button
            type="submit"
            id="submit-add-points-btn"
            disabled={calculatedPointsToAdd <= 0 || isSubmitting}
            className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 btn-gradient"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
            <span>{isSubmitting ? t('cashierControl.adding') : t('cashierControl.confirmAdd')}</span>
          </button>

          {/* 15.8: Manager Approval Retry Button */}
          {statusMessage && statusMessage.type === 'error' && (
            <button
              type="button"
              id="open-manager-pin-btn"
              onClick={() => setShowManagerPinModal(true)}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all active:scale-95"
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{t('cashierControl.retryWithManager')}</span>
            </button>
          )}
        </form>
      )}

      {/* =========================================================================
          TAB 2: 4.4 خصم واستبدال نقاط (Redeem Points)
         ========================================================================= */}
      {activeTab === 'redeem' && (
        <form 
          onSubmit={handleRedeemPoints}
          className="rounded-3xl p-5 border shadow-sm flex flex-col gap-4 backdrop-blur-xl"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between text-xs pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="font-semibold">{t('cashierControl.deductModeLabel')}</span>
            {/* 4.4: Only show mode toggle when business allows 'both' methods */}
            {redemptionType === 'both' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeductMode('menu')}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${deductMode === 'menu' ? 'font-bold' : 'opacity-60'}`}
                  style={deductMode === 'menu' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
                >
                  {t('cashierControl.byMenu')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeductMode('manual')}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${deductMode === 'manual' ? 'font-bold' : 'opacity-60'}`}
                  style={deductMode === 'manual' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
                >
                  {t('cashierControl.directPoints')}
                </button>
              </div>
            )}
            {redemptionType === 'product' && (
              <span className="text-[11px] opacity-60">{t('cashierControl.byMenu')}</span>
            )}
            {redemptionType === 'cash' && (
              <span className="text-[11px] opacity-60">{t('cashierControl.directPoints')}</span>
            )}
          </div>

          {deductMode === 'menu' ? (
            <div>
              <label className="block text-xs font-medium opacity-80 mb-2">
                {t('cashierControl.chooseItem')}
              </label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {menuItems.length === 0 ? (
                  <p className="text-xs opacity-60 text-center py-4">{t('cashierControl.emptyMenu')}</p>
                ) : (
                  menuItems.map((item) => {
                    const requiredPoints = Math.ceil(item.price / currencyPerPoint);
                    const canAfford = pointsBalance >= requiredPoints;
                    const isSelected = selectedMenuItem?.id === item.id;

                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedMenuItem(item)}
                        disabled={!canAfford}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between text-xs ${
                          isSelected ? 'ring-2' : ''
                        } ${!canAfford ? 'opacity-40 cursor-not-allowed' : 'active:scale-98'}`}
                        style={{
                          backgroundColor: isSelected ? 'var(--color-bg)' : 'transparent',
                          borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Coffee className="w-3.5 h-3.5 opacity-60" />
                          <span className="font-semibold">{item.name}</span>
                        </div>
                        <div className={isRtl ? 'text-left' : 'text-right'}>
                          <span className="font-bold block" style={{ color: 'var(--color-accent)' }}>
                            {requiredPoints} {t('cashierControl.pts')}
                          </span>
                          <span className="text-[10px] opacity-60">({item.price} {t('common.currencyUnit')})</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium opacity-80 mb-1.5">
                {t('cashierControl.pointsToDeduct')}
              </label>
              <input
                type="number"
                min="1"
                max={pointsBalance}
                step="1"
                id="manual-deduct-input"
                dir="ltr"
                value={manualDeductPoints}
                onChange={(e) => setManualDeductPoints(e.target.value)}
                placeholder="50"
                className="w-full py-2.5 px-3 rounded-xl text-sm border focus:outline-hidden"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                required
              />
            </div>
          )}

          {/* Points deduction summary */}
          <div 
            className="p-3 rounded-xl flex items-center justify-between text-xs"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            <span className="opacity-70">{t('cashierControl.pointsRequired')}</span>
            <span className="font-bold text-base" style={{ color: 'var(--color-error-text)' }}>
              -{calculatedPointsToDeduct} {t('cashierControl.pts')}
            </span>
          </div>

          {!hasEnoughPoints && calculatedPointsToDeduct > 0 && (
            <p className="text-[11px] text-center font-medium flex items-center justify-center gap-1" style={{ color: 'var(--color-error-text)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('cashierControl.insufficientBalance')}</span>
            </p>
          )}

          <button
            type="submit"
            id="submit-redeem-points-btn"
            disabled={calculatedPointsToDeduct <= 0 || !hasEnoughPoints || isSubmitting}
            className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 btn-gradient"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MinusCircle className="w-4 h-4" />}
            <span>{isSubmitting ? t('cashierControl.redeeming') : t('cashierControl.confirmRedeem')}</span>
          </button>
        </form>
      )}

      {/* 15.6: Customer PIN Confirmation Modal */}
      {showCustomerPinModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div 
            className="w-full max-w-xs rounded-3xl p-6 border shadow-2xl flex flex-col gap-4 backdrop-blur-xl"
            style={{ backgroundColor: 'rgba(16, 14, 28, 0.95)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
              <h3 className="text-sm font-bold">{t('cashierControl.customerPinRequired')}</h3>
            </div>
            <p className="text-xs opacity-80 leading-relaxed">
              {t('cashierControl.customerPinPrompt')}
            </p>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]*"
              id="customer-pin-input"
              value={customerPin}
              onChange={(e) => setCustomerPin(e.target.value)}
              placeholder="••••"
              className="w-full py-2.5 px-3 rounded-xl text-center text-lg tracking-widest font-mono border focus:outline-hidden"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF' }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCustomerPinModal(false); setCustomerPin(''); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all"
                style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                id="confirm-customer-pin-btn"
                disabled={customerPin.trim().length < 4 || isSubmitting}
                onClick={() => handleRedeemPoints(undefined, customerPin)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 btn-gradient"
              >
                {t('cashierControl.confirmRedeem')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 15.8: Manager Approval PIN Modal */}
      {showManagerPinModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div 
            className="w-full max-w-xs rounded-3xl p-6 border shadow-2xl flex flex-col gap-4 backdrop-blur-xl"
            style={{ backgroundColor: 'rgba(16, 14, 28, 0.95)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-bold">{t('cashierControl.managerPinRequired')}</h3>
            </div>
            <p className="text-xs opacity-80 leading-relaxed">
              {t('cashierControl.retryWithManager')}
            </p>
            <input
              type="password"
              maxLength={6}
              inputMode="numeric"
              id="manager-pin-input"
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              placeholder="••••"
              className="w-full py-2.5 px-3 rounded-xl text-center text-lg tracking-widest font-mono border focus:outline-hidden"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF' }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowManagerPinModal(false); setManagerPin(''); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all"
                style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                id="confirm-manager-pin-btn"
                disabled={managerPin.trim().length < 4 || isSubmitting}
                onClick={() => handleAddPoints(undefined, managerPin)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 btn-gradient"
              >
                {t('cashierControl.confirmAdd')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================================
          TAB 3: Phase 28.4 استرجاع عملية (Reversals & Returns)
         ========================================================================= */}
      {activeTab === 'reversal' && (
        <div 
          className="rounded-3xl p-5 border shadow-sm flex flex-col gap-3 backdrop-blur-xl"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <h3 className="text-xs font-bold">{isRtl ? 'العمليات الأخيرة وإمكانية الاسترجاع' : 'Recent Transactions & Reversals'}</h3>
            </div>
            <button
              type="button"
              onClick={loadCustomerHistory}
              disabled={isLoadingHistory}
              className="p-1 rounded-lg border text-xs opacity-70 hover:opacity-100 transition-all cursor-pointer"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <p className="text-[11px] opacity-70 leading-relaxed">
            {isRtl ? 'يمكنك استرجاع العمليات الخاطئة أو المرتجعات خلال 48 ساعة. استرجاع الاستبدال يعيد النقاط لأصلها، واسترجاع الإضافة يخصمها.' : 'Reversals cancel the operation and refund points back to their original state.'}
          </p>

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin opacity-50" />
            </div>
          ) : customerHistory.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-6">
              {isRtl ? 'لا توجد عمليات سابقة لهذا العميل' : 'No previous transactions found'}
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
              {customerHistory.map((tx: any) => {
                const isReversal = tx.type === 'refund' || tx.type === 'reversal' || Boolean(tx.reversal_of);
                const isAlreadyReversed = Boolean(tx.is_reversed);
                const canReverse = !isReversal && !isAlreadyReversed;

                return (
                  <div
                    key={tx.id}
                    className="p-3 rounded-2xl border text-xs flex items-center justify-between gap-2"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-mono font-bold ${tx.points_change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {tx.points_change > 0 ? `+${tx.points_change}` : tx.points_change} pts
                        </span>
                        {isAlreadyReversed && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30">
                            {isRtl ? 'تم استرجاعها' : 'Reversed'}
                          </span>
                        )}
                        {isReversal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/30">
                            {isRtl ? 'عملية عكسية' : 'Reversal entry'}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] opacity-70 truncate mt-0.5">{tx.reason || ''}</span>
                      <span className="text-[10px] opacity-50 mt-0.5">
                        {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {canReverse && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTxForReversal(tx);
                          setReversalError(null);
                          setReversalReason('');
                        }}
                        className="px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 shrink-0 cursor-pointer"
                        style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)', backgroundColor: 'var(--color-card-bg)' }}
                      >
                        {isRtl ? 'استرجاع' : 'Reverse'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Phase 28.4: Reversal Confirmation Modal */}
      {selectedTxForReversal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReversal}
            className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl flex flex-col gap-4"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
              <RotateCcw className="w-5 h-5" />
              <span>{isRtl ? 'تأكيد استرجاع العملية' : 'Confirm Transaction Reversal'}</span>
            </div>

            <p className="text-xs opacity-80 leading-relaxed">
              {isRtl
                ? `أنت على وشك إلغاء تأثير هذه العملية (${selectedTxForReversal.points_change > 0 ? `+${selectedTxForReversal.points_change}` : selectedTxForReversal.points_change} نقطة). سيتم تحديث الرصيد وتوثيق الاسترجاع فوراً.`
                : `You are about to reverse ${selectedTxForReversal.points_change} pts.`}
            </p>

            {reversalError && (
              <div 
                className="p-2.5 rounded-xl border text-xs"
                style={{
                  backgroundColor: 'var(--color-error-bg)',
                  borderColor: 'var(--color-error-border)',
                  color: 'var(--color-error-text)'
                }}
              >
                {reversalError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1 opacity-80">
                {isRtl ? 'سبب الاسترجاع (اختياري)' : 'Reversal Reason (Optional)'}
              </label>
              <input
                type="text"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder={isRtl ? 'مثال: مرتجع عميل / خطأ في الإدخال' : 'e.g., Customer return / cashier mistake'}
                className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedTxForReversal(null)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmittingReversal}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isSubmittingReversal ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : (isRtl ? 'تأكيد الاسترجاع' : 'Confirm Reversal')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
