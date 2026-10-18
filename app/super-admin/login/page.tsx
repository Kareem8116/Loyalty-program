'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, EnvelopeSimple, ArrowRight, ArrowLeft, ShieldWarning, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie } from '@/lib/cookies';
import { useLocale } from '@/components/LocaleProvider';

export default function SuperAdminLoginPage() {
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
        throw new Error(error?.message || t('common.error'));
      }

      // Phase 29: Mandatory OTP Email Verification Guard
      const isEmailVerified = data.user.user_metadata?.email_verified === true || (Boolean(data.user.email_confirmed_at) && data.user.user_metadata?.email_verified !== false);
      if (!isEmailVerified) {
        await supabase.auth.signOut();
        fetch('/api/auth/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&role=super_admin&pending=1`);
        return;
      }

      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (roleError) {
        throw new Error(t('common.error'));
      }

      // COMPLETE ISOLATION: Super Admin portal is strictly for super_admin
      if (!userRole || userRole.role !== 'super_admin') {
        await supabase.auth.signOut();
        if (userRole?.role === 'cashier') {
          throw new Error('هذا الحساب كاشير. بوابة Super Admin مقيدة ومخصصة للإدارة المركزية فقط.');
        } else if (userRole?.role === 'owner' || userRole?.role === 'branch_admin') {
          throw new Error('هذا الحساب مدير متجر. يرجى استخدام بوابة المدير المخصصة لك.');
        } else {
          throw new Error(t('superAdmin.noPermission') || 'هذا الحساب ليس لديه صلاحية Super Admin.');
        }
      }

      setClientRoleCookie('super_admin');
      router.push('/super-admin');
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden"
    >
      {/* Ambient Ameba Control Room Glow */}
      <div 
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-40 dark:opacity-75 z-0"
        style={{
          background: 'radial-gradient(circle at 50% 20%, rgba(4, 40, 203, 0.22) 0%, rgba(52, 252, 255, 0.05) 35%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10 my-auto">
        {/* Header */}
        <header className="flex items-center justify-between w-full pb-4">
          <Link
            href="/"
            aria-label={t('common.home')}
            className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] transition-transform active:scale-95"
          >
            <ArrowRight weight="light" className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-arc-cyan)' }} />
            <span className="text-[10px] font-mono font-medium tracking-wider uppercase text-[var(--color-text-muted)]">Platform Command</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Login Card */}
        <div
          className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 sm:p-7 my-auto flex flex-col gap-5 transition-colors"
        >
          <div className="text-center flex flex-col items-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[10px] font-mono font-medium tracking-wider uppercase mb-3.5 border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
            >
              <ShieldWarning weight="light" className="w-3.5 h-3.5" />
              <span>الإدارة المركزية • Super Admin</span>
            </div>

            <div
              className="w-12 h-12 mb-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] transition-transform"
            >
              <ShieldWarning weight="light" className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-light mb-1 tracking-tight text-[var(--color-text)]">{t('superAdmin.loginTitle')}</h1>
            <p className="text-xs max-w-xs leading-relaxed text-[var(--color-text-muted)]">
              {t('superAdmin.loginSubtitle')}
            </p>
          </div>

          {errorMsg && (
            <div
              className="p-3 rounded-[4px] border text-xs font-mono flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]">{t('superAdmin.email')}</label>
              <div className="relative">
                <input
                  type="email"
                  id="superadmin-email-input"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@example.com"
                  className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                />
                <EnvelopeSimple weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]">{t('superAdmin.password')}</label>
              <div className="relative">
                <input
                  type="password"
                  id="superadmin-password-input"
                  dir="ltr"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                />
                <Lock weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <div className="flex justify-between items-center text-[11px] font-mono pt-1">
              <span className="text-[10px] text-[var(--color-text-muted)] uppercase">AUTH: RESTRICTED_ROOT</span>
              <Link
                href="/forgot-password"
                id="superadmin-forgot-password-link"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                {t('superAdmin.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              id="superadmin-login-btn"
              disabled={isLoading}
              className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity"
            >
              {isLoading ? <CircleNotch weight="light" className="w-4 h-4 animate-spin" /> : <ShieldWarning weight="light" className="w-4 h-4" />}
              <span>{isLoading ? t('superAdmin.signingIn') : t('superAdmin.signIn')}</span>
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] font-mono py-3 flex items-center justify-center gap-1.5 text-[var(--color-text-muted)]">
          <Lock weight="light" className="w-3.5 h-3.5" />
          <span>{t('superAdmin.footer') || 'منطقة سيادية • جميع العمليات مراقبة ومسجلة أمنياً'}</span>
        </footer>
      </div>
    </main>
  );
}
