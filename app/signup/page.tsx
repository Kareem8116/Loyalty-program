'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, User, Phone, Gift, Check, 
  WarningCircle, CircleNotch, ShieldWarning, Sparkle, ArrowSquareOut 
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { validateEgyptianPhone, validateName } from '@/lib/validation';
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
    if (!name.trim() || !phoneNumber.trim()) return;

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
      if (data.requiresVerification && data.email) {
        const phoneParam = phoneVal.cleanPhone ? `&phone=${encodeURIComponent(phoneVal.cleanPhone)}` : '';
        const otpParam = data.simulatedOtp ? `&simulatedOtp=${encodeURIComponent(data.simulatedOtp)}` : '';
        setTimeout(() => {
          router.push(`/verify-email?email=${encodeURIComponent(data.email)}&role=customer${phoneParam}${otpParam}`);
        }, 1500);
        return;
      }
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
          className="w-10 h-10 rounded-full flex items-center justify-center border transition-transform active:scale-95"
          style={{
            backgroundColor: 'var(--color-input-bg)',
            color: 'var(--color-text)',
            borderColor: 'var(--color-border)',
          }}
        >
          <ArrowRight size={18} weight="light" className={`rotate-0 ${isRtl ? '' : 'rotate-180'}`} />
        </Link>
        <span className="text-sm font-bold">{t('signup.title')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {isLoadingTenant ? (
        <div className="my-auto py-16 flex flex-col items-center justify-center opacity-70">
          <CircleNotch size={32} weight="light" className="animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs">{t('common.loading')}</span>
        </div>
      ) : isSelfSignupEnabled === false ? (
        /* Feature Disabled Notice */
        <div className="my-auto py-8 flex flex-col items-center text-center gap-4">
          <div 
            className="w-14 h-14 rounded-3xl flex items-center justify-center border shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-card-bg)', 
              borderColor: 'var(--color-border)',
              color: 'var(--color-accent)'
            }}
          >
            <ShieldWarning size={28} weight="light" />
          </div>

          <div className="flex flex-col gap-1.5 px-4">
            <h1 className="text-base font-bold">{t('signup.featureDisabledTitle')}</h1>
            <p className="text-xs opacity-70 leading-relaxed">
              {t('signup.featureDisabledDesc')}
            </p>
          </div>

          <Link
            href="/"
            className="ios-btn-primary mt-2"
          >
            {t('signup.backHome')}
          </Link>
        </div>
      ) : (
        /* Active Self-Signup Form */
        <div className="flex flex-col gap-4 my-auto py-4">
          {/* Business Welcome Badge */}
          <div className="glass-card p-4 flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: 'rgba(125, 125, 125, 0.08)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              <Sparkle size={20} weight="light" />
            </div>
            <div>
              <span className="text-[11px] opacity-60 block">{business?.name || t('customer.defaultBusiness')}</span>
              <h1 className="text-xs font-bold">{t('signup.subtitle')}</h1>
            </div>
          </div>

          {/* Feedback alerts */}
          {errorMessage && (
            <div 
              className="p-3.5 rounded-2xl text-xs font-medium flex flex-col gap-2 border"
              style={{
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error-text)',
                borderColor: 'var(--color-error-border)',
              }}
            >
              <div className="flex items-center gap-2">
                <WarningCircle size={18} weight="light" className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {existingQrToken && (
                <Link
                  href={`/card/${existingQrToken}`}
                  id="view-existing-card-link"
                  className="mt-1 py-1.5 px-3 rounded-xl border text-[11px] font-bold self-start flex items-center gap-1 transition-opacity hover:opacity-80"
                  style={{ borderColor: 'var(--color-error-border)', backgroundColor: 'var(--color-card-bg)' }}
                >
                  <span>{t('signup.viewExistingCard')}</span>
                  <ArrowSquareOut size={14} weight="light" />
                </Link>
              )}
            </div>
          )}

          {isSuccess && (
            <div 
              className="p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border"
              style={{
                backgroundColor: 'var(--color-success-bg)',
                color: 'var(--color-success-text)',
                borderColor: 'var(--color-success-border)',
              }}
            >
              <Check size={18} weight="light" className="shrink-0" />
              <span>{t('signup.successRedirect')}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="glass-card p-6 flex flex-col gap-4 relative z-10"
          >
            {/* Full Name */}
            <div>
              <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="signup-name-input">
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
                  className="ios-input"
                />
                <User size={18} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
              {name && !validateName(name).isValid && (
                <p className="text-[11px] text-red-500 mt-1 font-medium">
                  {t(`validation.${validateName(name).errorKey}`)}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="signup-phone-input">
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
                  className="ios-input font-mono"
                />
                <Phone size={18} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
              {phoneNumber && !validateEgyptianPhone(phoneNumber).isValid && (
                <p className="text-[11px] text-red-500 mt-1 font-medium">
                  {t(`validation.${validateEgyptianPhone(phoneNumber).errorKey}`)}
                </p>
              )}
            </div>

            {/* Referral Code (Optional) */}
            <div>
              <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="signup-referral-input">
                {t('signup.referralCodeLabel')}
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  id="signup-referral-input"
                  placeholder={t('signup.referralCodePlaceholder')}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  className="ios-input uppercase font-mono"
                />
                <Gift size={18} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
              </div>
            </div>

            {/* Mandatory Consent Checkbox */}
            <div 
              className="p-3 rounded-2xl border flex items-start gap-2.5"
              style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)' }}
            >
              <input
                type="checkbox"
                id="signup-consent-checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1 w-4 h-4 rounded cursor-pointer shrink-0"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <label 
                htmlFor="signup-consent-checkbox" 
                className="text-[11px] opacity-80 leading-relaxed cursor-pointer select-none"
              >
                {t('signup.consentText')}
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="signup-submit-btn"
              disabled={isSubmitting || !name.trim() || !phoneNumber.trim() || !consentGiven}
              className="ios-btn-primary w-full mt-1"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={18} weight="light" className="animate-spin" />
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
