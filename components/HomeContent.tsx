'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Star, Mail, Lock, User, Phone, Gift, 
  Check, AlertCircle, RefreshCw, Eye, EyeOff,
  Search, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
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

  // ──────────────────────────────────────────
  // 1. Handle Login
  // ──────────────────────────────────────────
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

      // Phase 29: Mandatory OTP Email Verification Guard
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
      setLoginError(t('common.error') || 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      setIsLoggingIn(false);
    }
  };

  // ──────────────────────────────────────────
  // 2. Handle Signup
  // ──────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim()) return;

    if (!consentGiven) {
      setSignupError(t('signup.consentRequired') || 'يجب الموافقة على شروط التسجيل للمتابعة.');
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

    if (signupEmail) {
      const emailVal = validateEmail(signupEmail);
      if (!emailVal.isValid) {
        setSignupError(t(`validation.${emailVal.errorKey}`) || emailVal.errorMessage || 'برجاء إدخال بريد إلكتروني صحيح');
        return;
      }
    }

    if (signupPassword) {
      const passVal = validatePassword(signupPassword);
      if (!passVal.isValid) {
        setSignupError(t(`validation.${passVal.errorKey}`) || passVal.errorMessage || 'كلمة المرور يجب أن لا تقل عن 8 خانات وتحتوي حرفاً ورقماً.');
        return;
      }
    }

    const cleanPhone = phoneVal.cleanPhone;

    setIsSigningUp(true);
    setSignupError(null);

    try {
      const res = await fetch('/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: tenantBusiness?.id,
          subdomain: tenantBusiness?.subdomain,
          name: name.trim(),
          phoneNumber: cleanPhone,
          email: signupEmail.trim().toLowerCase() || undefined,
          password: signupPassword || undefined,
          referralCode: referralCode.trim() || undefined,
          consentGiven: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'EMAIL_ALREADY_EXISTS') {
          setSignupError(t('home.emailAlreadyExists'));
          return;
        }
        if (data.code === 'PHONE_ALREADY_EXISTS') {
          setSignupError(t('home.phoneAlreadyExists'));
          return;
        }
        throw new Error(data.error || t('common.error'));
      }

      setSignupSuccess(true);

      // Phase 29: If registered with email/password, redirect to OTP verification
      if (data.requiresVerification && signupEmail.trim()) {
        const phoneParam = cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : '';
        const otpParam = data.simulatedOtp ? `&simulatedOtp=${encodeURIComponent(data.simulatedOtp)}` : '';
        setTimeout(() => {
          router.push(`/verify-email?email=${encodeURIComponent(signupEmail.trim().toLowerCase())}&role=customer${phoneParam}${otpParam}`);
        }, 1200);
        return;
      }

      // If registered with phone only, redirect to their card
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

  // ──────────────────────────────────────────
  // 3. Quick Lookup
  // ──────────────────────────────────────────
  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractCustomerToken(lookupCode);
    if (clean) {
      router.push(`/card/${clean}`);
    }
  };

  return (
    <main 
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 text-center transition-colors duration-300 relative overflow-hidden" 
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
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%)',
        bottom: '-120px',
        left: '-120px',
        pointerEvents: 'none',
      }} />

      {/* Top Header */}
      <header className="w-full max-w-md flex items-center justify-between py-2 border-b pb-4 relative z-10" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-md"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #4ECDC4)', color: '#fff' }}
          >
            ★
          </div>
          <span 
            className="text-sm font-bold tracking-wider uppercase"
            style={{ color: '#6C63FF' }}
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
        <div 
          className="w-full p-6 sm:p-8 rounded-3xl shadow-2xl border text-center transition-all backdrop-blur-xl"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          {/* Brand Icon Header */}
          <div 
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg"
            style={{ 
              background: 'linear-gradient(135deg, #6C63FF, #4ECDC4)', 
              color: '#fff',
              boxShadow: '0 8px 25px rgba(108,99,255,0.35)'
            }}
          >
            <Star className="w-7 h-7 fill-white" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
            {tenantBusiness ? tenantBusiness.name : 'Pointat'}
          </h1>
          <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
            {activeTab === 'login'
              ? t('home.loginSubtitle')
              : t('home.signupSubtitle')}
          </p>

          {/* Segmented Mode Switcher (Login vs Sign Up) */}
          <div 
            className="grid grid-cols-2 p-1 rounded-2xl border mb-6"
            style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              id="tab-login"
              onClick={() => { setActiveTab('login'); setLoginError(null); }}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'login' ? 'btn-gradient shadow-md' : 'opacity-70 hover:opacity-100 text-slate-300'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{t('home.loginTab')}</span>
            </button>
            <button
              type="button"
              id="tab-signup"
              onClick={() => { setActiveTab('signup'); setSignupError(null); }}
              className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'signup' ? 'btn-gradient shadow-md' : 'opacity-70 hover:opacity-100 text-slate-300'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span>{t('home.signupTab')}</span>
            </button>
          </div>

          {/* =====================================================================
              TAB 1: تسجيل الدخول (Sign In)
             ===================================================================== */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {loginError && (
                <div 
                  className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${isRtl ? 'text-right' : 'text-left'}`}
                  style={{
                    backgroundColor: 'rgba(248, 113, 113, 0.12)',
                    borderColor: 'rgba(248, 113, 113, 0.25)',
                    color: '#F87171'
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <Mail className={`w-4 h-4 absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {loginEmail && !validateEmail(loginEmail).isValid && (
                  <p className="text-[11px] text-red-400 mt-1 font-medium">
                    {t(`validation.${validateEmail(loginEmail).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs opacity-75 font-medium">
                    {t('customerLogin.passwordLabel')}
                  </label>
                  <Link 
                    href="/forgot-password"
                    className="text-[11px] font-medium text-teal-400 hover:underline opacity-90"
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity`}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoggingIn || !loginEmail.trim() || !loginPassword}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold transition-all shadow-lg mt-2 flex items-center justify-center gap-1.5 disabled:opacity-50 btn-gradient"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('home.signingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.loginTab')}</span>
                    <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-400">{t('home.newCustomerPrompt')}</span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('signup'); setSignupError(null); }}
                  className="text-xs font-bold text-teal-400 hover:underline"
                >
                  {t('home.createAccountNow')}
                </button>
              </div>
            </form>
          )}

          {/* =====================================================================
              TAB 2: حساب جديد (Sign Up)
             ===================================================================== */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignup} className={`flex flex-col gap-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
              {signupError && (
                <div 
                  className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${isRtl ? 'text-right' : 'text-left'}`}
                  style={{
                    backgroundColor: 'rgba(248, 113, 113, 0.12)',
                    borderColor: 'rgba(248, 113, 113, 0.25)',
                    color: '#F87171'
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{signupError}</span>
                </div>
              )}

              {signupSuccess && (
                <div 
                  className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${isRtl ? 'text-right' : 'text-left'}`}
                  style={{
                    backgroundColor: 'rgba(52, 211, 153, 0.12)',
                    borderColor: 'rgba(52, 211, 153, 0.25)',
                    color: '#34D399'
                  }}
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{t('signup.successRedirect')}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <User className={`w-4 h-4 absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {name && !validateName(name).isValid && (
                  <p className="text-[11px] text-red-400 mt-1 font-medium">
                    {t(`validation.${validateName(name).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all font-mono ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <Phone className={`w-4 h-4 absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {phoneNumber && !validateEgyptianPhone(phoneNumber).isValid && (
                  <p className="text-[11px] text-red-400 mt-1 font-medium">
                    {t(`validation.${validateEgyptianPhone(phoneNumber).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <Mail className={`w-4 h-4 absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
                {signupEmail && !validateEmail(signupEmail).isValid && (
                  <p className="text-[11px] text-red-400 mt-1 font-medium">
                    {t(`validation.${validateEmail(signupEmail).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
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
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute ${isRtl ? 'left-3' : 'right-3'} opacity-50 hover:opacity-100 transition-opacity`}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {signupPassword && !validatePassword(signupPassword).isValid && (
                  <p className="text-[11px] text-red-400 mt-1 font-medium">
                    {t(`validation.${validatePassword(signupPassword).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Referral Code (Optional) */}
              <div>
                <label className="block text-xs opacity-75 font-medium mb-1">
                  {t('signup.referralCodeLabel')}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="signup-referral-input"
                    placeholder={t('signup.referralCodePlaceholder')}
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-none uppercase font-mono transition-all ${isRtl ? 'pl-9' : 'pr-9'}`}
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                      borderColor: 'rgba(255, 255, 255, 0.1)', 
                      color: '#FFFFFF' 
                    }}
                  />
                  <Gift className={`w-4 h-4 absolute ${isRtl ? 'left-3' : 'right-3'} opacity-40 pointer-events-none`} />
                </div>
              </div>

              {/* Mandatory Consent Checkbox */}
              <div 
                className={`p-3 rounded-2xl border flex items-start gap-2.5 ${isRtl ? 'text-right' : 'text-left'}`}
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
              >
                <input
                  type="checkbox"
                  id="signup-consent-checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded cursor-pointer shrink-0"
                  style={{ accentColor: '#6C63FF' }}
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
                className="w-full py-3 px-4 rounded-xl text-xs font-bold transition-all shadow-lg mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50 btn-gradient"
              >
                {isSigningUp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('home.creatingAccount')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('home.createAccountBtn')}</span>
                    <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-400">{t('home.alreadyCustomerPrompt')}</span>
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setLoginError(null); }}
                  className="text-xs font-bold text-teal-400 hover:underline"
                >
                  {t('home.signInNow')}
                </button>
              </div>
            </form>
          )}

          {/* Collapsible Direct Card Lookup (9-character code) */}
          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              onClick={() => setShowLookup(!showLookup)}
              className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1 mx-auto"
            >
              <span>{t('home.haveQuickCode')}</span>
              {showLookup ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
                      className={`w-full py-2.5 px-3 rounded-xl text-xs border transition-all focus:outline-none focus:ring-1 text-white uppercase tracking-wider ${lookupCode ? 'font-mono' : ''} ${isRtl ? 'pr-8 pl-3 text-right' : 'pl-8 pr-3 text-left'}`}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                      }}
                    />
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 opacity-40 text-slate-400 ${isRtl ? 'right-2.5' : 'left-2.5'}`} />
                  </div>
                  <button
                    type="submit"
                    disabled={!lookupCode.trim()}
                    className="py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 border shrink-0 text-white"
                    style={{
                      backgroundColor: 'rgba(108, 99, 255, 0.2)',
                      borderColor: 'rgba(108, 99, 255, 0.4)',
                      color: '#A5B4FC',
                    }}
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
      <footer className="text-[11px] opacity-50 py-2 text-slate-400 relative z-10">
        {t('home.footerNote')}
      </footer>
    </main>
  );
}
