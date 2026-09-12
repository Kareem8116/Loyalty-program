'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Star, CaretRight, CircleNotch, ArrowRight } from '@phosphor-icons/react';
import { setClientRoleCookie } from '@/lib/cookies';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.push('/my-places');
      }
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData.user) {
        if (authError?.message?.toLowerCase().includes('email not confirmed')) {
          fetch('/api/auth/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim().toLowerCase() }),
          }).catch(() => {});
          router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&role=customer&pending=1`);
          return;
        }
        setError('فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.');
        setLoading(false);
        return;
      }

      // Mandatory OTP Email Verification Guard
      const isEmailVerified = authData.user.user_metadata?.email_verified === true || (Boolean(authData.user.email_confirmed_at) && authData.user.user_metadata?.email_verified !== false);
      if (!isEmailVerified) {
        await supabase.auth.signOut();
        fetch('/api/auth/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&role=customer&pending=1`);
        return;
      }

      setClientRoleCookie('customer');
      router.push('/my-places');
    } catch {
      setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="page-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-[400px] p-7 sm:p-8 relative z-10 transition-all">
        {/* Back Link */}
        <div className="flex justify-between items-center mb-6">
          <Link
            href="/"
            className="w-9 h-9 rounded-full flex items-center justify-center border transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <ArrowRight size={18} weight="light" className="rotate-0 rtl:rotate-0 ltr:rotate-180" />
          </Link>
          <span className="text-xs font-semibold tracking-wider text-muted uppercase">Pointat</span>
        </div>

        {/* Logo / Header */}
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
          <h1 className="text-2xl font-bold tracking-tight text-primary">دخول العملاء</h1>
          <p className="text-xs text-muted mt-1">سجل دخولك للوصول إلى نقاطك ومكافآتك</p>
        </div>

        {error && (
          <div
            className="p-3 rounded-xl text-xs text-center font-medium mb-4 border"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error-text)',
              borderColor: 'var(--color-error-border)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="cl-email">
              البريد الإلكتروني
            </label>
            <input
              id="cl-email"
              className="ios-input"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              dir="ltr"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold opacity-80" htmlFor="cl-password">
                كلمة المرور
              </label>
              <Link
                href="/forgot-password"
                className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text)' }}
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
            <input
              id="cl-password"
              className="ios-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
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
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              <span>تسجيل الدخول</span>
            )}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-[0.5px]" style={{ backgroundColor: 'var(--color-separator)' }} />
          <span className="text-[11px] opacity-40">أو</span>
          <div className="flex-1 h-[0.5px]" style={{ backgroundColor: 'var(--color-separator)' }} />
        </div>

        <div className="text-center text-xs">
          <span className="opacity-60">عميل جديد؟ </span>
          <Link
            href="/signup"
            className="font-bold underline underline-offset-4 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-text)' }}
          >
            إنشاء حساب جديد
          </Link>
        </div>
      </div>
    </main>
  );
}
