'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Star, EnvelopeSimple, Lock, User, Phone, Gift, 
  Check, WarningCircle, CircleNotch, Eye, EyeSlash,
  MagnifyingGlass, ArrowRight, CaretDown, CaretUp 
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { supabase } from '@/lib/supabase';
import { extractCustomerToken } from '@/lib/tokens';
import { 
  validateEgyptianPhone, 
  validateEmail, 
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

export default function HomeContent({ 
  tenantBusiness = null, 
  isSelfSignupEnabled = true 
}: HomeContentProps) {
  const router = useRouter();
  const { t, isRtl } = useLocale();

  // Mode: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Signup Form States
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Quick Card Lookup State
  const [showLookup, setShowLookup] = useState(false);
  const [lookupCode, setLookupCode] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Check if session already exists for customer -> redirect to my-places
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.push('/my-places');
      }
    });
  }, [router]);

  // 1. Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;

    const emailVal = validateEmail(loginEmail);
    if (!emailVal.isValid) {
      setLoginError(t(`validation.${emailVal.errorKey}`) || emailVal.errorMessage || 'برجاء إدخال بريد إلكتروني صحيح');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (authError || !authData.user) {
        setLoginError(t('customerLogin.loginFailed') || 'فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.');
        setIsLoggingIn(false);
        return;
      }

      // Mandatory OTP Email Verification Guard
      const isEmailVerified = authData.user.user_metadata?.email_verified === true || (Boolean(authData.user.email_confirmed_at) && authData.user.user_metadata?.email_verified !== false);
      if (!isEmailVerified) {
        await supabase.auth.signOut();
        fetch('/api/auth/send-verification-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail.trim().toLowerCase() }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(loginEmail.trim().toLowerCase())}&role=customer&pending=1`);
        return;
      }

      router.push('/my-places');
    } catch {
      setLoginError(t('common.error'));
      setIsLoggingIn(false);
    }
  };

  // 2. Handle Self-Signup
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim()) return;

    if (!consentGiven) {
      setSignupError(t('signup.consentRequired'));
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

    if (signupEmail.trim()) {
      const emailVal = validateEmail(signupEmail);
      if (!emailVal.isValid) {
        setSignupError(t(`validation.${emailVal.errorKey}`) || emailVal.errorMessage || 'بريد إلكتروني غير صالح');
        return;
      }
    }

    if (signupPassword) {
      const passVal = validatePassword(signupPassword);
      if (!passVal.isValid) {
        setSignupError(t(`validation.${passVal.errorKey}`) || passVal.errorMessage || 'كلمة المرور يجب أن تكون 6 خانات على الأقل');
        return;
      }
    }

    setIsSigningUp(true);
    setSignupError(null);

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
          email: signupEmail.trim() ? signupEmail.trim().toLowerCase() : undefined,
          password: signupPassword || undefined,
          consentGiven: true,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'PHONE_ALREADY_EXISTS') {
          setSignupError(t('signup.phoneExistsError') || 'رقم الهاتف مسجل بالفعل');
          return;
        }
        if (data.code === 'EMAIL_ALREADY_EXISTS') {
          setSignupError('البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.');
          return;
        }
        throw new Error(data.error || t('common.error'));
      }

      setSignupSuccess(true);

      if (data.requiresVerification && signupEmail.trim()) {
        const phoneParam = cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : '';
        const otpParam = data.simulatedOtp ? `&simulatedOtp=${encodeURIComponent(data.simulatedOtp)}` : '';
        setTimeout(() => {
          router.push(`/verify-email?email=${encodeURIComponent(signupEmail.trim().toLowerCase())}&role=customer${phoneParam}${otpParam}`);
        }, 1200);
        return;
      }

      const token = data.customer?.qrToken;
      setTimeout(() => {
        if (token) {
          router.push(`/card/${token}`);
        } else {
          router.push('/my-places');
        }
      }, 1500);
    } catch (err: any) {
      setSignupError(err.message || t('common.error'));
    } finally {
      setIsSigningUp(false);
    }
  };

  // 3. Quick Lookup
  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractCustomerToken(lookupCode);
    if (clean) {
      router.push(`/card/${clean}`);
    }
  };

  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 text-center transition-colors relative overflow-hidden">
      {/* Top Header */}
      <header className="w-full max-w-md flex items-center justify-between py-2 border-b pb-4 relative z-10" style={{ borderColor: 'var(--color-separator)' }}>
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          >
            <Star size={16} weight="fill" />
          </div>
          <span 
            className="text-sm font-bold tracking-wider uppercase"
            style={{ color: 'var(--color-text)' }}
          >
            {t('home.brandName')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Authentication Card */}
      <div className="max-w-md w-full flex flex-col my-auto py-6 relative z-10">
        <div className="glass-card w-full p-6 sm:p-8 text-center transition-all">
          {/* Brand Icon Header */}
          <div 
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center shadow-md transition-transform"
            style={{ 
              backgroundColor: 'var(--color-accent)', 
              color: 'var(--color-accent-text)',
            }}
          >
            <Star size={28} weight="fill" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
            {tenantBusiness ? tenantBusiness.name : 'Pointat'}
          </h1>
          <p className="text-xs mb-5 opacity-60">
            {activeTab === 'login'
              ? t('home.loginSubtitle')
              : t('home.signupSubtitle')}
          </p>

          {/* Segmented Mode Switcher (iOS style segmented tab) */}
          <div 
            className="grid grid-cols-2 p-1 rounded-2xl border mb-6"
            style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              id="tab-login"
              onClick={() => { setActiveTab('login'); setLoginError(null); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'login' 
                  ? 'shadow-xs' 
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={activeTab === 'login' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : { color: 'var(--color-text)' }}
            >
              <User size={16} weight="light" />
              <span>{t('home.loginTab')}</span>
            </button>
            <button
              type="button"
              id="tab-signup"
              onClick={() => { setActiveTab('signup'); setSignupError(null); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'signup' 
                  ? 'shadow-xs' 
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={activeTab === 'signup' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : { color: 'var(--color-text)' }}
            >
              <Star size={16} weight="light" />
              <span>{t('home.signupTab')}</span>
            </button>
          </div>

          {/* TAB 1: تسجيل الدخول (Sign In) */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {loginError && (
                <div 
                  className="p-3 rounded-xl text-xs font-medium flex items-center gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-error-bg)',
                    borderColor: 'var(--color-error-border)',
                    color: 'var(--color-error-text)'
                  }}
                >
                  <WarningCircle size={18} weight="light" className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="login-email-input">
                  {t('customerLogin.emailLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    id="login-email-input"
                    required
                    placeholder={t('customerLogin.emailPlaceholder')}
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    dir="ltr"
                    className="ios-input"
                  />
                  <EnvelopeSimple size={18} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {loginEmail && !validateEmail(loginEmail).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">
                    {t(`validation.${validateEmail(loginEmail).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs opacity-75 font-semibold" htmlFor="login-password-input">
                    {t('customerLogin.passwordLabel')}
                  </label>
                  <Link 
                    href="/forgot-password"
                    className="text-[11px] font-medium opacity-80 hover:opacity-100"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {t('customerLogin.forgotPassword')}
                  </Link>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password-input"
                    required
                    placeholder={t('customerLogin.passwordPlaceholder')}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="ios-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity cursor-pointer`}
                  >
                    {showPassword ? <EyeSlash size={18} weight="light" /> : <Eye size={18} weight="light" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoggingIn || !loginEmail.trim() || !loginPassword}
                className="ios-btn-primary w-full mt-2"
              >
                {isLoggingIn ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('home.signingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.loginTab')}</span>
                    <ArrowRight size={18} weight="light" className={isRtl ? 'rotate-180' : ''} />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs">
                <span className="opacity-60">{t('home.newCustomerPrompt')} </span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('signup'); setSignupError(null); }}
                  className="font-bold underline cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                >
                  {t('home.createAccountNow')}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: حساب جديد (Sign Up) */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignup} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {signupError && (
                <div 
                  className="p-3 rounded-xl text-xs font-medium flex items-center gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-error-bg)',
                    borderColor: 'var(--color-error-border)',
                    color: 'var(--color-error-text)'
                  }}
                >
                  <WarningCircle size={18} weight="light" className="shrink-0" />
                  <span>{signupError}</span>
                </div>
              )}

              {signupSuccess && (
                <div 
                  className="p-3 rounded-xl text-xs font-medium flex items-center gap-2 border"
                  style={{
                    backgroundColor: 'var(--color-success-bg)',
                    borderColor: 'var(--color-success-border)',
                    color: 'var(--color-success-text)'
                  }}
                >
                  <Check size={18} weight="light" className="shrink-0" />
                  <span>{t('signup.successRedirect')}</span>
                </div>
              )}

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

              {/* Email */}
              <div>
                <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="signup-email-input">
                  {t('customerLogin.emailLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    id="signup-email-input"
                    required
                    placeholder={t('customerLogin.emailPlaceholder')}
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    dir="ltr"
                    className="ios-input"
                  />
                  <EnvelopeSimple size={18} weight="light" className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {signupEmail && !validateEmail(signupEmail).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">
                    {t(`validation.${validateEmail(signupEmail).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs opacity-75 font-semibold mb-1.5" htmlFor="signup-password-input">
                  {t('home.passwordMinHint')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="signup-password-input"
                    required
                    minLength={6}
                    placeholder={t('customerLogin.passwordPlaceholder')}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="ios-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity cursor-pointer`}
                  >
                    {showPassword ? <EyeSlash size={18} weight="light" /> : <Eye size={18} weight="light" />}
                  </button>
                </div>
                {signupPassword && !validatePassword(signupPassword).isValid && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">
                    {t(`validation.${validatePassword(signupPassword).errorKey}`)}
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
                  {t('home.consentCheckbox')}
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="signup-submit-btn"
                disabled={isSigningUp || !name.trim() || !phoneNumber.trim() || !signupEmail.trim() || !signupPassword || !consentGiven}
                className="ios-btn-primary w-full mt-1"
              >
                {isSigningUp ? (
                  <>
                    <CircleNotch size={18} weight="light" className="animate-spin" />
                    <span>{t('home.creatingAccount')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.createAccountBtn')}</span>
                    <ArrowRight size={18} weight="light" className={isRtl ? 'rotate-180' : ''} />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs">
                <span className="opacity-60">{t('home.alreadyCustomerPrompt')} </span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setLoginError(null); }}
                  className="font-bold underline cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                >
                  {t('home.signInNow')}
                </button>
              </div>
            </form>
          )}

          {/* Collapsible Direct Card Lookup (9-character code) */}
          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--color-separator)' }}>
            <button
              type="button"
              onClick={() => setShowLookup(!showLookup)}
              className="text-[11px] opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center gap-1 mx-auto cursor-pointer"
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
                      className={`ios-input uppercase ${lookupCode ? 'font-mono' : ''}`}
                    />
                    <MagnifyingGlass size={16} weight="light" className={`absolute top-1/2 -translate-y-1/2 opacity-40 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                  </div>
                  <button
                    type="submit"
                    disabled={!lookupCode.trim()}
                    className="ios-btn-primary py-2.5 px-3.5 text-xs shrink-0"
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
