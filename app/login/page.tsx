'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star,
  ArrowRight,
  CircleNotch,
  EnvelopeSimple,
  Lock,
  WarningCircle,
} from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie, PortalRole } from '@/lib/cookies';
import { useLocale } from '@/components/LocaleProvider';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function UnifiedLoginPage() {
  const router = useRouter();
  const { t, locale, isRtl } = useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Smart Redirection if already authenticated
  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const { data: userRole } = await supabase
            .from('user_roles')
            .select('role, business_id, branch_id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          const role = userRole?.role;
          let destination = '/my-places';
          let roleToCookie: PortalRole = 'customer';

          if (role === 'super_admin') {
            destination = '/super-admin';
            roleToCookie = 'super_admin';
          } else if (role === 'owner' || role === 'branch_admin') {
            destination = '/admin';
            roleToCookie = role;
            if (userRole?.business_id) {
              localStorage.setItem('admin_business_id', userRole.business_id);
            }
            localStorage.setItem('admin_role', role);
          } else if (role === 'cashier') {
            destination = '/cashier';
            roleToCookie = 'cashier';
            if (userRole?.business_id) localStorage.setItem('cashier_business_id', userRole.business_id);
            if (userRole?.branch_id) localStorage.setItem('cashier_branch_id', userRole.branch_id);
            localStorage.setItem('cashier_role', role);
          } else {
            destination = '/my-places';
            roleToCookie = 'customer';
          }

          setClientRoleCookie(roleToCookie);
          router.push(destination);
        } catch {
          setClientRoleCookie('customer');
          router.push('/my-places');
        }
      }
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError || !authData.user) {
        if (authError?.message?.toLowerCase().includes('email not confirmed')) {
          fetch('/api/auth/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&pending=1`);
          return;
        }
        setError(
          locale === 'ar'
            ? 'فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.'
            : 'Sign in failed. Please verify your email and password.'
        );
        setLoading(false);
        return;
      }

      // 2. Mandatory OTP Email Verification Guard
      const isEmailVerified =
        authData.user.user_metadata?.email_verified === true ||
        (Boolean(authData.user.email_confirmed_at) &&
          authData.user.user_metadata?.email_verified !== false);

      if (!isEmailVerified) {
        await supabase.auth.signOut();
        fetch('/api/auth/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&pending=1`);
        return;
      }

      // 3. Dynamic Smart Role Routing from user_roles
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, business_id, branch_id')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (roleError) {
        console.warn('[UnifiedLogin] Role query notice:', roleError);
      }

      const role = userRole?.role;
      let destination = '/my-places';
      let roleToCookie: PortalRole = 'customer';

      if (role === 'super_admin') {
        destination = '/super-admin';
        roleToCookie = 'super_admin';
      } else if (role === 'owner' || role === 'branch_admin') {
        destination = '/admin';
        roleToCookie = role;
        if (userRole?.business_id) {
          localStorage.setItem('admin_business_id', userRole.business_id);
        }
        localStorage.setItem('admin_role', role);
      } else if (role === 'cashier') {
        destination = '/cashier';
        roleToCookie = 'cashier';
        if (userRole?.business_id) localStorage.setItem('cashier_business_id', userRole.business_id);
        if (userRole?.branch_id) localStorage.setItem('cashier_branch_id', userRole.branch_id);
        localStorage.setItem('cashier_role', role);
      } else {
        // Customer or standard member
        destination = '/my-places';
        roleToCookie = 'customer';
      }

      // 4. Secure Cookie Scoping before Route Navigation
      setClientRoleCookie(roleToCookie);
      router.push(destination);
    } catch {
      setError(
        locale === 'ar'
          ? 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.'
          : 'An unexpected error occurred. Please try again.'
      );
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="page-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-[420px] p-7 sm:p-8 relative z-10 transition-all shadow-xl">
        {/* Navigation Header */}
        <div className="flex justify-between items-center mb-6">
          <Link
            href="/"
            aria-label={t('common.home') || 'Home'}
            className="w-9 h-9 rounded-full flex items-center justify-center border transition-transform active:scale-95"
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
            <span className="text-xs font-semibold tracking-wider text-muted uppercase">Pointat</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Brand Icon & Heading */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-md transition-transform"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
            }}
          >
            <Star size={28} weight="fill" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {locale === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </h1>
          <p className="text-xs text-muted mt-1">
            {locale === 'ar'
              ? 'سجل دخولك للوصول إلى حسابك'
              : 'Sign in to access your portal and account'}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            className="p-3 rounded-xl text-xs flex items-center gap-2 mb-4 border"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error-text)',
              borderColor: 'var(--color-error-border)',
            }}
          >
            <WarningCircle size={18} weight="light" className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Unified Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="cl-email">
              {locale === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative flex items-center">
              <input
                id="cl-email"
                className="ios-input pe-10"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
              />
              <EnvelopeSimple
                size={18}
                weight="light"
                className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold opacity-80" htmlFor="cl-password">
                {locale === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text)' }}
              >
                {locale === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
              </Link>
            </div>
            <div className="relative flex items-center">
              <input
                id="cl-password"
                className="ios-input pe-10"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Lock
                size={18}
                weight="light"
                className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`}
              />
            </div>
          </div>

          <button
            id="cl-signin-btn"
            type="submit"
            className="ios-btn-primary w-full mt-2"
            disabled={loading || !email.trim() || !password}
          >
            {loading ? (
              <>
                <CircleNotch size={18} weight="light" className="animate-spin" />
                <span>{locale === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{locale === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Separator */}
        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-[0.5px]" style={{ backgroundColor: 'var(--color-separator)' }} />
          <span className="text-[11px] opacity-40">{locale === 'ar' ? 'أو' : 'or'}</span>
          <div className="flex-1 h-[0.5px]" style={{ backgroundColor: 'var(--color-separator)' }} />
        </div>

        {/* Customer Registration Prompt */}
        <div className="text-center text-xs">
          <span className="opacity-60">
            {locale === 'ar' ? 'عميل جديد؟ ' : 'New customer? '}
          </span>
          <Link
            href="/signup"
            className="font-bold underline underline-offset-4 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-text)' }}
          >
            {locale === 'ar' ? 'إنشاء حساب جديد' : 'Create an account'}
          </Link>
        </div>
      </div>
    </main>
  );
}
