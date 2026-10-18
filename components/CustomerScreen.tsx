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
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden page-bg"
      data-layout-variant={layoutVariant}
    >
      {/* Ameba Atmospheric Background Glow */}
      <div 
        style={{
          position: 'absolute',
          width: '640px',
          height: '640px',
          background: 'radial-gradient(circle, rgba(4, 40, 203, 0.18) 0%, rgba(6, 16, 90, 0.06) 50%, transparent 70%)',
          top: '-120px',
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }} 
      />

      {/* Mobile-First Container (~375px - 414px) */}
      <div className={`w-full max-w-sm flex flex-col flex-1 ${layoutVariant === 'qr-top' ? 'justify-start gap-4' : 'justify-between'} py-2 relative z-10`}>
        
        {/* =========================================================================
            1. TOP BAR:
               - Account button (8px radius)
               - My Places button (8px radius, font-mono)
               - Business display name (font-mono, tracking)
               - Language & Theme toggles (8px radius)
           ========================================================================= */}
        <header className="flex items-center justify-between w-full pt-2 pb-4">
          <div className="flex items-center gap-2">
            <Link
              href={`/account?token=${customer.qr_token}`}
              id="account-btn"
              aria-label={t('customer.userAccount')}
              className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-all active:scale-95 border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)]"
            >
              <User size={18} weight="light" />
            </Link>

            <Link
              href="/my-places"
              id="customer-my-places-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] transition-all active:scale-95"
            >
              {isRtl ? <ArrowRight size={13} weight="light" /> : <ArrowLeft size={13} weight="light" />}
              <span className="hidden sm:inline">{t('customer.myPlacesBtn')}</span>
            </Link>
          </div>

          <div className="text-center">
            <span 
              className="text-xs font-mono uppercase tracking-[0.08em] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] block font-medium"
              id="customer-screen-business-name"
            >
              {businessDisplayName}
            </span>
            <span className="text-sm font-normal opacity-90 text-[var(--color-text)]">
              {t('customer.greeting', { name: customer.name })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* =========================================================================
            2. MIDDLE: Ameba Floating Product Card (8px radius, hairline border, no drop shadow)
           ========================================================================= */}
        <main className="flex flex-col items-center my-auto py-4">
          {/* Card Container: 8px radius, hairline border, flat surface */}
          <div 
            className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 flex flex-col items-center transition-all"
          >
            {/* Format Toggle: QR Code vs Barcode (4-6px radii, font-mono) */}
            <div 
              className="flex items-center gap-1 p-1 rounded-[6px] mb-4 border border-[var(--color-border)] bg-[var(--color-input-bg)]"
            >
              <button
                type="button"
                id="toggle-qr-mode"
                onClick={() => handleFormatChange('qr')}
                className={`py-1.5 px-3 rounded-[4px] text-xs font-mono uppercase tracking-[0.05em] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  codeFormat === 'qr' 
                    ? 'bg-[var(--color-signal-blue)] text-white font-medium' 
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <QrCode size={14} weight="light" className="shrink-0" />
                <span>{t('customer.qrCodeTab')}</span>
              </button>

              <button
                type="button"
                id="toggle-barcode-mode"
                onClick={() => handleFormatChange('barcode')}
                className={`py-1.5 px-3 rounded-[4px] text-xs font-mono uppercase tracking-[0.05em] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  codeFormat === 'barcode' 
                    ? 'bg-[var(--color-signal-blue)] text-white font-medium' 
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <Barcode size={14} weight="light" className="shrink-0" />
                <span>{t('customer.barcodeTab')}</span>
              </button>
            </div>

            {/* Code Display Container: 6px radius, hairline border, pure white paper fill */}
            {codeFormat === 'qr' ? (
              <div 
                className="p-3.5 rounded-[6px] border border-[var(--color-border)] flex items-center justify-center bg-white"
              >
                <QRCodeSVG
                  value={scanUrl || customer.qr_token}
                  size={220}
                  level="L"
                  includeMargin={true}
                  fgColor="#00052e"
                  bgColor="#FFFFFF"
                />
              </div>
            ) : (
              <div 
                className="p-3.5 rounded-[6px] border border-[var(--color-border)] flex flex-col items-center justify-center bg-white w-full overflow-hidden"
              >
                <svg ref={barcodeRef} className="max-w-full h-auto" />
              </div>
            )}

            {/* Formatted Quick Code with 1-Tap Copy: 4px radius, IBM Plex Mono with wide tracking */}
            <div className="flex flex-col items-center gap-1.5 mt-4" dir="ltr">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)]">
                <span className="w-2 h-2 rounded-full bg-[var(--color-signal-blue)] dark:bg-[var(--color-arc-cyan)] shrink-0" />
                <span className="font-mono font-medium tracking-[0.18em] text-sm text-[var(--color-text)]" id="customer-short-code">
                  {formattedCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1 rounded-[4px] opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
                  title={t('customer.copyCode')}
                >
                  {copiedCode ? (
                    <Check size={14} weight="light" className="text-emerald-400" />
                  ) : (
                    <Copy size={14} weight="light" />
                  )}
                </button>
              </div>
              <span className="text-[11px] font-mono uppercase tracking-[0.05em] text-[var(--color-text-muted)] text-center">
                {t('customer.scanPrompt')}
              </span>
            </div>

            {/* Points Count: Ameba Editorial Display — Inter weight 300, negative tracking */}
            <div className="mt-5 text-center w-full pt-4 border-t border-[var(--color-separator)]">
              {/* Membership Tier Badge: 4px radius, font-mono */}
              {customer.tier?.currentTier && (
                <div className="flex items-center justify-center mb-2.5">
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[11px] font-mono uppercase tracking-[0.08em] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] font-medium"
                    id="customer-tier-badge"
                  >
                    <Medal size={14} weight="light" className="shrink-0" />
                    <span>{customer.tier.currentTier.name}</span>
                  </div>
                </div>
              )}

              <span className="text-[11px] font-mono uppercase tracking-[0.083em] text-[var(--color-text-muted)] block mb-1">
                {t('customer.pointsLabel')}
              </span>
              <div className="flex items-baseline justify-center gap-2">
                <span 
                  className="text-5xl sm:text-6xl font-light tracking-[-1.12px] leading-tight text-[var(--color-text)]"
                  id="customer-points-balance"
                >
                  {customer.points_balance.toLocaleString()}
                </span>
                <span className="text-xs font-mono uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  {t('customer.pointsUnit')}
                </span>
              </div>

              {/* Points monetary value: shows how much the balance is worth in currency */}
              {customer.rates && customer.points_balance > 0 && (
                <div
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[11px] font-mono border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-muted)]"
                  id="customer-points-value"
                >
                  <span>≈</span>
                  <span className="font-mono font-medium text-[var(--color-text)]">
                    {(customer.points_balance * customer.rates.currency_per_point).toFixed(2)}
                  </span>
                  <span>{t('common.currencyUnit')}</span>
                </div>
              )}

              {/* Earn rate hint */}
              {customer.rates && (
                <div
                  className="mt-1.5 text-[11px] font-mono text-[var(--color-text-muted)]"
                  id="customer-earn-rate-hint"
                >
                  {isRtl
                    ? `كل ${(1 / customer.rates.points_per_currency_unit).toFixed(0)} ${t('common.currencyUnit')} = نقطة`
                    : `${(1 / customer.rates.points_per_currency_unit).toFixed(0)} ${t('common.currencyUnit')} = 1 pt`
                  }
                </div>
              )}

              {/* Progress towards next tier: hairline bar */}
              {customer.tier?.nextTier && (
                <div className="mt-3.5 pt-3 border-t border-[var(--color-border)] px-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--color-text-muted)] mb-1.5">
                    <span>
                      {t('customer.nextTierProgress', { 
                        points: customer.tier.pointsToNextTier, 
                        tier: customer.tier.nextTier.name 
                      })}
                    </span>
                    <span className="font-medium text-[var(--color-text)]">{customer.tier.progressPercent}%</span>
                  </div>
                  <div 
                    className="w-full h-1 rounded-[2px] overflow-hidden bg-[var(--color-border)]" 
                  >
                    <div
                      className="h-full rounded-[2px] transition-all duration-500 bg-[var(--color-signal-blue)]"
                      style={{
                        width: `${customer.tier.progressPercent}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Notice for expiring points within 30 days: 4px radius, IBM Plex Mono */}
              {Boolean(customer.expiring_points_30d && customer.expiring_points_30d > 0) && (
                <div 
                  className="mt-3.5 w-full p-2.5 rounded-[4px] border border-red-500/30 bg-red-500/10 text-red-400 flex items-center justify-center gap-2 text-xs font-mono text-center"
                  id="expiring-points-alert"
                >
                  <Clock size={14} weight="light" className="shrink-0" />
                  <span>{t('customer.expiringAlert', { points: customer.expiring_points_30d || 0 })}</span>
                </div>
              )}

              {/* AI Recommendation Banner: 6px radius, hairline border */}
              {aiRecommendation && (
                <div 
                  className="mt-3.5 w-full p-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-start gap-2.5 text-xs text-center justify-center transition-all"
                  id="ai-recommendation-banner"
                >
                  <Sparkle size={15} weight="light" className="shrink-0 mt-0.5 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                  <p className="leading-relaxed font-normal text-[var(--color-text)]">{aiRecommendation}</p>
                </div>
              )}

              {/* Quick View Transaction History Button: 6px radius, font-mono */}
              <div className="mt-4 flex justify-center">
                <button
                  id="view-history-card-btn"
                  onClick={openHistoryModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-mono uppercase tracking-[0.05em] transition-all active:scale-95 border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] cursor-pointer"
                >
                  <ClockCounterClockwise size={14} weight="light" />
                  <span>{t('customer.viewHistory')}</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* =========================================================================
            3. FOOTER ACTIONS: 8px radius, hairline borders, font-mono uppercase
           ========================================================================= */}
        <footer className="w-full pt-3 pb-2">
          <div className={`flex items-center gap-2 ${layoutVariant === 'horizontal-offers' ? 'overflow-x-auto pb-1 no-scrollbar' : ''}`} id="customer-screen-footer-actions">
            {/* Special Offers */}
            {customer.features?.offers !== false && (
              <button
                id="special-offers-btn"
                onClick={() => openOffersModal('special')}
                className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] transition-all active:scale-95 font-mono text-xs uppercase tracking-[0.05em] cursor-pointer"
              >
                <Sparkle size={15} weight="light" className="shrink-0 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                <span className="truncate">{t('customer.specialOffers')}</span>
              </button>
            )}

            {/* Daily Offers */}
            {customer.features?.daily_offers !== false && (
              <button
                id="daily-offers-btn"
                onClick={() => openOffersModal('daily')}
                className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] transition-all active:scale-95 font-mono text-xs uppercase tracking-[0.05em] cursor-pointer"
              >
                <Calendar size={15} weight="light" className="shrink-0 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                <span className="truncate">{t('customer.dailyOffers')}</span>
              </button>
            )}

            {/* Transaction History */}
            <button
              id="history-btn"
              onClick={openHistoryModal}
              className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] transition-all active:scale-95 font-mono text-xs uppercase tracking-[0.05em] cursor-pointer"
            >
              <ClockCounterClockwise size={15} weight="light" className="shrink-0 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
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
            className="w-full max-w-sm rounded-[8px] p-6 border border-[var(--color-border)] bg-[var(--color-card-bg)] animate-in slide-in-from-bottom-2 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--color-separator)] mb-4">
              <div className="flex items-center gap-2">
                {activeModal === 'special' ? (
                  <Sparkle size={18} weight="light" className="text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                ) : activeModal === 'daily' ? (
                  <Calendar size={18} weight="light" className="text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                ) : (
                  <ClockCounterClockwise size={18} weight="light" className="text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                )}
                <h3 className="text-sm font-medium text-[var(--color-text)]">
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
                className="w-7 h-7 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] hover:border-[var(--color-signal-blue)] text-[var(--color-text)] transition-colors cursor-pointer"
              >
                <X size={15} weight="light" />
              </button>
            </div>

            {/* Modal Content */}
            {activeModal === 'history' ? (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto" id="transactions-list-container">
                {isLoadingHistory ? (
                  <div className="py-8 flex flex-col items-center justify-center opacity-70">
                    <ArrowsClockwise size={22} weight="light" className="animate-spin mb-2" />
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">{t('customer.loadingHistory')}</span>
                  </div>
                ) : transactionsList.length === 0 ? (
                  <div className="py-8 text-center opacity-60 flex flex-col items-center" id="empty-transactions-message">
                    <ClockCounterClockwise size={28} weight="light" className="mb-2 opacity-40" />
                    <p className="text-xs font-mono text-[var(--color-text-muted)]">
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
                        className="p-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-between gap-3 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-7 h-7 rounded-[4px] flex items-center justify-center shrink-0 border"
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
                              <ArrowDownLeft size={14} weight="light" />
                            ) : isExpired ? (
                              <Clock size={14} weight="light" />
                            ) : isReferral ? (
                              <Gift size={14} weight="light" />
                            ) : (
                              <ArrowUpRight size={14} weight="light" />
                            )}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium truncate text-[var(--color-text)]">
                              {isRedeemed
                                ? t('customer.typeRedeemed')
                                : isExpired
                                ? t('customer.typeExpired')
                                : isReferral
                                ? t('customer.typeReferral')
                                : t('customer.typeEarned')}
                            </span>
                            {tx.item_name && (
                              <span className="text-[11px] font-mono truncate text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]">
                                {t('customer.redeemedItem', { item: tx.item_name })}
                              </span>
                            )}
                            <span className="text-[10px] opacity-60 font-mono text-[var(--color-text-muted)]">
                              {new Date(tx.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {tx.branch_name && (
                              <span className="text-[10px] opacity-50 truncate font-mono text-[var(--color-text-muted)]">
                                {tx.branch_name}
                              </span>
                            )}
                            {tx.type === 'earned' && tx.expires_at && (
                              <span
                                className="text-[10px] font-mono"
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
                          className="shrink-0 font-medium font-mono text-xs px-2 py-0.5 rounded-[4px] border"
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
              <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto">
                {isLoadingOffers ? (
                  <div className="py-8 flex flex-col items-center justify-center opacity-70">
                    <ArrowsClockwise size={22} weight="light" className="animate-spin mb-2" />
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">{t('customer.loadingOffers')}</span>
                  </div>
                ) : offersList.length === 0 ? (
                  <div className="py-8 text-center opacity-60 flex flex-col items-center">
                    <Tag size={28} weight="light" className="mb-2 opacity-40" />
                    <p className="text-xs font-mono text-[var(--color-text-muted)]">
                      {activeModal === 'special' 
                        ? t('customer.noSpecialOffers') 
                        : t('customer.noDailyOffers')}
                    </p>
                  </div>
                ) : (
                  offersList.map((offer) => (
                    <div 
                      key={offer.id}
                      className="p-3.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex flex-col gap-1.5 transition-all overflow-hidden"
                    >
                      {offer.image_url ? (
                        <div className="w-full h-32 rounded-[4px] overflow-hidden mb-1 relative border border-[var(--color-border)]">
                          <img 
                            src={offer.image_url} 
                            alt={offer.title} 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div 
                          className="w-full h-14 rounded-[4px] mb-1 flex items-center justify-center border border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)]"
                        >
                          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.05em] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]">
                            <Tag size={14} weight="light" />
                            <span>{offer.type === 'special' ? t('customer.specialBadge') : t('customer.dailyBadge')}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-[var(--color-text)]">
                          {offer.title}
                        </h4>
                        <span className="text-[10px] opacity-60 font-mono text-[var(--color-text-muted)]">
                          {t('customer.until', { date: offer.end_date })}
                        </span>
                      </div>
                      <p className="text-xs opacity-80 leading-relaxed text-[var(--color-text)]">
                        {offer.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-[var(--color-separator)] text-center">
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
          className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 px-4 py-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)]"
          style={{
            maxWidth: '400px',
            margin: '0 auto',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📲</span>
            <div>
              <p className="text-xs font-mono font-medium text-[var(--color-text)]">{isRtl ? 'أضف للشاشة الرئيسية' : 'Add to Home Screen'}</p>
              <p className="text-[11px] font-mono text-[var(--color-text-muted)]">{isRtl ? 'وصول أسرع لنقاطك' : 'Quick access to your points'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <button
              onClick={handleInstallApp}
              id="pwa-install-btn"
              className="h-8 px-3 rounded-[8px] text-xs uppercase font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 transition-opacity"
            >
              {isRtl ? 'تثبيت' : 'Install'}
            </button>
            <button
              onClick={dismissInstallBanner}
              id="pwa-dismiss-btn"
              className="w-7 h-7 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              <X size={14} weight="light" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
