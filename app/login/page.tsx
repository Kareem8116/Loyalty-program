'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

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
    // If already logged in as a customer, redirect to my-places
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

      // Phase 29: Mandatory OTP Email Verification Guard
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

      router.push('/my-places');
    } catch {
      setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .cl-root {
          min-height: 100vh;
          background: var(--page-bg-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          padding: 1rem;
          position: relative;
          overflow: hidden;
          transition: background 0.3s ease, color 0.3s ease;
          color: var(--color-text);
        }

        .cl-root::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(108,99,255,0.09) 0%, transparent 70%);
          top: -200px;
          right: -200px;
          pointer-events: none;
        }

        .cl-root::after {
          content: '';
          position: absolute;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%);
          bottom: -100px;
          left: -100px;
          pointer-events: none;
        }

        .cl-card {
          background: var(--color-card-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 2.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.6);
          animation: slideUp 0.5s ease-out;
          position: relative;
          z-index: 1;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cl-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2rem;
          gap: 0.75rem;
        }

        .cl-logo-icon {
          width: 52px;
          height: 52px;
          background: linear-gradient(135deg, #6C63FF, #4ECDC4);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          box-shadow: 0 8px 20px rgba(108,99,255,0.4);
        }

        .cl-logo-text {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #6C63FF, #4ECDC4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .cl-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          text-align: center;
          margin-bottom: 0.5rem;
        }

        .cl-subtitle {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.55);
          text-align: center;
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        .cl-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .cl-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .cl-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: rgba(255,255,255,0.75);
        }

        .cl-input {
          width: 100%;
          padding: 0.875rem 1rem;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s ease;
          outline: none;
        }

        .cl-input::placeholder { color: rgba(255,255,255,0.3); }

        .cl-input:focus {
          border-color: rgba(108,99,255,0.6);
          background: rgba(255,255,255,0.1);
          box-shadow: 0 0 0 3px rgba(108,99,255,0.15);
        }

        .cl-error {
          background: rgba(255,59,48,0.12);
          border: 1px solid rgba(255,59,48,0.3);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #ff6b6b;
          font-size: 0.875rem;
          text-align: center;
        }

        .cl-btn {
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, #6C63FF, #4ECDC4);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 1rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          margin-top: 0.25rem;
        }

        .cl-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .cl-btn:hover:not(:disabled)::before { opacity: 1; }
        .cl-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(108,99,255,0.4); }
        .cl-btn:active:not(:disabled) { transform: translateY(0); }
        .cl-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .cl-links {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1.25rem;
          font-size: 0.85rem;
        }

        .cl-link {
          color: rgba(108,99,255,0.85);
          text-decoration: none;
          transition: color 0.2s;
        }

        .cl-link:hover { color: #6C63FF; text-decoration: underline; }

        .cl-divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.5rem 0 1rem;
        }

        .cl-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.1);
        }

        .cl-divider-text {
          color: rgba(255,255,255,0.35);
          font-size: 0.8rem;
        }

        .cl-signup-row {
          text-align: center;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.5);
        }

        .cl-signup-row a {
          color: #4ECDC4;
          text-decoration: none;
          font-weight: 500;
          margin-left: 0.4rem;
        }

        .cl-signup-row a:hover { text-decoration: underline; }

        .cl-footer {
          text-align: center;
          margin-top: 2rem;
          font-size: 0.75rem;
          color: rgba(255,255,255,0.2);
        }

        .cl-spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 0.5rem;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .cl-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .cl-particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(108,99,255,0.15);
          animation: float linear infinite;
        }

        @keyframes float {
          0% { transform: translateY(100vh) scale(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100px) scale(1); opacity: 0; }
        }
      `}</style>

      <div className="cl-root">
        {/* Floating particles */}
        <div className="cl-particles">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="cl-particle"
              style={{
                width: `${Math.random() * 30 + 10}px`,
                height: `${Math.random() * 30 + 10}px`,
                left: `${Math.random() * 100}%`,
                animationDuration: `${Math.random() * 15 + 10}s`,
                animationDelay: `${Math.random() * 10}s`,
              }}
            />
          ))}
        </div>

        <div className="cl-card">
          <div className="cl-logo">
            <div className="cl-logo-icon">
              <span>★</span>
            </div>
            <span className="cl-logo-text">Pointat</span>
          </div>

          <h1 className="cl-title">دخول العملاء</h1>
          <p className="cl-subtitle">
            سجل دخولك للوصول الى نقاطك في كل الاماكن
          </p>

          {error && <div className="cl-error" role="alert">{error}</div>}

          <form className="cl-form" onSubmit={handleLogin} noValidate>
            <div className="cl-field">
              <label className="cl-label" htmlFor="cl-email">البريد الالكتروني</label>
              <input
                id="cl-email"
                className="cl-input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
              />
            </div>

            <div className="cl-field">
              <label className="cl-label" htmlFor="cl-password">كلمة المرور</label>
              <input
                id="cl-password"
                className="cl-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              id="cl-signin-btn"
              type="submit"
              className="cl-btn"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? (
                <><span className="cl-spinner" />جاري الدخول...</>
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>

          <div className="cl-links">
            <Link href="/forgot-password" className="cl-link">
              نسيت كلمة السر؟
            </Link>
          </div>

          <div className="cl-divider">
            <div className="cl-divider-line" />
            <span className="cl-divider-text">أو</span>
            <div className="cl-divider-line" />
          </div>

          <div className="cl-signup-row">
            عميل جديد؟
            <Link href="/signup">انشاء حساب</Link>
          </div>

          <p className="cl-footer">بوابة العملاء - Pointat</p>
        </div>
      </div>
    </>
  );
}
