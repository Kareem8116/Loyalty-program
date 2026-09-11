'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ShieldCheck, Mail, ArrowRight, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, ShieldAlert, ArrowLeft, Smartphone, MessageSquare, Sparkles 
} from 'lucide-react';
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

  const [email, setEmail] = useState(emailParam);
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
    // Only allow digits
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned && value !== '') return;

    const newDigits = [...digits];

    if (cleaned.length > 1) {
      // Pasted multiple digits
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

    // Auto-advance to next input
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle Backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle Paste
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

      // Redirect user to their respective portal
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
    <div className="w-full max-w-md flex flex-col flex-1 py-4 relative z-10">
      {/* Header */}
      <header className="flex items-center justify-between w-full pb-4">
        <Link
          href={getLoginLink()}
          aria-label={t('common.back')}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm border transition-transform active:scale-95"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            color: 'var(--color-accent)',
            borderColor: 'var(--color-border)',
          }}
        >
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#6C63FF' }} />
          <span className="text-xs font-mono font-bold tracking-wider uppercase opacity-75">
            Security Verification
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Card */}
      <div
        className="rounded-3xl p-6 sm:p-8 border shadow-2xl my-auto flex flex-col gap-6 backdrop-blur-xl transition-all"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(108, 99, 255, 0.08)',
        }}
      >
        {/* Badge & Icon */}
        <div className="text-center flex flex-col items-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase mb-3.5 border"
            style={{
              backgroundColor: 'rgba(108, 99, 255, 0.12)',
              borderColor: 'rgba(108, 99, 255, 0.28)',
              color: 'var(--color-accent)',
            }}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{t('verifyEmail.badge')}</span>
          </div>

          <div
            className="w-16 h-16 mb-3 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #6C63FF, #4ECDC4)',
              color: '#ffffff',
              boxShadow: '0 10px 25px rgba(108, 99, 255, 0.35)',
            }}
          >
            <Mail className="w-8 h-8" />
          </div>

          <h1 className="text-xl font-bold mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>
            {t('verifyEmail.title')}
          </h1>
          <p className="text-xs max-w-xs leading-relaxed opacity-75" style={{ color: 'var(--color-text)' }}>
            {t('verifyEmail.subtitle', { email: email || 'بريدك الإلكتروني' })}
          </p>
        </div>

        {/* Pending Notice Banner (if arriving from unverified login) */}
        {isPendingParam && !errorMsg && !successMsg && (
          <div
            className="p-3 rounded-xl border text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'rgba(108, 99, 255, 0.12)',
              color: 'var(--color-accent)',
              borderColor: 'rgba(108, 99, 255, 0.28)',
            }}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{t('verifyEmail.pendingNotice')}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div
            className="p-3.5 rounded-xl border text-xs flex items-center gap-2 animate-shake"
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

        {/* Success Alert */}
        {successMsg && (
          <div
            className="p-3.5 rounded-xl border text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success-text)',
              borderColor: 'var(--color-success-border)',
            }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Simulated Phone SMS Card (Phase 30 / Trial Mode) */}
        {simulatedSms && (
          <div
            className="p-3.5 rounded-2xl border shadow-md animate-in slide-in-from-top-2 duration-200 flex flex-col gap-2 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.09))',
              borderColor: 'rgba(16, 185, 129, 0.35)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34D399' }}
                >
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block" style={{ color: '#34D399' }}>
                    📩 محاكاة رسالة SMS لهاتفك (وضع التجربة)
                  </span>
                  {simulatedSms.phone && (
                    <span className="text-[10px] opacity-75 font-mono" dir="ltr">
                      إلى الرقم: {simulatedSms.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                borderColor: 'rgba(255, 255, 255, 0.07)',
              }}
            >
              <div>
                <span className="text-[10px] opacity-70 block mb-0.5">كود التحقق المستلم:</span>
                <span className="text-base font-mono font-extrabold tracking-widest text-emerald-400">
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
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-black transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-sm flex items-center gap-1 shrink-0"
                style={{ backgroundColor: '#10B981' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>تعبئة الرمز</span>
              </button>
            </div>

            <span className="text-[10px] opacity-50 text-center">
              (تم إرسال الرمز أيضاً عبر الإيميل ويمكنك كتابته أو الضغط على تعبئة الرمز مباشرة)
            </span>
          </div>
        )}

        {/* 6-Digit OTP Form */}
        <form onSubmit={handleVerify} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2">
            <label className="text-xs font-semibold opacity-75 self-start">
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
                  className="w-12 h-14 text-center text-xl font-mono font-bold rounded-xl border focus:outline-none transition-all"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: digit ? 'var(--color-accent)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                    boxShadow: digit ? '0 0 12px rgba(108, 99, 255, 0.25)' : 'none',
                  }}
                />
              ))}
            </div>

            <p className="text-[11px] opacity-60 text-center mt-1">
              {t('verifyEmail.hint')}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="verify-email-submit-btn"
            disabled={isLoading || isSuccess || digits.join('').length !== 6}
            className="w-full py-3.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, #6C63FF 0%, #4ECDC4 100%)',
              color: '#ffffff',
              boxShadow: '0 8px 25px rgba(108, 99, 255, 0.35)',
            }}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('verifyEmail.verifying')}</span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('verifyEmail.successTitle')}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{t('verifyEmail.verifyBtn')}</span>
              </>
            )}
          </button>
        </form>

        {/* Resend OTP Section */}
        <div className="flex flex-col items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between w-full text-xs">
            <span className="opacity-70">لم يصلك الرمز؟</span>
            <button
              type="button"
              id="resend-otp-btn"
              disabled={cooldown > 0 || isResending || isLoading || isSuccess}
              onClick={handleResend}
              className="font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              style={{ color: 'var(--color-accent)' }}
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : cooldown > 0 ? (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('verifyEmail.resendCountdown', { seconds: cooldown })}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('verifyEmail.resendBtn')}</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between w-full text-[11px] pt-1">
            <Link
              href={getLoginLink()}
              className="opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text)' }}
            >
              {t('verifyEmail.backToLogin')}
            </Link>

            <Link
              href={roleParam === 'customer' ? '/signup' : getLoginLink()}
              className="opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-accent)' }}
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
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 relative overflow-hidden"
      style={{
        background: 'var(--page-bg-gradient)',
        color: 'var(--color-text)',
      }}
    >
      {/* Background ambient glows */}
      <div
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(108,99,255,0.09) 0%, transparent 70%)',
          top: '-200px',
          right: '-200px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '450px',
          height: '450px',
          background: 'radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%)',
          bottom: '-120px',
          left: '-120px',
          pointerEvents: 'none',
        }}
      />

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16 opacity-70">
            <RefreshCw className="w-8 h-8 animate-spin mb-2" style={{ color: '#6C63FF' }} />
            <span className="text-xs">Loading...</span>
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
