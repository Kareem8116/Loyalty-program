'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Star, User, Phone, Gift, 
  Check, WarningCircle, CircleNotch, Eye, EyeSlash,
  MagnifyingGlass, ArrowRight, CaretDown, CaretUp, Storefront
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { supabase } from '@/lib/supabase';
import { setClientRoleCookie } from '@/lib/cookies';
import { extractCustomerToken } from '@/lib/tokens';
import { 
  validateEgyptianPhone, 
  validatePassword, 
  validateName 
} from '@/lib/validation';

interface TenantBusiness {
  id: string;
  name: string;
  subdomain: string;
}

interface HomeContentProps {
  tenantBusiness?: TenantBusiness | null;
  isSelfSignupEnabled?: boolean;
}

const PHANTOM_DOMAIN = 'pointat.internal';

export default function HomeContent({ 
  tenantBusiness = null, 
  isSelfSignupEnabled = true 
}: HomeContentProps) {
  const router = useRouter();
  const { t, locale, isRtl } = useLocale();

  // Mode: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  // Login Form States (Phone + Password only)
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Signup Form States (Name + Phone + Mandatory Password)
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [existingQrToken, setExistingQrToken] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Quick Card Lookup State
  const [showLookup, setShowLookup] = useState(false);
  const [lookupCode, setLookupCode] = useState('');

  // Check if session already exists for customer -> redirect to my-places
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.push('/my-places');
      }
    });
  }, [router]);

  // 1. Handle Phone-based Customer Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone.trim() || !loginPassword) return;

    const phoneVal = validateEgyptianPhone(loginPhone);
    if (!phoneVal.isValid) {
      setLoginError(t(`validation.${phoneVal.errorKey}`) || phoneVal.errorMessage || 'رقم التليفون غير صحيح');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const cleanPhone = phoneVal.cleanPhone;
      const phantomEmail = `${cleanPhone}@${PHANTOM_DOMAIN}`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: phantomEmail,
        password: loginPassword,
      });

      if (authError || !authData.user) {
        setLoginError(
          locale === 'ar'
            ? 'رقم الموبايل أو كلمة المرور غير صحيحة'
            : 'Invalid phone number or password'
        );
        setIsLoggingIn(false);
        return;
      }

      setClientRoleCookie('customer');
      router.push('/my-places');
    } catch {
      setLoginError(t('common.error') || 'حدث خطأ غير متوقع');
      setIsLoggingIn(false);
    }
  };

  // 2. Handle Phone-based Customer Signup (No Email required)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim() || !signupPassword) return;

    if (!consentGiven) {
      setSignupError(t('signup.consentRequired') || 'الموافقة على الشروط إلزامية');
      return;
    }

    const nameVal = validateName(name);
    if (!nameVal.isValid) {
      setSignupError(t(`validation.${nameVal.errorKey}`) || nameVal.errorMessage || 'برجاء إدخال اسم صحيح');
      return;
    }

    const phoneVal = validateEgyptianPhone(phoneNumber);
    if (!phoneVal.isValid) {
      setSignupError(t(`validation.${phoneVal.errorKey}`) || phoneVal.errorMessage || 'رقم التليفون غير صحيح');
      return;
    }

    const passVal = validatePassword(signupPassword);
    if (!passVal.isValid) {
      setSignupError(t(`validation.${passVal.errorKey}`) || passVal.errorMessage || 'يجب ألا تقل كلمة المرور عن 8 خانات وتحتوي على حرف ورقم');
      return;
    }

    if (signupPassword !== confirmPassword) {
      setSignupError(t('validation.passwords_not_matching') || 'كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSigningUp(true);
    setSignupError(null);
    setExistingQrToken(null);

    try {
      const cleanPhone = phoneVal.cleanPhone;
      const res = await fetch('/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: tenantBusiness?.id,
          subdomain: tenantBusiness?.subdomain,
          name: nameVal.value,
          phoneNumber: cleanPhone,
          password: signupPassword,
          consentGiven: true,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'PHONE_ALREADY_EXISTS') {
          setSignupError(t('signup.phoneExistsError') || 'رقم الهاتف مسجل بالفعل');
          if (data.qrToken) {
            setExistingQrToken(data.qrToken);
          }
          setIsSigningUp(false);
          return;
        }
        throw new Error(data.error || t('common.error'));
      }

      setSignupSuccess(true);
      setClientRoleCookie('customer');

      const token = data.customer?.qrToken;
      setTimeout(() => {
        if (token) {
          router.push(`/card/${token}`);
        } else {
          router.push('/my-places');
        }
      }, 1200);
    } catch (err: any) {
      setSignupError(err.message || t('common.error'));
    } finally {
      setIsSigningUp(false);
    }
  };

  // 3. Quick Card Lookup
  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupCode.trim()) return;
    const cleanToken = extractCustomerToken(lookupCode.trim());
    router.push(`/card/${cleanToken}`);
  };

  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 transition-colors">
      {/* Top Bar Navigation */}
      <header className="flex items-center justify-between w-full max-w-md pt-2 pb-4 relative z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
          <span className="text-xs font-mono font-medium tracking-wider uppercase text-[var(--color-text)]">
            Pointat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Authentication Card */}
      <div className="max-w-md w-full flex flex-col my-auto py-6 relative z-10">
        <div className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 sm:p-8 text-center transition-all">
          {/* Brand Icon Header */}
          <div 
            className="w-12 h-12 mx-auto mb-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] transition-transform"
          >
          {tenantBusiness ? (
            <Storefront size={24} weight="light" />
          ) : (
            <Star size={24} weight="light" />
          )}
          </div>

          <h1 className="text-xl sm:text-2xl font-light tracking-[-0.6px] mb-1 text-[var(--color-text)]">
            {tenantBusiness
              ? t('home.tenantWelcome', { name: tenantBusiness.name })
              : 'Pointat'}
          </h1>
          <p className="text-xs mb-5 text-[var(--color-text-muted)]">
            {activeTab === 'login'
              ? (locale === 'ar' ? 'سجل دخولك برقم الموبايل للوصول إلى نقاطك وبطاقاتك' : 'Sign in with your phone number to access your points')
              : (locale === 'ar' ? 'أنشئ حسابك الجديد برقم الموبايل وابدأ بجمع المكافآت' : 'Create your account with your mobile number to earn rewards')}
          </p>

          {/* Segmented Mode Switcher */}
          <div 
            className="grid grid-cols-2 p-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] mb-6"
          >
            <button
              type="button"
              id="tab-login"
              onClick={() => { setActiveTab('login'); setLoginError(null); }}
              className={`py-1.5 rounded-[4px] text-xs font-mono uppercase font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'login' 
                  ? 'bg-[var(--color-accent)] text-white shadow-xs' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <User size={15} weight="light" />
              <span>{t('home.loginTab')}</span>
            </button>
            <button
              type="button"
              id="tab-signup"
              onClick={() => { setActiveTab('signup'); setSignupError(null); }}
              className={`py-1.5 rounded-[4px] text-xs font-mono uppercase font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'signup' 
                  ? 'bg-[var(--color-accent)] text-white shadow-xs' 
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Star size={15} weight="light" />
              <span>{t('home.signupTab')}</span>
            </button>
          </div>

          {/* TAB 1: تسجيل الدخول (Sign In - Phone + Password) */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {loginError && (
                <div 
                  className="p-3 rounded-[4px] text-xs font-mono flex items-center gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-error-bg)',
                    borderColor: 'var(--color-error-border)',
                    color: 'var(--color-error-text)'
                  }}
                >
                  <WarningCircle size={16} weight="light" className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Mobile Number */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="login-phone-input">
                  {locale === 'ar' ? 'رقم الموبايل' : 'Phone Number'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="tel"
                    id="login-phone-input"
                    required
                    maxLength={11}
                    placeholder="01xxxxxxxxx"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    dir="ltr"
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <Phone size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {loginPhone && !validateEgyptianPhone(loginPhone).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-mono">
                    {t(`validation.${validateEgyptianPhone(loginPhone).errorKey}`) || 'رقم التليفون لازم يبدأ بـ 01 ويتكون من 11 رقماً'}
                  </p>
                )}
              </div>

              {/* Password with Eye Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]" htmlFor="login-password-input">
                    {locale === 'ar' ? 'كلمة المرور' : 'Password'}
                  </label>
                  <Link 
                    href="/forgot-password"
                    className="text-[11px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    {t('customerLogin.forgotPassword')}
                  </Link>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    id="login-password-input"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity cursor-pointer`}
                    aria-label="Toggle password visibility"
                  >
                    {showLoginPassword ? <EyeSlash size={16} weight="light" /> : <Eye size={16} weight="light" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoggingIn || !loginPhone.trim() || !loginPassword}
                className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-opacity"
              >
                {isLoggingIn ? (
                  <>
                    <CircleNotch size={16} weight="light" className="animate-spin" />
                    <span>{t('home.signingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.loginTab')}</span>
                    <ArrowRight size={16} weight="light" className={isRtl ? 'rotate-180' : ''} />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs font-mono text-[var(--color-text-muted)]">
                <span>{t('home.newCustomerPrompt')} </span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('signup'); setSignupError(null); }}
                  className="font-medium underline cursor-pointer text-[var(--color-text)] hover:text-[var(--color-accent)]"
                >
                  {t('home.createAccountNow')}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: حساب جديد (Sign Up - Phone + Mandatory Password) */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignup} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {signupError && (
                <div 
                  className="p-3 rounded-[4px] text-xs font-mono flex flex-col gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-error-bg)',
                    borderColor: 'var(--color-error-border)',
                    color: 'var(--color-error-text)'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <WarningCircle size={16} weight="light" className="shrink-0" />
                    <span>{signupError}</span>
                  </div>
                  {existingQrToken && (
                    <Link
                      href={`/card/${existingQrToken}`}
                      className="text-xs font-medium underline mt-1"
                    >
                      {locale === 'ar' ? 'عرض بطاقتي المسجلة مسبقاً ←' : 'View my registered card →'}
                    </Link>
                  )}
                </div>
              )}

              {signupSuccess && (
                <div 
                  className="p-3 rounded-[4px] text-xs font-mono flex items-center gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-success-bg)',
                    borderColor: 'var(--color-success-border)',
                    color: 'var(--color-success-text)'
                  }}
                >
                  <Check size={16} weight="light" className="shrink-0" />
                  <span>{t('signup.successRedirect')}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="signup-name-input">
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
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <User size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {name && !validateName(name).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-mono">
                    {t(`validation.${validateName(name).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="signup-phone-input">
                  {t('home.phoneHint')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="tel"
                    id="signup-phone-input"
                    required
                    maxLength={11}
                    placeholder={t('signup.phonePlaceholder')}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    dir="ltr"
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <Phone size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {phoneNumber && !validateEgyptianPhone(phoneNumber).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-mono">
                    {t(`validation.${validateEgyptianPhone(phoneNumber).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Password (MANDATORY) with Eye Toggle */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="signup-password-input">
                  {locale === 'ar' ? 'كلمة المرور (8 خانات على الأقل - حرف ورقم)' : 'Password (min 8 characters - letter & number)'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    id="signup-password-input"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity cursor-pointer`}
                    aria-label="Toggle password visibility"
                  >
                    {showSignupPassword ? <EyeSlash size={16} weight="light" /> : <Eye size={16} weight="light" />}
                  </button>
                </div>
                {signupPassword && !validatePassword(signupPassword).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-mono">
                    {t(`validation.${validatePassword(signupPassword).errorKey}`) || 'يجب ألا تقل كلمة المرور عن 8 خانات وتحتوي على حرف ورقم'}
                  </p>
                )}
              </div>

              {/* Confirm Password with Eye Toggle */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="signup-confirm-password-input">
                  {locale === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="signup-confirm-password-input"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity cursor-pointer`}
                    aria-label="Toggle confirm password visibility"
                  >
                    {showConfirmPassword ? <EyeSlash size={16} weight="light" /> : <Eye size={16} weight="light" />}
                  </button>
                </div>
                {confirmPassword && signupPassword !== confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1 font-mono">
                    {t('validation.passwords_not_matching') || 'كلمتا المرور غير متطابقتين'}
                  </p>
                )}
              </div>

              {/* Referral Code (Optional) */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5" htmlFor="signup-referral-input">
                  {t('signup.referralCodeLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="signup-referral-input"
                    placeholder={t('signup.referralCodePlaceholder')}
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    className="w-full h-10 px-3 pe-10 rounded-[4px] font-mono text-xs uppercase border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <Gift size={16} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
              </div>

              {/* Mandatory Consent Checkbox */}
              <div 
                className="p-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-start gap-2.5"
              >
                <input
                  type="checkbox"
                  id="signup-consent-checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded-[2px] cursor-pointer shrink-0"
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <label 
                  htmlFor="signup-consent-checkbox" 
                  className="text-[11px] text-[var(--color-text-muted)] leading-relaxed cursor-pointer select-none"
                >
                  {t('home.consentCheckbox')}
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="signup-submit-btn"
                disabled={isSigningUp || !name.trim() || !phoneNumber.trim() || !signupPassword || !confirmPassword || !consentGiven}
                className="w-full h-10 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-1 transition-opacity"
              >
                {isSigningUp ? (
                  <>
                    <CircleNotch size={16} weight="light" className="animate-spin" />
                    <span>{t('home.creatingAccount')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.createAccountBtn')}</span>
                    <ArrowRight size={16} weight="light" className={isRtl ? 'rotate-180' : ''} />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs font-mono text-[var(--color-text-muted)]">
                <span>{t('home.alreadyCustomerPrompt')} </span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setLoginError(null); }}
                  className="font-medium underline cursor-pointer text-[var(--color-text)] hover:text-[var(--color-accent)]"
                >
                  {t('home.signInNow')}
                </button>
              </div>
            </form>
          )}

          {/* Collapsible Direct Card Lookup (9-character code) */}
          <div className="mt-6 pt-4 border-t border-[var(--color-separator)]">
            <button
              type="button"
              onClick={() => setShowLookup(!showLookup)}
              className="text-[11px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              <span>{t('home.haveQuickCode')}</span>
              {showLookup ? <CaretUp size={14} weight="light" /> : <CaretDown size={14} weight="light" />}
            </button>

            {showLookup && (
              <form onSubmit={handleLookupSubmit} className="mt-3 w-full animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={lookupCode}
                      onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                      placeholder={t('home.quickCodePlaceholder')}
                      dir={isRtl ? 'rtl' : 'ltr'}
                      className={`w-full h-10 px-3 pe-8 rounded-[4px] font-mono text-xs uppercase border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]`}
                    />
                    <MagnifyingGlass size={16} weight="light" className={`absolute top-1/2 -translate-y-1/2 opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                  </div>
                  <button
                    type="submit"
                    disabled={!lookupCode.trim()}
                    className="h-10 px-3.5 rounded-[4px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 disabled:opacity-50 shrink-0 transition-opacity"
                  >
                    {t('home.viewCardBtn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-[11px] opacity-40 py-2 relative z-10">
        {t('home.footerNote')}
      </footer>
    </main>
  );
}
