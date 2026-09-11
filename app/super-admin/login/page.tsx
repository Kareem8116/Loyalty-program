'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, ArrowRight, ShieldAlert, RefreshCw, AlertCircle } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
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

      router.push('/super-admin');
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden"
      style={{
        background: 'var(--page-bg-gradient)',
        color: 'var(--color-text)'
      }}
    >
      {/* Ambient Background Glows */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(108,99,255,0.09) 0%, transparent 70%)',
        top: '-200px',
        right: '-200px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%)',
        bottom: '-120px',
        left: '-120px',
        pointerEvents: 'none',
      }} />

      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between w-full pb-4">
          <Link
            href="/"
            aria-label={t('common.home')}
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm border transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-border)',
            }}
          >
            <ArrowRight className={`w-5 h-5 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#6C63FF' }} />
            <span className="text-xs font-mono font-bold tracking-wider uppercase" style={{ color: '#A5B4FC' }}>Platform Command</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Login Card */}
        <div
          className="rounded-3xl p-6 sm:p-7 border shadow-2xl my-auto flex flex-col gap-5 backdrop-blur-xl transition-colors"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-center flex flex-col items-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase mb-3.5 border"
              style={{
                backgroundColor: 'rgba(108, 99, 255, 0.12)',
                borderColor: 'rgba(108, 99, 255, 0.28)',
                color: '#A5B4FC',
              }}
            >
              <ShieldAlert className="w-3 h-3" style={{ color: '#A5B4FC' }} />
              <span>الإدارة المركزية • Super Admin Command</span>
            </div>

            <div
              className="w-16 h-16 mb-3 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6C63FF, #4ECDC4)',
                color: '#ffffff',
                boxShadow: '0 10px 25px rgba(108, 99, 255, 0.35)',
              }}
            >
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold mb-1 tracking-tight text-white">{t('superAdmin.loginTitle')}</h1>
            <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {t('superAdmin.loginSubtitle')}
            </p>
          </div>

          {errorMsg && (
            <div
              className="p-3 rounded-xl border text-xs flex items-center gap-2"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.12)',
                color: '#F87171',
                borderColor: 'rgba(248, 113, 113, 0.25)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('superAdmin.email')}</label>
              <div className="relative">
                <input
                  type="email"
                  id="superadmin-email-input"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@example.com"
                  className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all text-white ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                />
                <Mail className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'}`} style={{ color: 'rgba(108,99,255,0.6)' }} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{t('superAdmin.password')}</label>
              <div className="relative">
                <input
                  type="password"
                  id="superadmin-password-input"
                  dir="ltr"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all text-white ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                />
                <Lock className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'}`} style={{ color: 'rgba(108,99,255,0.6)' }} />
              </div>
            </div>

            <div className="flex justify-between items-center -mt-1 text-[11px]">
              <span className="font-mono text-[10px]" style={{ color: 'rgba(78,205,196,0.6)' }}>AUTH: RESTRICTED_ROOT</span>
              <Link
                href="/forgot-password"
                id="superadmin-forgot-password-link"
                className="font-semibold transition-colors"
                style={{ color: '#6C63FF' }}
              >
                {t('superAdmin.forgotPassword')}
              </Link>
            </div>

            <button
              type="submit"
              id="superadmin-login-btn"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl text-xs font-bold transition-all shadow-lg mt-2 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #4ECDC4 100%)',
                color: '#ffffff',
                boxShadow: '0 8px 25px rgba(108, 99, 255, 0.4)',
              }}
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              <span>{isLoading ? t('superAdmin.signingIn') : t('superAdmin.signIn')}</span>
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] py-3 flex items-center justify-center gap-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
          <Lock className="w-3.5 h-3.5" />
          <span>{t('superAdmin.footer') || 'منطقة سيادية • جميع العمليات مراقبة ومسجلة أمنياً'}</span>
        </footer>
      </div>
    </main>
  );
}
