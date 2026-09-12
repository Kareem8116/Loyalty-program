'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Key, 
  EnvelopeSimple, 
  Lock, 
  ArrowRight, 
  CircleNotch, 
  WarningCircle, 
  CheckCircle, 
  ShieldWarning,
  ArrowCounterClockwise
} from '@phosphor-icons/react';
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

      if (!res.ok) {
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
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10 my-auto">
        {/* Header */}
        <header className="flex items-center justify-between w-full pb-4">
          <Link
            href="/admin/login"
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-full flex items-center justify-center border transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <ArrowRight size={18} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
            <span className="text-xs font-semibold tracking-wider uppercase opacity-75">{t('forgotPassword.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Card */}
        <div className="glass-card p-6 sm:p-7 my-auto flex flex-col gap-5 transition-all">
          <div className="text-center flex flex-col items-center">
            <div
              className="w-16 h-16 mb-3 rounded-2xl flex items-center justify-center shadow-md transition-transform"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
              }}
            >
              <Key size={30} weight="light" />
            </div>

            <h1 className="text-xl font-bold mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>
              {step === 1 && t('forgotPassword.title')}
              {step === 2 && t('forgotPassword.step2Title')}
              {step === 3 && t('forgotPassword.step3Title')}
            </h1>
            <p className="text-xs max-w-xs leading-relaxed opacity-60">
              {step === 1 && t('forgotPassword.subtitle')}
              {step === 2 && t('forgotPassword.step2Subtitle')}
              {step === 3 && t('forgotPassword.step3Subtitle')}
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
              <WarningCircle size={18} weight="light" className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Notice for Step 2 */}
          {successNotice && step === 2 && (
            <div
              className="p-3 rounded-xl border text-xs flex items-start gap-2"
              style={{
                backgroundColor: 'var(--color-success-bg)',
                color: 'var(--color-success-text)',
                borderColor: 'var(--color-success-border)',
              }}
            >
              <CheckCircle size={18} weight="light" className="shrink-0 mt-0.5" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* STEP 1: Request OTP */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="reset-email-input">
                  {t('forgotPassword.emailLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    id="reset-email-input"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('forgotPassword.emailPlaceholder')}
                    className="ios-input"
                  />
                  <EnvelopeSimple size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
                {email.trim() !== '' && !validateEmail(email).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validateEmail(email).errorKey}`)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="send-reset-code-btn"
                disabled={isLoading || !validateEmail(email).isValid}
                className="ios-btn-primary w-full mt-2"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.sending')}</span>
                  </>
                ) : (
                  <>
                    <Key size={18} weight="light" />
                    <span>{t('forgotPassword.sendOtpBtn')}</span>
                  </>
                )}
              </button>

              <div className="text-center mt-2">
                <Link
                  href="/admin/login"
                  className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-text)' }}
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
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="reset-otp-input">
                  {t('forgotPassword.otpLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="reset-otp-input"
                    dir="ltr"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('forgotPassword.otpPlaceholder')}
                    className="ios-input font-mono"
                  />
                  <Key size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="new-password-input">
                  {t('forgotPassword.newPasswordLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="password"
                    id="new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder')}
                    className="ios-input"
                  />
                  <Lock size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
                {newPassword !== '' && !validatePassword(newPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validatePassword(newPassword).errorKey}`)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="confirm-new-password-input">
                  {t('forgotPassword.confirmPasswordLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="password"
                    id="confirm-new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder')}
                    className="ios-input"
                  />
                  <Lock size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
                {confirmPassword !== '' && !validatePasswordConfirmation(newPassword, confirmPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validatePasswordConfirmation(newPassword, confirmPassword).errorKey}`)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="confirm-reset-btn"
                disabled={isLoading || !token.trim() || !newPassword || !confirmPassword}
                className="ios-btn-primary w-full mt-2"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.confirming')}</span>
                  </>
                ) : (
                  <>
                    <ShieldWarning size={18} weight="light" />
                    <span>{t('forgotPassword.confirmBtn')}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs opacity-70 mt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="hover:opacity-100 flex items-center gap-1 transition-opacity"
                >
                  <ArrowCounterClockwise size={14} weight="light" />
                  <span>{t('forgotPassword.resendCode')}</span>
                </button>
                <Link href="/admin/login" className="hover:opacity-100 transition-opacity">
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
                className="ios-btn-primary w-full"
              >
                <CheckCircle size={18} weight="light" />
                <span>{t('forgotPassword.loginNow')}</span>
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center text-[11px] opacity-40 py-3">
          {t('admin.footer')}
        </footer>
      </div>
    </main>
  );
}
