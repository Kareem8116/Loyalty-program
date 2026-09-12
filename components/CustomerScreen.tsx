'use client';

import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { 
  User, Sparkle, Calendar, ShieldCheck, X, ArrowsClockwise, Tag, Clock, Medal, ClockCounterClockwise, 
  ArrowDownLeft, ArrowUpRight, Gift, QrCode, Barcode, ArrowRight, ArrowLeft, Copy, Check 
} from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import Link from 'next/link';
import { useLocale } from './LocaleProvider';

interface CustomerTransaction {
  id: string;
  points_change: number;
  type: 'earned' | 'redeemed' | 'expired' | 'referral';
  reason: string;
  item_name: string | null;
  branch_name: string | null;
  expires_at: string | null;  // Phase 14+18: only present on earn rows
  created_at: string;
}

interface CustomerScreenProps {
  customer: {
    id: string;
    business_id: string;
    name: string;
    qr_token: string;
    points_balance: number;
    business_name?: string;
    expiring_points_30d?: number;
    tier?: {
      lifetimeEarnedPoints: number;
      currentTier: {
        id?: string;
        name: string;
        min_points_earned: number;
        benefits_description?: string | null;
      };
      nextTier?: {
        id?: string;
        name: string;
        min_points_earned: number;
        benefits_description?: string | null;
      } | null;
      pointsToNextTier: number;
      progressPercent: number;
    } | null;
    features?: Record<string, boolean>;
    branding?: {
      display_name?: string | null;
      logo_url?: string | null;
      primary_color?: string;
      accent_color?: string;
      font_family?: string;
      layout_variant?: 'centered-classic' | 'qr-top' | 'horizontal-offers';
    };
    rates?: {
      points_per_currency_unit: number;
      currency_per_point: number;
    };
  };
}

interface Offer {
  id: string;
  title: string;
  description: string;
  type: 'special' | 'daily';
  start_date: string;
  end_date: string;
  image_url?: string | null;
}

