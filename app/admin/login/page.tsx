'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, EnvelopeSimple, ArrowRight, Buildings, ChartBar, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/components/LocaleProvider';

export default function AdminLoginPage() {
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
        if (error?.message?.toLowerCase().includes('email not confirmed')) {
          fetch('/api/auth/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim().toLowerCase() }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&role=owner&pending=1`);
          return;
        }
        throw new Error(error?.message || t('admin.loginFailed'));
      }

      // Mandatory OTP Email Verification Guard
      const isEmailVerified = data.user.user_metadata?.email_verified === true || (Boolean(data.user.email_confirmed_at) && data.user.user_metadata?.email_verified !== false);
      if (!isEmailVerified) {
        await supabase.auth.signOut();
        fetch('/api/auth/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&role=owner&pending=1`);
        return;
      }

      // Check user role in user_roles
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, business_id, branch_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (roleError) {
        throw new Error(t('admin.roleError'));
      }

      const allowedAdminRoles = ['owner', 'branch_admin'];
      if (!userRole || !allowedAdminRoles.includes(userRole.role)) {
        await supabase.auth.signOut();
        if (userRole?.role === 'cashier') {
          throw new Error('هذا الحساب كاشير. صفحة المدير مخصصة لمدراء المتاجر فقط، ولا يمكن للكاشير الدخول إليها.');
        } else if (userRole?.role === 'super_admin') {
          throw new Error('هذا الحساب سوبر أدمن. يرجى الدخول من بوابة Super Admin المخصصة لك.');
        } else {
          throw new Error('هذا الحساب ليس لديه صلاحية مدير متجر. صفحة المدير مخصصة للمدراء فقط.');
        }
      }

      if (userRole.business_id) {
        localStorage.setItem('admin_business_id', userRole.business_id);
      }
      localStorage.setItem('admin_role', userRole.role);

      router.push('/admin');
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10 my-auto">
        {/* Header */}
        <header className="flex items-center justify-between w-full pb-4">
          <Link
            href="/"
            aria-label={t('common.home')}
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
            <span className="text-xs font-semibold tracking-wider uppercase opacity-75">Merchant Suite</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Login Card */}
        <div className="glass-card p-6 sm:p-7 my-auto flex flex-col gap-5 transition-all">
          <div className="text-center flex flex-col items-center">
            {/* Icon */}
            <div
              className="w-16 h-16 mb-3 rounded-2xl flex items-center justify-center shadow-md transition-transform"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
              }}
            >
              <ChartBar size={32} weight="light" />
            </div>

            <h1 className="text-xl font-bold mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>
              {t('admin.loginTitle')}
            </h1>
            <p className="text-xs max-w-xs leading-relaxed opacity-60">
              {t('admin.loginSubtitle')}
            </p>
          </div>

          {errorMsg && (
            <div
              className="p-3 rounded-xl border text-xs flex items-center gap-2"
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

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="admin-email-input">
                {t('admin.email')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="email"
                  id="admin-email-input"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="ios-input"
                />
                <EnvelopeSimple size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="admin-password-input">
                {t('admin.password')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="password"
                  id="admin-password-input"
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

            <div className="flex justify-between items-center text-[11px] pt-1">
              <span className="font-mono text-[10px] opacity-60 uppercase">Owner / Manager</span>
              <Link
                href="/forgot-password"
                id="admin-forgot-password-link"
                className="font-semibold transition-opacity hover:opacity-80"
                style={{ color: 'var(--color-text)' }}
              >
                {t('admin.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              id="admin-login-btn"
              disabled={isLoading}
              className="ios-btn-primary w-full mt-2"
            >
              {isLoading ? (
                <>
                  <CircleNotch size={18} weight="light" className="animate-spin" />
                  <span>{t('admin.signingIn')}</span>
                </>
              ) : (
                <>
                  <Buildings size={18} weight="light" />
                  <span>{t('admin.signIn')}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] py-3 flex items-center justify-center gap-1.5 opacity-40">
          <Buildings size={14} weight="light" />
          <span>{t('admin.footer')}</span>
        </footer>
      </div>
    </main>
  );
}
