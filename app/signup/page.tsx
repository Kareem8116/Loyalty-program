'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, User, Phone, Gift, Check, Lock,
  Eye, EyeSlash,
  WarningCircle, CircleNotch, ShieldWarning, Sparkle, ArrowSquareOut 
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { validateEgyptianPhone, validateName, validatePassword } from '@/lib/validation';
import { setClientRoleCookie } from '@/lib/cookies';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, isRtl } = useLocale();

  const queryBizId = searchParams.get('businessId') || searchParams.get('biz');
  const queryRef = searchParams.get('ref') || searchParams.get('referral');

  const [business, setBusiness] = useState<any | null>(null);
  const [isSelfSignupEnabled, setIsSelfSignupEnabled] = useState<boolean | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(queryRef || '');
  const [consentGiven, setConsentGiven] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [existingQrToken, setExistingQrToken] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Load Tenant & Feature Status
  useEffect(() => {
    async function loadTenant() {
      try {
        let url = '/api/tenant';
        if (queryBizId) {
          url += `?businessId=${encodeURIComponent(queryBizId)}`;
        }
        const res = await fetch(url);
        const data = await res.json();

        if (data.success && data.business) {
          setBusiness(data.business);
          setIsSelfSignupEnabled(Boolean(data.isSelfSignupEnabled));
        } else {
          setIsSelfSignupEnabled(false);
        }
      } catch (err) {
        console.error('Error loading tenant for signup:', err);
        setIsSelfSignupEnabled(false);
      } finally {
        setIsLoadingTenant(false);
      }
    }

    loadTenant();
  }, [queryBizId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim() || !password) return;

    if (!consentGiven) {
      setErrorMessage(t('signup.consentRequired'));
      return;
    }

    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      setErrorMessage(t(`validation.${nameVal.errorKey}`) || nameVal.errorMessage || 'برجاء إدخال اسم صحيح');
      return;
    }

    const phoneVal = validateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      setErrorMessage(t(`validation.${phoneVal.errorKey}`) || phoneVal.errorMessage || 'رقم التليفون غير صحيح');
      return;
    }

    const passVal = validatePassword(password);
    if (!passVal.isValid) {
      setErrorMessage(passVal.errorMessage || 'كلمة المرور غير صالحة');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t('validation.passwords_not_matching') || 'كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setExistingQrToken(null);

    try {
      const res = await fetch('/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business?.id || queryBizId,
          subdomain: business?.subdomain,
          name: nameVal.value,
          phoneNumber: phoneVal.cleanPhone,
          password,
          consentGiven: true,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'PHONE_ALREADY_EXISTS') {
          setErrorMessage(t('signup.phoneExistsError'));
          if (data.qrToken) {
            setExistingQrToken(data.qrToken);
          }
          return;
        }
        if (data.code === 'FEATURE_DISABLED') {
          setIsSelfSignupEnabled(false);
          return;
        }
        throw new Error(data.error || t('common.error'));
      }

      setIsSuccess(true);
      setClientRoleCookie('customer');
      // No email verification required — phone-only auth
      const token = data.customer?.qrToken;
      setTimeout(() => {
        if (token) {
          router.push(`/card/${token}`);
        } else {
          router.push('/');
        }
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10">
      {/* Header */}
      <header className="flex items-center justify-between w-full pb-4">
        <Link
          href="/"
          aria-label={t('common.back')}
          className="w-8 h-8 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors active:scale-95 cursor-pointer"
        >
          <ArrowRight size={16} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
        </Link>
        <span className="text-sm font-light tracking-tight">{t('signup.title')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {isLoadingTenant ? (
        <div className="my-auto py-16 flex flex-col items-center justify-center opacity-70">
          <CircleNotch size={28} weight="light" className="animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs font-mono">{t('common.loading')}</span>
        </div>
      ) : isSelfSignupEnabled === false ? (
        /* Feature Disabled Notice */
        <div className="my-auto py-8 flex flex-col items-center text-center gap-4">
          <div 
            className="w-12 h-12 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-accent)]"
          >
            <ShieldWarning size={24} weight="light" />
          </div>

          <div className="flex flex-col gap-1.5 px-4">
            <h1 className="text-base font-light tracking-tight">{t('signup.featureDisabledTitle')}</h1>
            <p className="text-xs font-mono opacity-70 leading-relaxed">
              {t('signup.featureDisabledDesc')}
            </p>
          </div>

          <Link
            href="/"
            className="h-10 px-4 rounded-[8px] font-mono text-xs uppercase tracking-wider bg-[var(--color-accent)] text-white hover:brightness-110 flex items-center justify-center mt-2 cursor-pointer"
          >
            {t('signup.backHome')}
          </Link>
        </div>
      ) : (
        /* Active Self-Signup Form */
        <div className="flex flex-col gap-3.5 my-auto py-4">
          {/* Business Welcome Badge */}
          <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-[4px] flex items-center justify-center shrink-0 border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-accent)]"
            >
              <Sparkle size={18} weight="light" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider opacity-60 block">{business?.name || t('customer.defaultBusiness')}</span>
              <h1 className="text-xs font-medium">{t('signup.subtitle')}</h1>
            </div>
          </div>

          {/* Feedback alerts */}
          {errorMessage && (
            <div 
              className="p-3 rounded-[4px] text-xs font-mono flex flex-col gap-2 border border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error-text)]"
            >
              <div className="flex items-center gap-2">
                <WarningCircle size={16} weight="light" className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {existingQrToken && (
                <Link
                  href={`/card/${existingQrToken}`}
                  id="view-existing-card-link"
                  className="mt-1 py-1 px-2.5 rounded-[4px] border border-[var(--color-error-border)] bg-[var(--color-card-bg)] text-[10px] font-mono self-start flex items-center gap-1 hover:opacity-80 transition-opacity"
                >
                  <span>{t('signup.viewExistingCard')}</span>
                  <ArrowSquareOut size={13} weight="light" />
                </Link>
              )}
            </div>
          )}

          {isSuccess && (
            <div 
              className="p-3 rounded-[4px] text-xs font-mono flex items-center gap-2 border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
            >
              <Check size={16} weight="light" className="shrink-0" />
              <span>{t('signup.successRedirect')}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="p-5 sm:p-6 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] shadow-2xl flex flex-col gap-3.5 relative z-10"
          >
            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider opacity-75 mb-1.5" htmlFor="signup-name-input">
                {t('signup.nameLabel')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  id="signup-name-input"
                  required
                  placeholder={t('signup.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                />
                <User size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
              {name && !validateName(name).isValid && (
                <p className="text-[10px] font-mono text-rose-400 mt-1">
                  {t(`validation.${validateName(name).errorKey}`)}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider opacity-75 mb-1.5" htmlFor="signup-phone-input">
                {t('signup.phoneLabel')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="tel"
                  id="signup-phone-input"
                  required
                  maxLength={11}
                  dir="ltr"
                  placeholder={t('signup.phonePlaceholder')}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                />
                <Phone size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
              {phoneNumber && !validateEgyptianPhone(phoneNumber).isValid && (
                <p className="text-[10px] font-mono text-rose-400 mt-1">
                  {t(`validation.${validateEgyptianPhone(phoneNumber).errorKey}`)}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider opacity-75 mb-1.5" htmlFor="signup-password-input">
                {t('signup.passwordLabel') || 'كلمة المرور'}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-password-input"
                  required
                  minLength={8}
                  placeholder={t('signup.passwordPlaceholder') || '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                  dir="ltr"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity focus:outline-none cursor-pointer`}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword
                    ? <EyeSlash size={16} weight="light" />
                    : <Eye size={16} weight="light" />}
                </button>
              </div>
              {password && !validatePassword(password).isValid && (
                <p className="text-[10px] font-mono text-rose-400 mt-1">
                  {validatePassword(password).errorMessage || 'كلمة المرور ضعيفة'}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider opacity-75 mb-1.5" htmlFor="signup-confirm-password-input">
                {t('signup.confirmPasswordLabel') || 'تأكيد كلمة المرور'}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="signup-confirm-password-input"
                  required
                  minLength={8}
                  placeholder={t('signup.passwordPlaceholder') || '••••••••'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                  dir="ltr"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity focus:outline-none cursor-pointer`}
                  aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showConfirmPassword
                    ? <EyeSlash size={16} weight="light" />
                    : <Eye size={16} weight="light" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[10px] font-mono text-rose-400 mt-1">
                  {t('validation.passwords_not_matching') || 'كلمتا المرور غير متطابقتين'}
                </p>
              )}
            </div>

            {/* Referral Code (Optional) */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider opacity-75 mb-1.5" htmlFor="signup-referral-input">
                {t('signup.referralCodeLabel')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  id="signup-referral-input"
                  placeholder={t('signup.referralCodePlaceholder')}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="w-full h-10 px-3 rounded-[4px] text-xs font-mono uppercase border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors pe-10"
                />
                <Gift size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
            </div>

            {/* Mandatory Consent Checkbox */}
            <div 
              className="p-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg)] flex items-start gap-2.5"
            >
              <input
                type="checkbox"
                id="signup-consent-checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1 w-3.5 h-3.5 rounded-[2px] cursor-pointer shrink-0"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <label 
                htmlFor="signup-consent-checkbox" 
                className="text-[11px] font-mono opacity-80 leading-relaxed cursor-pointer select-none"
              >
                {t('signup.consentText')}
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="signup-submit-btn"
              disabled={isSubmitting || !name.trim() || !phoneNumber.trim() || !password || !confirmPassword || !consentGiven}
              className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider transition-all active:scale-[0.99] disabled:opacity-40 bg-[var(--color-accent)] text-white hover:brightness-110 flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={16} weight="light" className="animate-spin" />
                  <span>{t('signup.submitting')}</span>
                </>
              ) : (
                <span>{t('signup.submitBtn')}</span>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="page-bg min-h-screen p-4 flex flex-col items-center justify-center relative overflow-hidden">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-16 opacity-70">
          <CircleNotch size={32} weight="light" className="animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs">Loading...</span>
        </div>
      }>
        <SignupContent />
      </Suspense>
    </main>
  );
}
