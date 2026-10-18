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
      <div className="w-full max-w-[400px] p-6 sm:p-7 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-2xl relative z-10">
        {/* Navigation Header */}
        <div className="flex justify-between items-center mb-6">
          <Link
            href="/"
            aria-label={t('common.home') || 'Home'}
            className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors active:scale-95 cursor-pointer"
          >
            <ArrowRight size={16} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[2px] bg-[var(--color-accent)]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-text-secondary)]">Pointat</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Brand Icon & Heading */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-12 h-12 rounded-[4px] border border-[var(--color-border)] flex items-center justify-center mb-3 bg-[var(--color-accent)] text-white"
          >
            <Star size={24} weight="fill" />
          </div>
          <h1 className="text-xl font-light tracking-tight text-[var(--color-text)]">
            {locale === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </h1>
          <p className="text-xs font-mono opacity-60 mt-1">
            {locale === 'ar'
              ? 'سجل دخولك برقم موبايلك وكلمة المرور'
              : 'Sign in with your phone number and password'}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            className="p-3 rounded-[4px] text-xs font-mono flex items-center gap-2 mb-4 border border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error-text)]"
          >
            <WarningCircle size={16} weight="light" className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Unified Login Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          {/* Phone Number */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 opacity-75" htmlFor="cl-identifier">
              {inputLabel}
            </label>
            <div className="relative flex items-center">
              <input
                id="cl-identifier"
                className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
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
                size={16}
                weight="light"
                className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-75" htmlFor="cl-password">
                {locale === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-mono opacity-65 hover:opacity-100 transition-opacity text-[var(--color-accent)]"
              >
                {locale === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
              </Link>
            </div>
            <div className="relative flex items-center">
              <input
                id="cl-password"
                className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
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
                className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none cursor-pointer ${isRtl ? 'left-3' : 'right-3'}`}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword
                  ? <EyeSlash size={16} weight="light" />
                  : <Eye size={16} weight="light" />}
              </button>
            </div>
          </div>

          <button
            id="cl-signin-btn"
            type="submit"
            className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider transition-all active:scale-[0.99] disabled:opacity-40 bg-[var(--color-accent)] text-white hover:brightness-110 flex items-center justify-center gap-2 mt-1 cursor-pointer"
            disabled={loading || !identifier.trim() || !password}
          >
            {loading ? (
              <>
                <CircleNotch size={16} weight="light" className="animate-spin" />
                <span>{locale === 'ar' ? 'جاري تسجيل الدخول...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{locale === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Separator */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="text-[10px] font-mono uppercase opacity-40">{locale === 'ar' ? 'أو' : 'or'}</span>
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>

        {/* Customer Registration Prompt */}
        <div className="text-center text-xs font-mono">
          <span className="opacity-60">
            {locale === 'ar' ? 'عميل جديد؟ ' : 'New customer? '}
          </span>
          <Link
            href="/signup"
            className="font-medium text-[var(--color-accent)] hover:underline underline-offset-4 transition-all"
          >
            {locale === 'ar' ? 'إنشاء حساب جديد' : 'Create an account'}
          </Link>
        </div>
      </div>
    </main>
  );
}
