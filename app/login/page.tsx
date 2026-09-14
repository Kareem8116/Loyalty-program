'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star,
  ArrowRight,
  CircleNotch,
  EnvelopeSimple,
  Phone,
  Lock,
  Eye,
  EyeSlash,
  WarningCircle,
} from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie, PortalRole } from '@/lib/cookies';
import { useLocale } from '@/components/LocaleProvider';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const PHANTOM_DOMAIN = 'pointat.internal';

/**
 * Detects if input looks like a phone number (Egyptian 11-digit or international).
 * Returns true for anything that starts with 0, +, or is ≥10 pure digits.
 */
function looksLikePhone(input: string): boolean {
  const stripped = input.replace(/[\s\-().+]/g, '');
  // Pure digits only after stripping separators, and at least 10 chars
  return /^\d{10,15}$/.test(stripped) || /^01\d{9}$/.test(stripped);
}

/**
 * Normalise an Egyptian/international phone to the clean digits we use for
 * phantom emails (e.g. "01012345678" or "201012345678").
 */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Egyptian: 01x → keep as-is; international 2010x → strip leading 2
  if (digits.startsWith('2') && digits.length === 12) {
    return digits.slice(1); // 201012345678 → 01012345678
  }
  return digits;
}

export default function UnifiedLoginPage() {
  const router = useRouter();
  const { t, locale, isRtl } = useLocale();

  const [identifier, setIdentifier] = useState(''); // email OR phone
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  const isPhone = looksLikePhone(identifier.trim());

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
    if (!identifier.trim() || !password) return;
    setLoading(true);
    setError('');

    const raw = identifier.trim();

    // For phone inputs: resolve to phantom email. For email inputs: use as-is.
    let authEmail: string;
    if (looksLikePhone(raw)) {
      const cleanPhone = normalisePhone(raw);
      authEmail = `${cleanPhone}@${PHANTOM_DOMAIN}`;
    } else {
      authEmail = raw.toLowerCase();
    }

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (authError || !authData.user) {
        // For phone users: never show phantom-email details in the error
        const isPhoneLogin = looksLikePhone(raw);
        if (
          authError?.message?.toLowerCase().includes('email not confirmed') &&
          !isPhoneLogin
        ) {
          // Email-based staff: nudge them to verify their email
          fetch('/api/auth/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authEmail }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(authEmail)}&pending=1`);
          return;
        }

        setError(
          locale === 'ar'
            ? isPhoneLogin
              ? 'رقم الموبايل أو كلمة المرور غير صحيحة.'
              : 'فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.'
            : isPhoneLogin
              ? 'Invalid phone number or password.'
              : 'Sign in failed. Please verify your email and password.'
        );
        setLoading(false);
        return;
      }

      // 2. Email-verification guard — only for real (non-phantom) staff emails
      const isPhantomUser = authData.user.email?.endsWith(`@${PHANTOM_DOMAIN}`);
      if (!isPhantomUser) {
        const isEmailVerified =
          authData.user.user_metadata?.email_verified === true ||
          (Boolean(authData.user.email_confirmed_at) &&
            authData.user.user_metadata?.email_verified !== false);

        if (!isEmailVerified) {
          await supabase.auth.signOut();
          fetch('/api/auth/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authEmail }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(authEmail)}&pending=1`);
          return;
        }
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
        // Customer — or phantom user with no explicit role
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

  const inputLabel = locale === 'ar'
    ? 'رقم الموبايل'
    : 'Phone Number';

  const inputPlaceholder = '01xxxxxxxxx';

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
              ? 'سجل دخولك برقم موبايلك وكلمة المرور'
              : 'Sign in with your phone number and password'}
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
          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="cl-identifier">
              {inputLabel}
            </label>
            <div className="relative flex items-center">
              <input
                id="cl-identifier"
                className="ios-input pe-10"
                type="text"
                inputMode="tel"
                placeholder={inputPlaceholder}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                dir="ltr"
              />
              <Phone
                size={18}
                weight="light"
                className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`}
              />
            </div>
          </div>

          {/* Password */}
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
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none ${isRtl ? 'left-3' : 'right-3'}`}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword
                  ? <EyeSlash size={18} weight="light" />
                  : <Eye size={18} weight="light" />}
              </button>
            </div>
          </div>

          <button
            id="cl-signin-btn"
            type="submit"
            className="ios-btn-primary w-full mt-2"
            disabled={loading || !identifier.trim() || !password}
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
