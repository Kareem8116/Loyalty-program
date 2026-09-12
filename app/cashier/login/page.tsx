'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, EnvelopeSimple, ArrowRight, QrCode, WarningCircle, CircleNotch, Storefront } from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/components/LocaleProvider';

export default function CashierLoginPage() {
  const router = useRouter();
  const { t, isRtl } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error || !data.user) {
        throw new Error(error?.message || t('cashierLogin.loginFailed'));
      }

      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, business_id, branch_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (roleError) {
        throw new Error(t('admin.roleError'));
      }

      if (!userRole || userRole.role !== 'cashier') {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب ليس لديه صلاحية كاشير.');
      }

      if (userRole.business_id) localStorage.setItem('cashier_business_id', userRole.business_id);
      if (userRole.branch_id) localStorage.setItem('cashier_branch_id', userRole.branch_id);
      localStorage.setItem('cashier_role', userRole.role);

      router.push('/cashier');
    } catch (err: any) {
      setErrorMsg(err.message || t('cashierLogin.loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-sm relative z-10 my-auto">
        {/* Navigation Bar */}
        <div className="flex justify-between items-center mb-6">
          <Link 
            href="/" 
            className="w-10 h-10 rounded-full flex items-center justify-center border transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <ArrowRight size={18} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
            <span className="text-xs font-semibold tracking-wider uppercase opacity-75">Cashier Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6 sm:p-7 transition-all">
          <div className="text-center mb-6 flex flex-col items-center">
            <div
              className="w-16 h-16 mb-3 rounded-2xl flex items-center justify-center shadow-md transition-transform"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
              }}
            >
              <QrCode size={32} weight="light" />
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {t('cashierLogin.title')}
            </h1>
            <p className="text-xs mt-1 opacity-60">
              {t('cashierLogin.subtitle')}
            </p>
          </div>

          {errorMsg && (
            <div
              className="mb-4 p-3 rounded-xl border text-xs flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <WarningCircle size={18} weight="light" className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="cashier-email-input">
                {t('cashierLogin.email')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="email"
                  id="cashier-email-input"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cashier@example.com"
                  className="ios-input"
                />
                <EnvelopeSimple size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="cashier-password-input">
                {t('cashierLogin.password')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="password"
                  id="cashier-password-input"
                  dir="ltr"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ios-input"
                />
                <Lock size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <button
              type="submit"
              id="cashier-login-btn"
              disabled={isLoading}
              className="ios-btn-primary w-full mt-2"
            >
              {isLoading ? (
                <>
                  <CircleNotch size={18} weight="light" className="animate-spin" />
                  <span>{t('cashierLogin.signingIn')}</span>
                </>
              ) : (
                <>
                  <Storefront size={18} weight="light" />
                  <span>{t('cashierLogin.signIn')}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] py-4 flex items-center justify-center gap-1.5 opacity-40">
          <Storefront size={14} weight="light" />
          <span>Pointat Cashier Station</span>
        </footer>
      </div>
    </main>
  );
}
