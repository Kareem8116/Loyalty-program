'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ShieldCheck, EnvelopeSimple, ArrowRight, ArrowLeft, CircleNotch, WarningCircle, 
  CheckCircle, Clock, ShieldWarning, DeviceMobile, Sparkle 
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, isRtl } = useLocale();

  const emailParam = searchParams.get('email') || '';
  const roleParam = searchParams.get('role') || 'customer';
  const phoneParam = searchParams.get('phone') || '';
  const initialOtpParam = searchParams.get('simulatedOtp') || '';
  const isPendingParam = searchParams.get('pending') === '1';

  const [simulatedSms, setSimulatedSms] = useState<{ phone?: string; otp: string } | null>(
    initialOtpParam ? { phone: phoneParam || undefined, otp: initialOtpParam } : null
  );

  const [email] = useState(emailParam);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Resend cooldown timer
  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);

  // Input refs for 6 digits
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Handle individual digit input
  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned && value !== '') return;

    const newDigits = [...digits];

    if (cleaned.length > 1) {
      const pastedChars = cleaned.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pastedChars[i] || '';
      }
      setDigits(newDigits);
      const nextIndex = Math.min(pastedChars.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newDigits[index] = cleaned;
    setDigits(newDigits);
    setErrorMsg(null);

    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    setDigits(newDigits);
    setErrorMsg(null);
    const targetIdx = Math.min(pastedData.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  // Handle OTP Verification Submit
  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const otp = digits.join('');

    if (otp.length !== 6) {
      setErrorMsg(t('validation.pinLength') || 'يرجى إدخال الرمز المكون من 6 أرقام كاملاً');
      return;
    }

    if (!email.trim()) {
      setErrorMsg(t('validation.emailInvalid') || 'البريد الإلكتروني مفقود');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('common.error'));
      }

      setIsSuccess(true);
      setSuccessMsg(data.message || t('verifyEmail.successTitle'));

      setTimeout(() => {
        if (roleParam === 'super_admin') {
          router.push('/super-admin/login');
        } else if (roleParam === 'owner' || roleParam === 'branch_admin') {
          router.push('/admin/login');
        } else {
          router.push('/login');
        }
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Resend OTP Code
  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/send-verification-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          phone: phoneParam || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('common.error'));
      }

      if (data.simulatedSms?.otp) {
        setSimulatedSms({
          phone: data.simulatedSms.phone || phoneParam || undefined,
          otp: data.simulatedSms.otp,
        });
      }

      setCooldown(data.cooldownSeconds || 60);
      setSuccessMsg(t('verifyEmail.resendSuccess') || 'تم إرسال رمز جديد إلى بريدك الإلكتروني بنجاح!');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setIsResending(false);
    }
  };

  const getLoginLink = () => {
    if (roleParam === 'super_admin') return '/super-admin/login';
    if (roleParam === 'owner' || roleParam === 'branch_admin') return '/admin/login';
    return '/login';
  };

  return (
    <div className="w-full max-w-md flex flex-col flex-1 py-4 relative z-10 my-auto">
      {/* Header */}
      <header className="flex items-center justify-between w-full pb-4">
        <Link
          href={getLoginLink()}
          aria-label={t('common.back')}
          className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] transition-transform active:scale-95"
        >
          {isRtl ? <ArrowRight size={16} weight="light" /> : <ArrowLeft size={16} weight="light" />}
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="text-[10px] font-mono font-medium tracking-wider uppercase text-[var(--color-text-muted)]">
            Security Verification
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Card */}
      <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 sm:p-8 my-auto flex flex-col gap-6 transition-all">
        {/* Badge & Icon */}
        <div className="text-center flex flex-col items-center">
          <div
            className="w-12 h-12 mb-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] transition-transform"
          >
            <EnvelopeSimple size={24} weight="light" />
          </div>

          <h1 className="text-xl font-light mb-1 tracking-tight text-[var(--color-text)]">
            {t('verifyEmail.title')}
          </h1>
          <p className="text-xs max-w-xs leading-relaxed text-[var(--color-text-muted)]">
            {t('verifyEmail.subtitle', { email: email || 'بريدك الإلكتروني' })}
          </p>
        </div>

        {/* Pending Notice Banner */}
        {isPendingParam && !errorMsg && !successMsg && (
          <div
            className="p-3 rounded-[4px] border text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-badge-daily-bg)',
              color: 'var(--color-badge-daily-text)',
              borderColor: 'var(--color-badge-daily-border)',
            }}
          >
            <Clock size={16} weight="light" className="shrink-0" />
            <span>{t('verifyEmail.pendingNotice')}</span>
          </div>
        )}

        {/* Error Alert */}
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

        {/* Success Alert */}
        {successMsg && (
          <div
            className="p-3 rounded-[4px] border text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success-text)',
              borderColor: 'var(--color-success-border)',
            }}
          >
            <CheckCircle size={16} weight="light" className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Simulated Phone SMS Card */}
        {simulatedSms && (
          <div
            className="p-3.5 rounded-[4px] border flex flex-col gap-2 relative overflow-hidden"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <DeviceMobile size={16} weight="light" className="text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
              <div>
                <span className="text-xs font-mono font-medium block text-[var(--color-text)]">
                  📩 محاكاة رسالة SMS لهاتفك (وضع التجربة)
                </span>
                {simulatedSms.phone && (
                  <span className="text-[10px] opacity-75 font-mono text-[var(--color-text-muted)]" dir="ltr">
                    إلى الرقم: {simulatedSms.phone}
                  </span>
                )}
              </div>
            </div>

            <div
              className="p-2.5 rounded-[4px] border flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div>
                <span className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">كود التحقق المستلم:</span>
                <span className="text-base font-mono font-medium tracking-widest text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]">
                  {simulatedSms.otp}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const chars = simulatedSms.otp.split('');
                  setDigits(chars);
                  setErrorMsg(null);
                  inputRefs.current[5]?.focus();
                }}
                className="px-3 py-1.5 rounded-[4px] text-xs font-mono uppercase font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 transition-opacity active:scale-95 cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Sparkle size={14} weight="light" />
                <span>تعبئة الرمز</span>
              </button>
            </div>
          </div>
        )}

        {/* 6-Digit OTP Form */}
        <form onSubmit={handleVerify} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2">
            <label className="text-[11px] font-mono uppercase tracking-wider self-start text-[var(--color-text-muted)]">
              {t('verifyEmail.otpLabel')}
            </label>

            {/* 6 Digit Inputs Box */}
            <div className="flex items-center justify-between w-full gap-2" dir="ltr">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading || isSuccess}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  id={`otp-digit-${idx}`}
                  className="w-11 h-12 text-center text-lg font-mono font-medium rounded-[4px] border focus:outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderColor: digit ? 'var(--color-accent)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              ))}
            </div>

            <p className="text-[11px] font-mono text-[var(--color-text-muted)] text-center mt-1">
              {t('verifyEmail.hint')}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="verify-email-submit-btn"
            disabled={isLoading || isSuccess || digits.join('').length !== 6}
            className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity"
          >
            {isLoading ? (
              <>
                <CircleNotch size={16} weight="light" className="animate-spin" />
                <span>{t('verifyEmail.verifying')}</span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle size={16} weight="light" />
                <span>{t('verifyEmail.successTitle')}</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} weight="light" />
                <span>{t('verifyEmail.verifyBtn')}</span>
              </>
            )}
          </button>
        </form>

        {/* Resend OTP Section */}
        <div className="flex flex-col items-center gap-3 pt-3 border-t border-[var(--color-separator)]">
          <div className="flex items-center justify-between w-full text-xs font-mono">
            <span className="text-[var(--color-text-muted)]">لم يصلك الرمز؟</span>
            <button
              type="button"
              id="resend-otp-btn"
              disabled={cooldown > 0 || isResending || isLoading || isSuccess}
              onClick={handleResend}
              className="font-medium flex items-center gap-1.5 transition-opacity disabled:opacity-50 cursor-pointer text-[var(--color-accent)]"
            >
              {isResending ? (
                <>
                  <CircleNotch size={14} weight="light" className="animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : cooldown > 0 ? (
                <>
                  <Clock size={14} weight="light" />
                  <span>{t('verifyEmail.resendCountdown', { seconds: cooldown })}</span>
                </>
              ) : (
                <>
                  <Sparkle size={14} weight="light" />
                  <span>{t('verifyEmail.resendBtn')}</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between w-full text-[11px] font-mono pt-1 text-[var(--color-text-muted)]">
            <Link
              href={getLoginLink()}
              className="hover:text-[var(--color-text)] transition-colors"
            >
              {t('verifyEmail.backToLogin')}
            </Link>

            <Link
              href={roleParam === 'customer' ? '/signup' : getLoginLink()}
              className="hover:text-[var(--color-text)] transition-colors underline"
            >
              {t('verifyEmail.changeEmail')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors relative overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16 opacity-70">
            <CircleNotch size={32} weight="light" className="animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
            <span className="text-xs">Loading...</span>
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