export default function CustomerScreen({ customer }: CustomerScreenProps) {
  const { t, locale, isRtl } = useLocale();
  const [scanUrl, setScanUrl] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);

  // Barcode & QR Code state
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  const [codeFormat, setCodeFormat] = useState<'qr' | 'barcode'>('qr');
  const [copiedCode, setCopiedCode] = useState(false);

  const rawCode: string = (customer as any).short_code || customer.qr_token || '';
  const cleanCode = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formattedCode = cleanCode.length === 9
    ? `${cleanCode.slice(0, 3)}-${cleanCode.slice(3, 6)}-${cleanCode.slice(6, 9)}`
    : cleanCode.length > 12
    ? `${cleanCode.slice(0, 8)}…`
    : cleanCode;

  // Load saved code format from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('customer_code_format');
      if (saved === 'qr' || saved === 'barcode') {
        setCodeFormat(saved);
      }
    } catch {}
  }, []);

  const handleFormatChange = (format: 'qr' | 'barcode') => {
    setCodeFormat(format);
    try {
      localStorage.setItem('customer_code_format', format);
    } catch {}
  };

  useEffect(() => {
    if (codeFormat === 'barcode' && barcodeRef.current && cleanCode) {
      try {
        JsBarcode(barcodeRef.current, cleanCode, {
          format: 'CODE128',
          lineColor: '#000000',
          width: cleanCode.length > 15 ? 1.5 : 2.2,
          height: 85,
          displayValue: false,
          background: '#ffffff',
          margin: 10,
        });
      } catch (err) {
        console.error('JsBarcode render error:', err);
      }
    }
  }, [codeFormat, cleanCode]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  // 24.7: Fetch smart AI recommendation in the background if enabled (Fail-silent)
  useEffect(() => {
    if (customer.features?.ai_recommendations && customer.qr_token) {
      fetch(`/api/customer/${customer.qr_token}/recommendation?locale=${locale}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.recommendation) {
            setAiRecommendation(data.recommendation);
          }
        })
        .catch(() => {
          // Fail-silent: does not disrupt customer card
        });
    }
  }, [customer.features?.ai_recommendations, customer.qr_token, locale]);

  // Modal state (6.3, 6.4, 18.2)
  const [activeModal, setActiveModal] = useState<'special' | 'daily' | 'history' | null>(null);
  const [offersList, setOffersList] = useState<Offer[]>([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [transactionsList, setTransactionsList] = useState<CustomerTransaction[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // PWA Install Prompt
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed) return;
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredInstallPrompt(null);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    try { localStorage.setItem('pwa_install_dismissed', '1'); } catch {}
  };

  useEffect(() => {
    // Generate full URL for the QR code
    if (typeof window !== 'undefined') {
      setScanUrl(`${window.location.origin}/card/${customer.qr_token}`);
    }
  }, [customer.qr_token]);

  const openOffersModal = async (type: 'special' | 'daily') => {
    setActiveModal(type);
    setIsLoadingOffers(true);
    try {
      const res = await fetch(`/api/offers?businessId=${customer.business_id}&type=${type}`);
      const data = await res.json();
      if (data.success) {
        setOffersList(data.offers || []);
      }
    } catch (err) {
      console.error('Error fetching offers:', err);
    } finally {
      setIsLoadingOffers(false);
    }
  };

  const openHistoryModal = async () => {
    setActiveModal('history');
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/customer/${customer.qr_token}/history`);
      const data = await res.json();
      if (data.success) {
        setTransactionsList(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching transaction history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const branding = customer.branding;
  const layoutVariant = branding?.layout_variant || 'centered-classic';
  const customBg = branding?.primary_color || 'var(--color-bg)';
  const customAccent = branding?.accent_color || 'var(--color-accent)';
  const customFont = branding?.font_family || 'Inter';
  const businessDisplayName = branding?.display_name || customer.business_name || t('customer.defaultBusiness');

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden"
      style={{
        backgroundColor: customBg,
        color: 'var(--color-text)',
        fontFamily: `${customFont}, sans-serif`,
        ['--color-accent' as any]: customAccent,
      }}
      data-layout-variant={layoutVariant}
    >
      {/* Ambient background glows */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(108,99,255,0.07) 0%, transparent 70%)',
        top: '-150px',
        right: '-150px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(78,205,196,0.05) 0%, transparent 70%)',
        bottom: '-50px',
        left: '-100px',
        pointerEvents: 'none',
      }} />

      {/* Mobile-First Container (~375px - 414px) */}
      <div className={`w-full max-w-sm flex flex-col flex-1 ${layoutVariant === 'qr-top' ? 'justify-start gap-4' : 'justify-between'} py-2 relative z-10`}>
        
        {/* =========================================================================
            1. TOP BAR (أعلى الشاشة):
               - أيقونة حساب (يسار)
               - اسم المكان (display_name من Branding وليس Pointat)
               - أيقونة تبديل light/dark mode (يمين)
           ========================================================================= */}
        <header className="flex items-center justify-between w-full pt-2 pb-4">
          <div className="flex items-center gap-2">
            <Link
              href={`/account?token=${customer.qr_token}`}
              id="account-btn"
              aria-label={t('customer.userAccount')}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-sm"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-border)',
              }}
            >
              <User className="w-5 h-5" />
            </Link>

            <Link
              href="/my-places"
              id="customer-my-places-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-xs border transition-transform active:scale-95"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {isRtl ? <ArrowRight size={14} weight="light" /> : <ArrowLeft size={14} weight="light" />}
              <span className="hidden sm:inline">{t('customer.myPlacesBtn')}</span>
            </Link>
          </div>

          <div className="text-center">
            <span 
              className="text-xs font-semibold tracking-wider uppercase block"
              style={{ color: 'var(--color-accent)' }}
              id="customer-screen-business-name"
            >
              {businessDisplayName}
            </span>
            <span className="text-sm font-medium opacity-90">
              {t('customer.greeting', { name: customer.name })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* =========================================================================
            2. MIDDLE (المنتصف):
               - QR/Barcode كبير وواضح مع إمكانية التبديل
               - عدد النقاط تحته مباشرة
           ========================================================================= */}
        <main className="flex flex-col items-center my-auto py-6">
          {/* Card Container */}
          <div 
            className="w-full glass-card p-6 flex flex-col items-center transition-transform"
          >
            {/* Format Toggle: QR Code vs Barcode */}
            <div 
              className="flex items-center gap-1.5 p-1 rounded-2xl mb-4 border shadow-xs"
              style={{
                backgroundColor: 'var(--color-input-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              <button
                type="button"
                id="toggle-qr-mode"
                onClick={() => handleFormatChange('qr')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  codeFormat === 'qr' ? 'shadow-xs' : 'opacity-60 hover:opacity-100'
                }`}
                style={codeFormat === 'qr' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
              >
                <QrCode size={14} weight="light" className="shrink-0" />
                <span>{t('customer.qrCodeTab')}</span>
              </button>

              <button
                type="button"
                id="toggle-barcode-mode"
                onClick={() => handleFormatChange('barcode')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  codeFormat === 'barcode' ? 'shadow-xs' : 'opacity-60 hover:opacity-100'
                }`}
                style={codeFormat === 'barcode' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
              >
                <Barcode size={14} weight="light" className="shrink-0" />
                <span>{t('customer.barcodeTab')}</span>
              </button>
            </div>

            {/* Code Display Container */}
            {codeFormat === 'qr' ? (
              <div 
                className="p-3.5 rounded-2xl shadow-inner flex items-center justify-center transition-all bg-white"
                style={{ border: '2px dashed var(--color-border)' }}
              >
                <QRCodeSVG
                  value={scanUrl || customer.qr_token}
                  size={220}
                  level="L"
                  includeMargin={true}
                  fgColor="#000000"
                  bgColor="#FFFFFF"
                />
              </div>
            ) : (
              <div 
                className="p-3.5 rounded-2xl shadow-inner flex flex-col items-center justify-center transition-all bg-white w-full overflow-hidden"
                style={{ border: '2px dashed var(--color-border)' }}
              >
                <svg ref={barcodeRef} className="max-w-full h-auto" />
              </div>
            )}

            {/* Phase 26.3: Formatted Quick Code with 1-Tap Copy */}
            <div className="flex flex-col items-center gap-1 mt-3.5" dir="ltr">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--color-border)' }}>
                <ShieldCheck size={16} weight="light" className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                <span className="font-mono font-bold tracking-[0.18em] text-sm" id="customer-short-code">
                  {formattedCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
                  title={t('customer.copyCode')}
                >
                  {copiedCode ? (
                    <Check size={14} weight="light" className="text-emerald-500" />
                  ) : (
                    <Copy size={14} weight="light" />
                  )}
                </button>
              </div>
              <span className="text-[11px] opacity-60 font-medium text-center">
                {t('customer.scanPrompt')}
              </span>
            </div>

            {/* Points Count DIRECTLY BELOW the QR Code (إلزامي في RULES.md) */}
            <div className="mt-6 text-center w-full pt-4 border-t" style={{ borderColor: 'var(--color-separator)' }}>
              {/* 17.4: Membership Tier Badge */}
              {customer.tier?.currentTier && (
                <div className="flex items-center justify-center mb-2.5">
                  <div
                    className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold shadow-xs border transition-transform hover:scale-105"
                    style={{
                      backgroundColor: 'var(--color-input-bg)',
                      borderColor: 'var(--color-accent)',
                      color: 'var(--color-accent)',
                    }}
                    id="customer-tier-badge"
                  >
                    <Medal size={16} weight="light" className="shrink-0" />
                    <span>{customer.tier.currentTier.name}</span>
                  </div>
                </div>
              )}

              <span className="text-xs font-medium uppercase tracking-widest block opacity-70 mb-1">
                {t('customer.pointsLabel')}
              </span>
              <div className="flex items-baseline justify-center gap-2">
                <span 
                  className="text-5xl font-black tracking-tight"
                  style={{ color: 'var(--color-accent)' }}
                  id="customer-points-balance"
                >
                  {customer.points_balance.toLocaleString()}
                </span>
                <span className="text-sm font-semibold opacity-80">
                  {t('customer.pointsUnit')}
                </span>
              </div>

              {/* Points monetary value: shows how much the balance is worth in currency */}
              {customer.rates && customer.points_balance > 0 && (
                <div
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold"
                  style={{
                    backgroundColor: 'rgba(var(--color-accent-rgb, 108,99,255), 0.1)',
                    color: 'var(--color-accent)',
                    border: '1px solid rgba(var(--color-accent-rgb, 108,99,255), 0.2)',
                  }}
                  id="customer-points-value"
                >
                  <span>≈</span>
                  <span className="font-mono font-bold">
                    {(customer.points_balance * customer.rates.currency_per_point).toFixed(2)}
                  </span>
                  <span>{t('common.currencyUnit')}</span>
                </div>
              )}

              {/* Earn rate hint — shows business-specific earn rate */}
              {customer.rates && (
                <div
                  className="mt-2 text-[11px] opacity-55 font-medium"
                  id="customer-earn-rate-hint"
                >
                  {isRtl
                    ? `كل ${(1 / customer.rates.points_per_currency_unit).toFixed(0)} ${t('common.currencyUnit')} = نقطة`
                    : `${(1 / customer.rates.points_per_currency_unit).toFixed(0)} ${t('common.currencyUnit')} = 1 pt`
                  }
                </div>
              )}


              {/* 17.4: Progress towards next tier */}
              {customer.tier?.nextTier && (
                <div className="mt-3.5 pt-3 border-t px-2" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center justify-between text-[11px] opacity-70 mb-1.5">
                    <span className="font-medium">
                      {t('customer.nextTierProgress', { 
                        points: customer.tier.pointsToNextTier, 
                        tier: customer.tier.nextTier.name 
                      })}
                    </span>
                    <span className="font-bold font-mono">{customer.tier.progressPercent}%</span>
                  </div>
                  <div 
                    className="w-full h-1.5 rounded-full overflow-hidden" 
                    style={{ backgroundColor: 'var(--color-border)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${customer.tier.progressPercent}%`,
                        backgroundColor: 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 14.4: Notice for expiring points within 30 days */}
              {Boolean(customer.expiring_points_30d && customer.expiring_points_30d > 0) && (
                <div 
                  className="mt-3.5 w-full p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold text-center"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.25)',
                    color: 'var(--color-error-text)'
                  }}
                  id="expiring-points-alert"
                >
                  <Clock size={14} weight="light" className="shrink-0" />
                  <span>{t('customer.expiringAlert', { points: customer.expiring_points_30d || 0 })}</span>
                </div>
              )}

              {/* 24.7: Smart AI Recommendation Banner (Gemini API) */}
              {aiRecommendation && (
                <div 
                  className="mt-3.5 w-full p-3 rounded-2xl border flex items-start gap-2.5 text-xs text-center justify-center transition-all"
                  style={{ 
                    backgroundColor: 'var(--color-input-bg)', 
                    borderColor: 'var(--color-accent)',
                    color: 'var(--color-text)'
                  }}
                  id="ai-recommendation-banner"
                >
                  <Sparkle size={16} weight="light" className="shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
                  <p className="leading-relaxed font-medium">{aiRecommendation}</p>
                </div>
              )}

              {/* 18.2: Quick View Transaction History Button */}
              <div className="mt-3.5 flex justify-center">
                <button
                  id="view-history-card-btn"
                  onClick={openHistoryModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-transform active:scale-95 border shadow-2xs"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <ClockCounterClockwise size={14} weight="light" />
                  <span>{t('customer.viewHistory')}</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="w-full pt-4 pb-2">
          <div className={`flex items-center gap-2 ${layoutVariant === 'horizontal-offers' ? 'overflow-x-auto pb-1 no-scrollbar' : ''}`} id="customer-screen-footer-actions">
            {/* Special Offers */}
            {customer.features?.offers !== false && (
              <button
                id="special-offers-btn"
                onClick={() => openOffersModal('special')}
                className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl transition-all active:scale-95 shadow-xs font-medium text-xs text-center"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Sparkle size={16} weight="light" className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                <span className="truncate">{t('customer.specialOffers')}</span>
              </button>
            )}

            {/* Daily Offers */}
            {customer.features?.daily_offers !== false && (
              <button
                id="daily-offers-btn"
                onClick={() => openOffersModal('daily')}
                className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl transition-all active:scale-95 shadow-xs font-medium text-xs text-center"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Calendar size={16} weight="light" className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                <span className="truncate">{t('customer.dailyOffers')}</span>
              </button>
            )}

            {/* Transaction History */}
            <button
              id="history-btn"
              onClick={openHistoryModal}
              className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl transition-all active:scale-95 shadow-xs font-medium text-xs text-center"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              <ClockCounterClockwise size={16} weight="light" className="shrink-0" style={{ color: 'var(--color-accent)' }} />
              <span className="truncate">{t('customer.transactionHistory')}</span>
            </button>
          </div>
        </footer>

      </div>

      {/* =========================================================================
          MODALS: OFFERS (6.3 & 6.4) & TRANSACTION HISTORY (18.2)
         ========================================================================= */}
      {activeModal && (
        <div 
          className="fixed inset-0 z-50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => setActiveModal(null)}
        >
          <div 
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 border shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b mb-4" style={{ borderColor: 'var(--color-separator)' }}>
              <div className="flex items-center gap-2">
                {activeModal === 'special' ? (
                  <Sparkle size={20} weight="light" style={{ color: 'var(--color-accent)' }} />
                ) : activeModal === 'daily' ? (
                  <Calendar size={20} weight="light" style={{ color: 'var(--color-accent)' }} />
                ) : (
                  <ClockCounterClockwise size={20} weight="light" style={{ color: 'var(--color-accent)' }} />
                )}
                <h3 className="text-base font-bold">
                  {activeModal === 'special' 
                    ? t('customer.exclusiveSpecialOffers') 
                    : activeModal === 'daily'
                    ? t('customer.todayOffers')
                    : t('customer.transactionHistory')}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                aria-label={t('common.close')}
                className="w-8 h-8 rounded-full flex items-center justify-center border transition-transform active:scale-95"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <X size={16} weight="light" />
              </button>
            </div>

            {/* Modal Content */}
            {activeModal === 'history' ? (
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto" id="transactions-list-container">
                {isLoadingHistory ? (
                  <div className="py-8 flex flex-col items-center justify-center opacity-70">
                    <ArrowsClockwise size={24} weight="light" className="animate-spin mb-2" />
                    <span className="text-xs">{t('customer.loadingHistory')}</span>
                  </div>
                ) : transactionsList.length === 0 ? (
                  <div className="py-8 text-center opacity-60 flex flex-col items-center" id="empty-transactions-message">
                    <ClockCounterClockwise size={32} weight="light" className="mb-2 opacity-40" />
                    <p className="text-xs font-medium">
                      {t('customer.noTransactions')}
                    </p>
                  </div>
                ) : (
                  transactionsList.map((tx) => {
                    const isPositive = tx.points_change > 0;
                    const isRedeemed = tx.type === 'redeemed';
                    const isExpired = tx.type === 'expired';
                    const isReferral = tx.type === 'referral';

                    return (
                      <div
                        key={tx.id}
                        className="p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all"
                        style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border"
                            style={{
                              backgroundColor: isPositive
                                ? 'var(--color-success-bg)'
                                : isExpired
                                ? 'var(--color-error-bg)'
                                : 'var(--color-badge-special-bg)',
                              borderColor: isPositive
                                ? 'var(--color-success-border)'
                                : isExpired
                                ? 'var(--color-error-border)'
                                : 'var(--color-badge-special-border)',
                              color: isPositive
                                ? 'var(--color-success-text)'
                                : isExpired
                                ? 'var(--color-error-text)'
                                : 'var(--color-badge-special-text)',
                            }}
                          >
                            {isPositive ? (
                              <ArrowDownLeft size={16} weight="light" />
                            ) : isExpired ? (
                              <Clock size={16} weight="light" />
                            ) : isReferral ? (
                              <Gift size={16} weight="light" />
                            ) : (
                              <ArrowUpRight size={16} weight="light" />
                            )}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold truncate">
                              {isRedeemed
                                ? t('customer.typeRedeemed')
                                : isExpired
                                ? t('customer.typeExpired')
                                : isReferral
                                ? t('customer.typeReferral')
                                : t('customer.typeEarned')}
                            </span>
                            {tx.item_name && (
                              <span className="text-[11px] opacity-75 truncate" style={{ color: 'var(--color-accent)' }}>
                                {t('customer.redeemedItem', { item: tx.item_name })}
                              </span>
                            )}
                            <span className="text-[10px] opacity-55 font-mono">
                              {new Date(tx.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {tx.branch_name && (
                              <span className="text-[10px] opacity-50 truncate">
                                {tx.branch_name}
                              </span>
                            )}
                            {tx.type === 'earned' && tx.expires_at && (
                              <span
                                className="text-[10px] font-medium"
                                style={{ color: new Date(tx.expires_at) < new Date() ? 'var(--color-error-text)' : 'var(--color-warning-text)' }}
                              >
                                {t('customer.expiresOn', {
                                  date: new Date(tx.expires_at).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  }),
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="shrink-0 font-bold font-mono text-xs px-2.5 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: isPositive ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                            borderColor: isPositive ? 'var(--color-success-border)' : 'var(--color-error-border)',
                            color: isPositive ? 'var(--color-success-text)' : 'var(--color-error-text)',
                          }}
                        >
                          {isPositive ? `+${tx.points_change}` : `${tx.points_change}`}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
                {isLoadingOffers ? (
                  <div className="py-8 flex flex-col items-center justify-center opacity-70">
                    <ArrowsClockwise size={24} weight="light" className="animate-spin mb-2" />
                    <span className="text-xs">{t('customer.loadingOffers')}</span>
                  </div>
                ) : offersList.length === 0 ? (
                  <div className="py-8 text-center opacity-60 flex flex-col items-center">
                    <Tag size={32} weight="light" className="mb-2 opacity-40" />
                    <p className="text-xs font-medium">
                      {activeModal === 'special' 
                        ? t('customer.noSpecialOffers') 
                        : t('customer.noDailyOffers')}
                    </p>
                  </div>
                ) : (
                  offersList.map((offer) => (
                    <div 
                      key={offer.id}
                      className="p-4 rounded-2xl border flex flex-col gap-1.5 transition-all overflow-hidden"
                      style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)' }}
                    >
                      {offer.image_url ? (
                        <div className="w-full h-32 rounded-xl overflow-hidden mb-1.5 relative border" style={{ borderColor: 'var(--color-border)' }}>
                          <img 
                            src={offer.image_url} 
                            alt={offer.title} 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div 
                          className="w-full h-16 rounded-xl mb-1 flex items-center justify-center border border-dashed"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                            <Tag size={16} weight="light" />
                            <span>{offer.type === 'special' ? t('customer.specialBadge') : t('customer.dailyBadge')}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>
                          {offer.title}
                        </h4>
                        <span className="text-[10px] opacity-60 font-mono">
                          {t('customer.until', { date: offer.end_date })}
                        </span>
                      </div>
                      <p className="text-xs opacity-85 leading-relaxed">
                        {offer.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t text-center" style={{ borderColor: 'var(--color-separator)' }}>
              <button
                onClick={() => setActiveModal(null)}
                className="ios-btn-primary w-full"
              >
                {t('customer.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div
          className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-2xl border glass-card"
          style={{
            maxWidth: '400px',
            margin: '0 auto',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📲</span>
            <div>
              <p className="text-xs font-bold">{isRtl ? 'أضف للشاشة الرئيسية' : 'Add to Home Screen'}</p>
              <p className="text-[11px] opacity-60">{isRtl ? 'وصول أسرع لنقاطك' : 'Quick access to your points'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallApp}
              id="pwa-install-btn"
              className="ios-btn-primary py-1.5 px-3 text-xs"
            >
              {isRtl ? 'تثبيت' : 'Install'}
            </button>
            <button
              onClick={dismissInstallBanner}
              id="pwa-dismiss-btn"
              className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-all"
            >
              <X size={16} weight="light" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
