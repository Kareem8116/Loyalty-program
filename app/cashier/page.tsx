'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, ArrowLeft, ShieldWarning, SignOut, CircleNotch, 
  User, Trash, Warning, X, WarningCircle, Keyboard 
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import QrScanner from '@/components/QrScanner';
import CashierControl from '@/components/CashierControl';
import OfflineSyncBanner from '@/components/OfflineSyncBanner';
import ProfileModal from '@/components/ProfileModal';
import { useLocale } from '@/components/LocaleProvider';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie, clearClientRoleCookie } from '@/lib/cookies';

export default function CashierPage() {
  const router = useRouter();
  const { t, isRtl } = useLocale();
  const [customer, setCustomer] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);

  // Phase 25: External barcode/QR reader (USB/Bluetooth HID keyboard mode)
  const [externalInput, setExternalInput] = useState('');
  const externalInputRef = useRef<HTMLInputElement>(null);

  // Cashier Profile & Account Deletion state
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [cashierEmail, setCashierEmail] = useState('');
  const [showCashierProfile, setShowCashierProfile] = useState(false);
  const [showCashierDeleteConfirm, setShowCashierDeleteConfirm] = useState(false);
  const [isDeletingCashier, setIsDeletingCashier] = useState(false);
  const [deleteCashierError, setDeleteCashierError] = useState<string | null>(null);

  // Check auth session and cashier role on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/cashier/login');
          return;
        }

        const { data: userRole } = await supabase
          .from('user_roles')
          .select('role, business_id, branch_id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // COMPLETE ISOLATION: Cashier screen is STRICTLY for Cashiers
        if (!userRole || userRole.role !== 'cashier') {
          // Non-destructive: Preserve existing user session and redirect safely
          router.replace('/cashier/login');
          return;
        }

        setClientRoleCookie('cashier');
        setJwtToken(session.access_token);
        setCashierEmail(session.user.email || '');
      } catch (err) {
        console.error('Cashier auth check error:', err);
      } finally {
        setIsVerifyingSession(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleDeleteCashierAccount = async () => {
    setIsDeletingCashier(true);
    setDeleteCashierError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('accountDeletion.deleteError'));
      }

      await supabase.auth.signOut();
      localStorage.removeItem('cashier_business_id');
      localStorage.removeItem('cashier_branch_id');
      localStorage.removeItem('cashier_role');
      localStorage.removeItem('admin_business_id');
      localStorage.removeItem('admin_role');
      clearClientRoleCookie();
      router.replace('/cashier/login');
    } catch (err: any) {
      setDeleteCashierError(err.message || t('accountDeletion.deleteError'));
    } finally {
      setIsDeletingCashier(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('cashier_business_id');
      localStorage.removeItem('cashier_branch_id');
      localStorage.removeItem('cashier_role');
      localStorage.removeItem('admin_business_id');
      localStorage.removeItem('admin_role');
      clearClientRoleCookie();
    } finally {
      router.push('/cashier/login');
    }
  };

  const handleScanSuccess = async (token: string) => {
    setIsLoading(true);
    setScanError(null);

    try {
      // 4.2: Fetch customer details by token
      const res = await fetch(`/api/customer/${token}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.customer) {
        throw new Error(data.error || t('cashier.notFound'));
      }

      setCustomer(data.customer);
    } catch (err: any) {
      setScanError(err.message || t('cashier.scanError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setCustomer(null);
    setScanError(null);
    setExternalInput('');
    // Re-focus external input after reset for next scan
    setTimeout(() => externalInputRef.current?.focus(), 100);
  };

  // Phase 25: Handle external QR reader input (fires on Enter from HID device)
  const handleExternalScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = externalInput.trim();
    if (!token) return;
    setExternalInput('');
    await handleScanSuccess(token);
  };

  if (isVerifyingSession) {
    return (
      <main className="page-bg min-h-screen flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <CircleNotch weight="light" className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs opacity-70">{t('common.loading')}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden">
      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10">
        {/* Header */}
        <header className="page-header flex items-center justify-between w-full pb-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label={t('common.home')}
              className="w-10 h-10 rounded-full flex items-center justify-center glass-card transition-transform active:scale-95"
              style={{
                color: 'var(--color-text)',
              }}
            >
              {isRtl ? (
                <ArrowRight weight="light" className="w-5 h-5" />
              ) : (
                <ArrowLeft weight="light" className="w-5 h-5" />
              )}
            </Link>

            <button
              onClick={() => {
                setShowCashierProfile(true);
                setShowCashierDeleteConfirm(false);
                setDeleteCashierError(null);
              }}
              id="cashier-profile-btn"
              title={t('accountDeletion.profileTitle')}
              aria-label={t('accountDeletion.profileTitle')}
              className="w-10 h-10 rounded-full flex items-center justify-center glass-card transition-transform active:scale-95 cursor-pointer"
              style={{
                color: 'var(--color-text)',
              }}
            >
              <User weight="light" className="w-4 h-4" />
            </button>

            <button
              onClick={handleLogout}
              id="cashier-logout-btn"
              title={t('cashierLogin.logout')}
              aria-label={t('cashierLogin.logout')}
              className="w-10 h-10 rounded-full flex items-center justify-center glass-card transition-transform active:scale-95 cursor-pointer text-rose-500"
            >
              <SignOut weight="light" className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center">
            <span 
              className="text-xs font-semibold uppercase tracking-wider block"
              style={{ color: 'var(--color-accent)' }}
            >
              {t('cashier.title')}
            </span>
            <span className="text-sm font-bold">
              {customer ? t('cashier.controlTitle') : t('cashier.scanPrompt')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 flex flex-col items-center justify-center my-auto py-6">
          {/* Phase 32: Offline Resilience Banner */}
          <OfflineSyncBanner />

          {scanError && (
            <div 
              className="w-full mb-4 p-3 rounded-2xl border-[0.5px] text-xs flex items-center gap-2 backdrop-blur-md"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <ShieldWarning weight="light" className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {!customer ? (
            <div className="w-full flex flex-col items-center gap-3">
              {/* Phase 25: External QR/Barcode reader input (USB/Bluetooth HID or manual code entry) */}
              <form
                onSubmit={handleExternalScan}
                className="w-full"
                id="external-reader-form"
              >
                <div
                  className="glass-card flex items-center gap-2 px-3 py-2.5 rounded-2xl"
                >
                  <Keyboard weight="light" className="w-4 h-4 shrink-0 opacity-40" />
                  <input
                    ref={externalInputRef}
                    id="external-qr-input"
                    type="text"
                    value={externalInput}
                    onChange={(e) => setExternalInput(e.target.value)}
                    placeholder={isRtl ? 'أدخل كود العميل أو امسح بالجهاز الخارجي...' : 'Enter customer code or scan with external device...'}
                    className="flex-1 bg-transparent text-xs focus:outline-hidden font-mono"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isLoading}
                  />
                  {externalInput && (
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="ios-btn-primary text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                    >
                      {isRtl ? 'بحث' : 'Go'}
                    </button>
                  )}
                </div>
              </form>
              <QrScanner onScan={handleScanSuccess} isLoading={isLoading} />
            </div>
          ) : (
            <CashierControl customer={customer} onReset={handleReset} />
          )}
        </div>

        {/* ──── CASHIER PROFILE MODAL WITH EDIT & OTP ──── */}
        <ProfileModal
          isOpen={showCashierProfile}
          onClose={() => {
            setShowCashierProfile(false);
            setShowCashierDeleteConfirm(false);
          }}
          jwtToken={jwtToken}
          initialData={{
            email: cashierEmail,
            role: 'cashier',
          }}
          onProfileUpdated={(updated) => {
            if (updated.email) setCashierEmail(updated.email);
          }}
          dangerZone={
            <div
              className="p-4 rounded-2xl border-[0.5px]"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
            >
              {deleteCashierError && (
                <div className="p-2.5 mb-3 rounded-xl border text-xs text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-2">
                  <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
                  <span>{deleteCashierError}</span>
                </div>
              )}

              {!showCashierDeleteConfirm ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5 text-rose-500">
                    <Warning weight="light" className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold">{t('accountDeletion.dangerZone')}</span>
                  </div>
                  <p className="text-[11px] opacity-75 mb-3 leading-relaxed">
                    {t('accountDeletion.confirmCashierDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCashierDeleteConfirm(true)}
                    id="cashier-open-delete-btn"
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    style={{ backgroundColor: '#EF4444' }}
                  >
                    <Trash weight="light" className="w-3.5 h-3.5" />
                    <span>{t('accountDeletion.deleteCashierAccount')}</span>
                  </button>
                </>
              ) : (
                <div className="text-center">
                  <div
                    className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
                  >
                    <Warning weight="light" className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-rose-500 mb-1">
                    {isRtl ? 'تأكيد الحذف النهائي' : 'Confirm Permanent Deletion'}
                  </h3>
                  <p className="text-[11px] opacity-75 mb-3 leading-relaxed">
                    {t('accountDeletion.confirmCashierDesc')}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCashierDeleteConfirm(false)}
                      disabled={isDeletingCashier}
                      className="flex-1 py-2 rounded-xl border-[0.5px] text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                    >
                      {t('accountDeletion.cancelButton')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteCashierAccount}
                      id="cashier-confirm-delete-btn"
                      disabled={isDeletingCashier}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: '#EF4444' }}
                    >
                      {isDeletingCashier ? (
                        <>
                          <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('accountDeletion.deleting')}</span>
                        </>
                      ) : (
                        <>
                          <Trash weight="light" className="w-3.5 h-3.5" />
                          <span>{t('accountDeletion.deleteButton')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Footer info */}
        <footer className="w-full pt-4 pb-2 text-center text-[11px] opacity-60">
          {t('cashier.ledgerNote')}
        </footer>
      </div>
    </main>
  );
}
