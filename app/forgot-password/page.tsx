'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Key,
  Phone,
  Lock,
  Eye,
  EyeSlash,
  ArrowRight,
  CircleNotch,
  WarningCircle,
  CheckCircle,
  ShieldWarning,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import {
  validateEgyptianPhone,
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/validation';

export default function ForgotPasswordPage() {
  const { t, isRtl } = useLocale();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const phoneVal = validateEgyptianPhone(phone);

  // Step 1: Request OTP via phone
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneVal.isValid) {
      setErrorMsg(phoneVal.errorMessage || 'رقم الموبايل غير صحيح');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessNotice(false);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();

      if (!res.ok && res.status === 429) {
        throw new Error(data.error || t('forgotPassword.rateLimitError') || 'تم تجاوز الحد المسموح. يرجى الانتظار.');
      }

      // Always move to step 2 (anti-enumeration: same UX whether phone exists or not)
      setSuccessNotice(true);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error') || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
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
      setErrorMsg(passVal.errorMessage || 'كلمة المرور غير صالحة');
      return;
    }

    const confirmVal = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!confirmVal.isValid) {
      setErrorMsg(confirmVal.errorMessage || 'كلمتا المرور غير متطابقتين');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('common.error') || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
      }

      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error') || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
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
            href="/login"
            aria-label={t('common.back')}
            className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] transition-transform active:scale-95"
          >
            <ArrowRight size={16} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
            <span className="text-[10px] font-mono font-medium tracking-wider uppercase text-[var(--color-text-muted)]">{t('forgotPassword.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* Card */}
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 sm:p-7 my-auto flex flex-col gap-5 transition-all">
          <div className="text-center flex flex-col items-center">
            <div
              className="w-12 h-12 mb-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] transition-transform"
            >
              <Key size={24} weight="light" />
            </div>

            <h1 className="text-xl font-light mb-1 tracking-tight text-[var(--color-text)]">
              {step === 1 && (t('forgotPassword.title') || 'نسيت كلمة المرور؟')}
              {step === 2 && (t('forgotPassword.step2Title') || 'أدخل كود التحقق')}
              {step === 3 && (t('forgotPassword.step3Title') || 'تم إعادة التعيين')}
            </h1>
            <p className="text-xs max-w-xs leading-relaxed text-[var(--color-text-muted)]">
              {step === 1 && (t('forgotPassword.subtitle') || 'أدخل رقم موبايلك وسنرسل لك كود لإعادة تعيين كلمة المرور')}
              {step === 2 && (t('forgotPassword.step2SubtitlePhone', { phone }) || `تم إرسال كود التحقق على ${phone}`)}
              {step === 3 && (t('forgotPassword.step3Subtitle') || 'تم تغيير كلمة المرور بنجاح')}
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div
              className="p-3 rounded-[4px] border text-xs flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <WarningCircle size={16} weight="light" className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Notice for Step 2 */}
          {successNotice && step === 2 && (
            <div
              className="p-3 rounded-[4px] border text-xs flex items-start gap-2"
              style={{
                backgroundColor: 'var(--color-success-bg)',
                color: 'var(--color-success-text)',
                borderColor: 'var(--color-success-border)',
              }}
            >
              <CheckCircle size={16} weight="light" className="shrink-0 mt-0.5" />
              <span>{t('forgotPassword.genericNotice') || 'لو الرقم ده مسجل عندنا، هيوصلك كود التحقق على موبايلك'}</span>
            </div>
          )}

          {/* STEP 1: Request OTP via phone */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]" htmlFor="reset-phone-input">
                  {t('forgotPassword.phoneLabel') || 'رقم الموبايل'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="tel"
                    id="reset-phone-input"
                    dir="ltr"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('forgotPassword.phonePlaceholder') || '01xxxxxxxxx'}
                    className="w-full h-10 px-3 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <Phone size={16} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
                {phone.trim() !== '' && !phoneVal.isValid && (
                  <p className="text-[11px] text-red-500 font-mono mt-1">
                    {phoneVal.errorMessage || 'رقم الموبايل غير صحيح'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="send-reset-code-btn"
                disabled={isLoading || !phoneVal.isValid}
                className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={16} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.sending') || 'جاري الإرسال...'}</span>
                  </>
                ) : (
                  <>
                    <Key size={16} weight="light" />
                    <span>{t('forgotPassword.sendOtpBtn') || 'إرسال كود التحقق'}</span>
                  </>
                )}
              </button>

              <div className="text-center mt-2">
                <Link
                  href="/login"
                  className="text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  {t('forgotPassword.backToLogin') || 'العودة لتسجيل الدخول'}
                </Link>
              </div>
            </form>
          )}

          {/* STEP 2: Enter OTP Code and New Password */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndReset} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]" htmlFor="reset-otp-input">
                  {t('forgotPassword.otpLabel') || 'كود التحقق'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="reset-otp-input"
                    dir="ltr"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('forgotPassword.otpPlaceholder') || '000000'}
                    className="w-full h-10 px-3 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] tracking-[0.35em]"
                  />
                  <Key size={16} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]" htmlFor="new-password-input">
                  {t('forgotPassword.newPasswordLabel') || 'كلمة المرور الجديدة'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    id="new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder') || '••••••••'}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNewPassword((v) => !v)}
                    className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none ${isRtl ? 'left-3' : 'right-3'}`}
                    aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showNewPassword
                      ? <EyeSlash size={16} weight="light" />
                      : <Eye size={16} weight="light" />}
                  </button>
                </div>
                {newPassword !== '' && !validatePassword(newPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-mono mt-1">
                    {validatePassword(newPassword).errorMessage || 'كلمة المرور ضعيفة'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider mb-1.5 text-[var(--color-text-muted)]" htmlFor="confirm-new-password-input">
                  {t('forgotPassword.confirmPasswordLabel') || 'تأكيد كلمة المرور'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirm-new-password-input"
                    dir="ltr"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('forgotPassword.passwordPlaceholder') || '••••••••'}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none ${isRtl ? 'left-3' : 'right-3'}`}
                    aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showConfirmPassword
                      ? <EyeSlash size={16} weight="light" />
                      : <Eye size={16} weight="light" />}
                  </button>
                </div>
                {confirmPassword !== '' && !validatePasswordConfirmation(newPassword, confirmPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-mono mt-1">
                    {validatePasswordConfirmation(newPassword, confirmPassword).errorMessage || 'كلمتا المرور غير متطابقتين'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="confirm-reset-btn"
                disabled={isLoading || token.trim().length < 6 || !newPassword || !confirmPassword}
                className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={16} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.confirming') || 'جاري التحقق...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldWarning size={16} weight="light" />
                    <span>{t('forgotPassword.confirmBtn') || 'تعيين كلمة المرور الجديدة'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs font-mono text-[var(--color-text-muted)] mt-2">
                <button
                  type="button"
                  onClick={() => { setStep(1); setToken(''); setErrorMsg(null); }}
                  className="hover:text-[var(--color-text)] flex items-center gap-1 transition-colors"
                >
                  <ArrowCounterClockwise size={14} weight="light" />
                  <span>{t('forgotPassword.resendCode') || 'إرسال كود جديد'}</span>
                </button>
                <Link href="/login" className="hover:text-[var(--color-text)] transition-colors">
                  {t('forgotPassword.backToLogin') || 'العودة لتسجيل الدخول'}
                </Link>
              </div>
            </form>
          )}

          {/* STEP 3: Success Screen */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                id="login-after-reset-btn"
                className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 flex items-center justify-center gap-2 transition-opacity"
              >
                <CheckCircle size={16} weight="light" />
                <span>{t('forgotPassword.loginNow') || 'تسجيل الدخول الآن'}</span>
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
