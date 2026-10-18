'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, EnvelopeSimple, ArrowRight, QrCode, WarningCircle, CircleNotch, Storefront } from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie } from '@/lib/cookies';
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
      setClientRoleCookie('cashier');

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
            className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors active:scale-95 cursor-pointer"
          >
            <ArrowRight size={16} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[2px] bg-[var(--color-accent)]" />
            <span className="text-[10px] font-mono font-semibold tracking-wider uppercase text-[var(--color-text-secondary)]">Cashier Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-[8px] p-6 sm:p-7 border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-2xl transition-all">
          <div className="text-center mb-6 flex flex-col items-center">
            <div
              className="w-12 h-12 mb-3 rounded-[4px] border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-accent)] text-white shadow-sm"
            >
              <QrCode size={26} weight="light" />
            </div>
            <h1 className="text-xl font-light tracking-tight text-[var(--color-text)]">
              {t('cashierLogin.title')}
            </h1>
            <p className="text-xs font-mono opacity-60 mt-1">
              {t('cashierLogin.subtitle')}
            </p>
          </div>

          {errorMsg && (
            <div
              className="mb-4 p-3 rounded-[4px] border border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error-text)] text-xs font-mono flex items-center gap-2"
            >
              <WarningCircle size={16} weight="light" className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 opacity-75" htmlFor="cashier-email-input">
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
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                />
                <EnvelopeSimple size={16} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 opacity-75" htmlFor="cashier-password-input">
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
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                />
                <Lock size={16} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <button
              type="submit"
              id="cashier-login-btn"
              disabled={isLoading}
              className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider transition-all active:scale-[0.99] disabled:opacity-40 bg-[var(--color-accent)] text-white hover:brightness-110 flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <CircleNotch size={16} weight="light" className="animate-spin" />
                  <span>{t('cashierLogin.signingIn')}</span>
                </>
              ) : (
                <>
                  <Storefront size={16} weight="light" />
                  <span>{t('cashierLogin.signIn')}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <footer className="text-center text-[10px] font-mono uppercase tracking-wider py-4 flex items-center justify-center gap-1.5 opacity-40">
          <Storefront size={13} weight="light" />
          <span>Pointat Cashier Station</span>
        </footer>
      </div>
    </main>
  );
}
