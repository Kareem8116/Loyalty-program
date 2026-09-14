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
              {step === 1 && (t('forgotPassword.title') || 'نسيت كلمة المرور؟')}
              {step === 2 && (t('forgotPassword.step2Title') || 'أدخل كود التحقق')}
              {step === 3 && (t('forgotPassword.step3Title') || 'تم إعادة التعيين')}
            </h1>
            <p className="text-xs max-w-xs leading-relaxed opacity-60">
              {step === 1 && (t('forgotPassword.subtitle') || 'أدخل رقم موبايلك وسنرسل لك كود لإعادة تعيين كلمة المرور')}
              {step === 2 && (t('forgotPassword.step2SubtitlePhone', { phone }) || `تم إرسال كود التحقق على ${phone}`)}
              {step === 3 && (t('forgotPassword.step3Subtitle') || 'تم تغيير كلمة المرور بنجاح')}
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
              <span>{t('forgotPassword.genericNotice') || 'لو الرقم ده مسجل عندنا، هيوصلك كود التحقق على موبايلك'}</span>
            </div>
          )}

          {/* STEP 1: Request OTP via phone */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="reset-phone-input">
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
                    className="ios-input"
                  />
                  <Phone size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
                {phone.trim() !== '' && !phoneVal.isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {phoneVal.errorMessage || 'رقم الموبايل غير صحيح'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="send-reset-code-btn"
                disabled={isLoading || !phoneVal.isValid}
                className="ios-btn-primary w-full mt-2"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.sending') || 'جاري الإرسال...'}</span>
                  </>
                ) : (
                  <>
                    <Key size={18} weight="light" />
                    <span>{t('forgotPassword.sendOtpBtn') || 'إرسال كود التحقق'}</span>
                  </>
                )}
              </button>

              <div className="text-center mt-2">
                <Link
                  href="/login"
                  className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-text)' }}
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
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="reset-otp-input">
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
                    className="ios-input font-mono tracking-[0.35em]"
                  />
                  <Key size={18} weight="light" className={`absolute opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="new-password-input">
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
                    className="ios-input pe-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNewPassword((v) => !v)}
                    className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none ${isRtl ? 'left-3' : 'right-3'}`}
                    aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showNewPassword
                      ? <EyeSlash size={18} weight="light" />
                      : <Eye size={18} weight="light" />}
                  </button>
                </div>
                {newPassword !== '' && !validatePassword(newPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {validatePassword(newPassword).errorMessage || 'كلمة المرور ضعيفة'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-80" htmlFor="confirm-new-password-input">
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
                    className="ios-input pe-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className={`absolute opacity-50 hover:opacity-100 transition-opacity focus:outline-none ${isRtl ? 'left-3' : 'right-3'}`}
                    aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showConfirmPassword
                      ? <EyeSlash size={18} weight="light" />
                      : <Eye size={18} weight="light" />}
                  </button>
                </div>
                {confirmPassword !== '' && !validatePasswordConfirmation(newPassword, confirmPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {validatePasswordConfirmation(newPassword, confirmPassword).errorMessage || 'كلمتا المرور غير متطابقتين'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="confirm-reset-btn"
                disabled={isLoading || token.trim().length < 6 || !newPassword || !confirmPassword}
                className="ios-btn-primary w-full mt-2"
              >
                {isLoading ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('forgotPassword.confirming') || 'جاري التحقق...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldWarning size={18} weight="light" />
                    <span>{t('forgotPassword.confirmBtn') || 'تعيين كلمة المرور الجديدة'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs opacity-70 mt-2">
                <button
                  type="button"
                  onClick={() => { setStep(1); setToken(''); setErrorMsg(null); }}
                  className="hover:opacity-100 flex items-center gap-1 transition-opacity"
                >
                  <ArrowCounterClockwise size={14} weight="light" />
                  <span>{t('forgotPassword.resendCode') || 'إرسال كود جديد'}</span>
                </button>
                <Link href="/login" className="hover:opacity-100 transition-opacity">
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
                className="ios-btn-primary w-full"
              >
                <CheckCircle size={18} weight="light" />
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
