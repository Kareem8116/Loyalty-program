'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  KeyRound, 
  Mail, 
  Lock, 
  ArrowRight, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert,
  RotateCcw
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { validateEmail, validatePassword, validatePasswordConfirmation } from '@/lib/validation';

export default function ForgotPasswordPage() {
  const { t, isRtl } = useLocale();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Step 1: Request OTP / Reset code
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      setErrorMsg(t(`validation.${emailVal.errorKey}`));
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessNotice(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok && res.status === 429) {
        throw new Error(data.error || t('forgotPassword.rateLimitError'));
      }

      if (!res.ok && res.status !== 200) {
        throw new Error(data.error || t('common.error'));
      }

      // Phase 23.5: Always display the generic notice without leaking account existence
      setSuccessNotice(data.message || t('forgotPassword.genericNotice'));
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP and set new password
  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const passVal = validatePassword(newPassword);
    if (!passVal.isValid) {
      setErrorMsg(t(`validation.${passVal.errorKey}`));
      return;
    }

    const confirmVal = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!confirmVal.isValid) {
      setErrorMsg(t(`validation.${confirmVal.errorKey}`));
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('common.error'));
      }

      setStep(3);
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
      {/* Ambient background glows */}
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
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%)',
        bottom: '-100px',
        left: '-100px',
        pointerEvents: 'none',
      }} />

      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between w-full pb-4">
          <Link
            href="/admin/login"
            aria-label={t('forgotPassword.backToLogin')}
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm border transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-border)',
            }}
          >
            <ArrowRight className={`w-5 h-5 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <span className="text-sm font-bold">{t('forgotPassword.title')}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Card Container */}
        <div 
          className="rounded-3xl p-6 border shadow-2xl my-auto flex flex-col gap-5 backdrop-blur-xl transition-colors"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          {/* Top Icon */}
          <div className="text-center">
            <div 
              className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center shadow-sm"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
            >
              {step === 3 ? (
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              ) : (
                <KeyRound className="w-7 h-7" />
              )}
            </div>
            <h1 className="text-xl font-bold mb-1">
              {step === 1 && t('forgotPassword.title')}
              {step === 2 && t('forgotPassword.step2Title')}
              {step === 3 && t('forgotPassword.successTitle')}
            </h1>
            <p className="text-xs opacity-70 leading-relaxed">
              {step === 1 && t('forgotPassword.subtitle')}
              {step === 2 && t('forgotPassword.step2Subtitle', { email })}
              {step === 3 && t('forgotPassword.successDesc')}
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div 
              className="p-3 rounded-xl border text-xs flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success / Generic Info Notice in Step 2 */}
          {step === 2 && successNotice && (
            <div 
              className="p-3 rounded-xl border text-xs flex items-center gap-2"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                color: 'var(--color-text)',
                borderColor: 'rgba(59, 130, 246, 0.25)',
              }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-500" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* STEP 1: Enter Email */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('forgotPassword.emailLabel')}</label>
                <div className="relative">
                  <input
                    type="email"
                    id="reset-email-input"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('forgotPassword.emailPlaceholder')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pr-9' : 'pl-9'}`}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
                  />
                  <Mail className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
                </div>
                {email.trim() !== '' && !validateEmail(email).isValid && (
                  <p className="text-[11px] text-red-400 font-medium mt-1">
                    {t(`validation.${validateEmail(email).errorKey}`)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="send-reset-code-btn"
                disabled={isLoading || !validateEmail(email).isValid}
                className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-lg mt-2 flex items-center justify-center gap-2 disabled:opacity-50 btn-gradient"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>{isLoading ? t('forgotPassword.sending') : t('forgotPassword.sendOtpBtn')}</span>
              </button>

              <div className="text-center mt-1">
                <Link
                  href="/admin/login"
                  className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                >
                  {t('forgotPassword.backToLogin')}
                </Link>
              </div>
            </form>
          )}

          {/* STEP 2: Enter OTP Code and New Password */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndReset} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('forgotPassword.otpLabel')}</label>
                <div className="relative">
                  <input
                    type="text"
                    id="reset-otp-input"
                    dir="ltr"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('forgotPassword.otpPlaceholder')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none font-mono transition-all ${isRtl ? 'pr-9' : 'pl-9'}`}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
                  />
                  <KeyRound className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('forgotPassword.newPasswordLabel')}</label>
                <div className="relative">
                  <input
                    type="password"
                    id="new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pr-9' : 'pl-9'}`}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
                  />
                  <Lock className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
                </div>
                {newPassword !== '' && !validatePassword(newPassword).isValid && (
                  <p className="text-[11px] text-red-400 font-medium mt-1">
                    {t(`validation.${validatePassword(newPassword).errorKey}`)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('forgotPassword.confirmPasswordLabel')}</label>
                <div className="relative">
                  <input
                    type="password"
                    id="confirm-new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pr-9' : 'pl-9'}`}
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}
                  />
                  <Lock className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
                </div>
                {confirmPassword !== '' && !validatePasswordConfirmation(newPassword, confirmPassword).isValid && (
                  <p className="text-[11px] text-red-400 font-medium mt-1">
                    {t(`validation.${validatePasswordConfirmation(newPassword, confirmPassword).errorKey}`)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="confirm-reset-btn"
                disabled={isLoading || !token.trim() || !newPassword || !confirmPassword}
                className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-lg mt-2 flex items-center justify-center gap-2 disabled:opacity-50 btn-gradient"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                <span>{isLoading ? t('forgotPassword.confirming') : t('forgotPassword.confirmBtn')}</span>
              </button>

              <div className="flex items-center justify-between text-xs opacity-70 mt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="hover:opacity-100 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t('forgotPassword.resendCode')}</span>
                </button>
                <Link href="/admin/login" className="hover:opacity-100">
                  {t('forgotPassword.backToLogin')}
                </Link>
              </div>
            </form>
          )}

          {/* STEP 3: Success Screen */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <Link
                href="/admin/login"
                id="login-after-reset-btn"
                className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 btn-gradient"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('forgotPassword.loginNow')}</span>
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center text-[11px] opacity-50 py-3">
          {t('admin.footer')}
        </footer>
      </div>
    </main>
  );
}
