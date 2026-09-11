'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, User, Phone, Globe, Headphones, 
  Save, RefreshCw, Check, AlertCircle, MessageCircle,
  Bell, BellOff, History, Share2, Copy, Gift, MessageSquare,
  Trash2, AlertTriangle, X
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { validateName, validateEgyptianPhone, formatEgyptianPhoneToInternational } from '@/lib/validation';

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { locale, setLocale, t, isRtl } = useLocale();

  const [customer, setCustomer] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationChannel, setNotificationChannel] = useState<'all' | 'whatsapp' | 'sms' | 'none'>('all');
  const [isUpdatingNotif, setIsUpdatingNotif] = useState(false);
  const [isUpdatingChannel, setIsUpdatingChannel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Single card deletion state
  const [showCardDeleteModal, setShowCardDeleteModal] = useState(false);
  const [isDeletingCard, setIsDeletingCard] = useState(false);
  const [deleteCardError, setDeleteCardError] = useState<string | null>(null);

  const handleDeleteCard = async () => {
    if (!token) return;
    setIsDeletingCard(true);
    setDeleteCardError(null);
    try {
      const res = await fetch(`/api/customer/${token}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('accountDeletion.deleteError'));
      }
      router.push('/my-places');
    } catch (err: any) {
      setDeleteCardError(err.message || t('accountDeletion.deleteError'));
    } finally {
      setIsDeletingCard(false);
    }
  };

  // Load Customer Data
  useEffect(() => {
    async function loadCustomerData() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/customer/${token}`);
        const data = await res.json();
        if (data.success && data.customer) {
          setCustomer(data.customer);
          setName(data.customer.name || '');
          setPhone(data.customer.phone_number || '');
          setNotificationsEnabled(data.customer.notifications_enabled !== false);
          if (data.customer.notification_channel) {
            setNotificationChannel(data.customer.notification_channel);
          } else if (data.customer.notifications_enabled === false) {
            setNotificationChannel('none');
          } else {
            setNotificationChannel('all');
          }
        }
      } catch (err) {
        console.error('Error loading customer:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadCustomerData();
  }, [token]);

  // Phase 16.9 & 30: Toggle customer notification preferences
  const handleToggleNotifications = async () => {
    if (!token) return;
    const nextVal = !notificationsEnabled;
    const nextChannel = nextVal ? 'all' : 'none';
    setNotificationsEnabled(nextVal);
    setNotificationChannel(nextChannel);
    setIsUpdatingNotif(true);

    try {
      const res = await fetch(`/api/customer/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notificationsEnabled: nextVal,
          notificationChannel: nextChannel,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update preferences');
      }

      setFeedback({
        type: 'success',
        text: nextVal ? t('accountNotifications.optInSuccess') : t('accountNotifications.optOutSuccess'),
      });
    } catch (err: any) {
      setNotificationsEnabled(!nextVal);
      setNotificationChannel(!nextVal ? 'all' : 'none');
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsUpdatingNotif(false);
    }
  };

  // Phase 30: Change preferred notification channel
  const handleChannelChange = async (newChannel: 'all' | 'whatsapp' | 'sms' | 'none') => {
    if (!token) return;
    setNotificationChannel(newChannel);
    setIsUpdatingChannel(true);

    try {
      const res = await fetch(`/api/customer/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notificationChannel: newChannel,
          notificationsEnabled: newChannel !== 'none',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update preferences');
      }
      setNotificationsEnabled(newChannel !== 'none');
      setFeedback({
        type: 'success',
        text: t('accountNotifications.channelUpdated'),
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsUpdatingChannel(false);
    }
  };

  // Validation status
  const nameValidation = validateName(name);
  const phoneValidation = phone.trim() ? validateEgyptianPhone(phone) : { isValid: true, stage: 'empty' as const, errorKey: undefined };

  // Save profile changes (Name and Phone)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    if (!token) return;

    if (!nameValidation.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${nameValidation.errorKey}`) });
      return;
    }

    if (phone.trim() && !phoneValidation.isValid) {
      setPhoneTouched(true);
      setFeedback({ type: 'error', text: t(`validation.${phoneValidation.errorKey}`) });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/customer/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phoneNumber: phone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('account.saveFailed'));
      }

      setFeedback({ type: 'success', text: t('account.savedSuccess') });
      setCustomer((prev: any) => ({ ...prev, name: name.trim(), phone_number: phone.trim() }));
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Switch Language
  const handleLanguageChange = (lang: 'ar' | 'en') => {
    setLocale(lang);
    setFeedback({
      type: 'success',
      text: lang === 'ar' ? t('account.langChangedAr') : t('account.langChangedEn'),
    });
  };

  // 19.5: Copy referral code
  const handleCopyReferral = async () => {
    if (!customer?.referral_code) return;
    try {
      await navigator.clipboard.writeText(customer.referral_code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy referral code:', err);
    }
  };

  // 19.5: Share referral code via Web Share API or clipboard
  const handleShareReferral = async () => {
    if (!customer?.referral_code) return;
    const shareText = t('account.shareMessage', {
      business: customer.business_name || t('account.defaultBusiness'),
      code: customer.referral_code,
    });

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: customer.business_name || 'Pointat',
          text: shareText,
        });
        return;
      } catch {
        // Fallback to copy if cancelled or unsupported
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy share text:', err);
    }
  };

  const backUrl = token ? `/card/${token}` : '/';

  return (
    <div className="w-full max-w-sm flex flex-col flex-1 py-2 relative z-10">
      {/* Header */}
      <header className="flex items-center justify-between w-full pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <Link
          href={backUrl}
          aria-label={t('common.back')}
          className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm border transition-transform active:scale-95"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            color: 'var(--color-accent)',
            borderColor: 'var(--color-border)',
          }}
        >
          <ArrowRight className={`w-5 h-5 ${isRtl ? '' : 'rotate-180'}`} />
        </Link>
        <span className="text-sm font-bold">{t('account.title')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Global Feedback */}
      {feedback && (
        <div 
          className="mt-4 p-3 rounded-2xl text-xs font-medium flex items-center gap-2 border"
          style={{
            backgroundColor: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success-text)' : 'var(--color-error-text)',
            borderColor: feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
          }}
        >
          {feedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {isLoading ? (
        <div className="my-auto py-12 flex flex-col items-center justify-center opacity-70">
          <RefreshCw className="w-8 h-8 animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs">{t('account.loadingAccount')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 my-auto py-4">
          
          {/* User Points Card Summary */}
          {customer && (
            <div 
              className="p-4 rounded-3xl border shadow-sm flex items-center justify-between"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div>
                <span className="text-[11px] opacity-60 block">{t('account.enrolledBusiness')}</span>
                <span className="text-xs font-bold">{customer.business_name || t('account.defaultBusiness')}</span>
              </div>
              <div className={isRtl ? 'text-left' : 'text-right'}>
                <span className="text-[11px] opacity-60 block">{t('account.pointsBalance')}</span>
                <span className="text-lg font-black" style={{ color: 'var(--color-accent)' }}>
                  {customer.points_balance || 0} {t('account.pointsUnit')}
                </span>
              </div>
            </div>
          )}

          {/* Link to view transaction history on customer card */}
          {token && (
            <Link
              href={`/card/${token}`}
              id="account-view-history-link"
              className="p-3.5 rounded-2xl border shadow-2xs flex items-center justify-between transition-transform active:scale-98"
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <span className="text-xs font-bold">{t('customer.transactionHistory')}</span>
              </div>
              <ArrowRight className={`w-4 h-4 opacity-60 ${isRtl ? '' : 'rotate-180'}`} />
            </Link>
          )}

          {/* 19.5 & 22.8: Referral Code & Sharing Card (hidden if feature is disabled) */}
          {customer?.referral_code && customer?.features?.referral_program !== false && (
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3.5"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
              id="referral-card"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-7 h-7 rounded-lg flex items-center justify-center border"
                  style={{
                    backgroundColor: 'rgba(var(--color-accent-rgb, 198, 124, 78), 0.1)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Gift className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  {t('account.referralTitle')}
                </h2>
              </div>

              <p className="text-xs opacity-75 leading-relaxed">
                {t('account.referralDesc')}
              </p>

              {/* Referral Code Display Box */}
              <div 
                className="p-3.5 rounded-2xl border flex items-center justify-between gap-2"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] opacity-60 font-medium">{t('account.yourReferralCode')}</span>
                  <span className="text-base font-black font-mono tracking-wider truncate" style={{ color: 'var(--color-accent)' }}>
                    {customer.referral_code}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Copy Button */}
                  <button
                    type="button"
                    id="copy-referral-btn"
                    onClick={handleCopyReferral}
                    aria-label={t('account.copyCode')}
                    className="p-2.5 rounded-xl border flex items-center gap-1 text-xs font-semibold transition-transform active:scale-95"
                    style={{
                      backgroundColor: isCopied ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-card-bg)',
                      borderColor: isCopied ? '#10b981' : 'var(--color-border)',
                      color: isCopied ? '#10b981' : 'var(--color-text)',
                    }}
                  >
                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isCopied ? t('account.codeCopied') : t('account.copyCode')}</span>
                  </button>

                  {/* Share Button */}
                  <button
                    type="button"
                    id="share-referral-btn"
                    onClick={handleShareReferral}
                    aria-label={t('account.shareCode')}
                    className="p-2.5 rounded-xl flex items-center gap-1 text-xs font-bold transition-transform active:scale-95 shadow-2xs"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--color-btn-text)',
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t('account.shareCode')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Name & Phone Form */}
          <form 
            onSubmit={handleSaveProfile}
            className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3.5"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
              <User className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span>{t('account.personalInfo')}</span>
            </h2>

            <div>
              <label className="block text-[11px] opacity-70 mb-1 font-medium">{t('account.fullName')}</label>
              <div className="relative">
                <input
                  type="text"
                  id="customer-edit-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  placeholder={t('account.enterName')}
                  required
                  className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: nameTouched && !nameValidation.isValid ? 'var(--color-error-border, #ef4444)' : 'var(--color-border)',
                  }}
                />
                <User className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              {nameTouched && !nameValidation.isValid && (
                <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{t(`validation.${nameValidation.errorKey}`)}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] opacity-70 mb-1 font-medium">{t('account.phone')}</label>
              <div className="relative">
                <input
                  type="tel"
                  id="customer-edit-phone"
                  value={phone}
                  dir="ltr"
                  maxLength={11}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneTouched(true);
                  }}
                  placeholder="01012345678"
                  className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: phone.trim() !== '' && !phoneValidation.isValid ? 'var(--color-error-border, #ef4444)' : 'var(--color-border)',
                  }}
                />
                <Phone className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              {phone.trim() !== '' && !phoneValidation.isValid && (
                <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{t(`validation.${phoneValidation.errorKey}`)}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              id="save-profile-btn"
              disabled={isSaving || !nameValidation.isValid || (phone.trim() !== '' && !phoneValidation.isValid)}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold transition-all shadow-lg mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50 btn-gradient"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSaving ? t('account.saving') : t('account.saveChanges')}</span>
            </button>
          </form>

          {/* Language Selection (عربي / English) */}
          <div 
            className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
              <Globe className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span>{t('account.appLanguage')}</span>
            </h2>

            <div className="grid grid-cols-2 gap-2" dir="ltr">
              <button
                type="button"
                id="lang-ar-btn"
                onClick={() => handleLanguageChange('ar')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  locale === 'ar' ? 'shadow-xs' : 'opacity-70 hover:opacity-100'
                }`}
                style={locale === 'ar' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)', borderColor: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
              >
                <span>العربية</span>
                {locale === 'ar' && <Check className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                id="lang-en-btn"
                onClick={() => handleLanguageChange('en')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  locale === 'en' ? 'shadow-xs' : 'opacity-70 hover:opacity-100'
                }`}
                style={locale === 'en' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)', borderColor: 'var(--color-accent)' } : { borderColor: 'var(--color-border)' }}
              >
                <span>English</span>
                {locale === 'en' && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* WhatsApp Notifications Toggle (Phase 16.9) */}
          {customer?.business_notifications_active && (
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  {notificationsEnabled ? (
                    <Bell className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  ) : (
                    <BellOff className="w-4 h-4 opacity-50" />
                  )}
                  <span>{t('accountNotifications.title')}</span>
                </h2>

                <button
                  type="button"
                  id="toggle-notifications-btn"
                  onClick={handleToggleNotifications}
                  disabled={isUpdatingNotif}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                    notificationsEnabled ? 'bg-[var(--color-accent)]' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      notificationsEnabled ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs opacity-70">
                {t('accountNotifications.desc')}
              </p>

              <div 
                className="py-2 px-3 rounded-xl text-[11px] font-medium flex items-center gap-1.5 border"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: notificationsEnabled ? 'var(--color-accent)' : 'inherit',
                }}
              >
                {notificationsEnabled ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 opacity-50" />
                )}
                <span>
                  {notificationsEnabled ? t('accountNotifications.statusActive') : t('accountNotifications.statusMuted')}
                </span>
              </div>

              {/* Phase 30: Notification Channel Selection */}
              {notificationsEnabled && (
                <div className="mt-2 pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--color-border)' }}>
                  <label className="text-[11px] font-semibold opacity-80 block">
                    {t('accountNotifications.channelLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: 'all', label: t('accountNotifications.channelAll'), icon: MessageCircle },
                      { id: 'whatsapp', label: t('accountNotifications.channelWhatsapp'), icon: MessageCircle },
                      { id: 'sms', label: t('accountNotifications.channelSms'), icon: MessageSquare },
                      { id: 'none', label: t('accountNotifications.channelNone'), icon: BellOff },
                    ].map((ch) => {
                      const isSelected = notificationChannel === ch.id;
                      const Icon = ch.icon;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          disabled={isUpdatingChannel}
                          onClick={() => handleChannelChange(ch.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-start flex items-center justify-between transition-all ${
                            isSelected ? 'ring-2' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: isSelected ? 'var(--color-bg)' : 'transparent',
                            borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                            color: isSelected ? 'var(--color-accent)' : 'inherit',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{ch.label}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact Support Button */}
          <div 
            className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
              <Headphones className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span>{t('account.helpSupport')}</span>
            </h2>

            <p className="text-xs opacity-70">
              {t('account.supportDesc')}
            </p>

            <button
              type="button"
              id="contact-support-btn"
              onClick={() => setShowSupportModal(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 active:scale-95"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              <MessageCircle className="w-4 h-4" />
              <span>{t('account.contactSupport')}</span>
            </button>
          </div>

          {/* Danger Zone: Delete Single Loyalty Card */}
          <div
            className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
            }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('accountDeletion.dangerZone')}</span>
            </h2>

            <p className="text-xs opacity-70">
              {t('accountDeletion.confirmCardDesc')}
            </p>

            {deleteCardError && (
              <div className="p-2.5 rounded-xl border text-xs text-rose-400" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                {deleteCardError}
              </div>
            )}

            <button
              type="button"
              id="delete-card-open-btn"
              onClick={() => setShowCardDeleteModal(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              style={{ backgroundColor: '#EF4444' }}
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('accountDeletion.deleteCard')}</span>
            </button>
          </div>

        </div>
      )}

      {/* Delete Card Confirmation Modal */}
      {showCardDeleteModal && (
        <div
          className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => {
            if (!isDeletingCard) setShowCardDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-6 border shadow-2xl animate-in zoom-in-95 duration-150 text-center"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: '#EF4444' }}
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-rose-500 mb-1">
              {t('accountDeletion.deleteCard')}
            </h3>
            <p className="text-xs opacity-80 mb-4 leading-relaxed">
              {t('accountDeletion.confirmCardDesc')}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCardDeleteModal(false)}
                disabled={isDeletingCard}
                className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {t('accountDeletion.cancelButton')}
              </button>
              <button
                type="button"
                onClick={handleDeleteCard}
                id="confirm-delete-card-btn"
                disabled={isDeletingCard}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: '#EF4444' }}
              >
                {isDeletingCard ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{t('accountDeletion.deleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3" />
                    <span>{t('accountDeletion.deleteButton')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {showSupportModal && (
        <div 
          className="fixed inset-0 z-50 backdrop-blur-xs flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => setShowSupportModal(false)}
        >
          <div 
            className="w-full max-w-xs rounded-3xl p-6 border shadow-2xl animate-in zoom-in-95 duration-150 text-center"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center shadow-xs"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
            >
              <Headphones className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold mb-1">{t('account.supportModalTitle')}</h3>
            <p className="text-xs opacity-70 mb-4">
              {t('account.reachUs')}
            </p>

            <div className="flex flex-col gap-2 mb-4 text-xs font-semibold">
              <a
                href="https://wa.me/201012345678"
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-transform active:scale-95"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('account.whatsappDirect')}</span>
              </a>

              <a
                href="tel:+201012345678"
                className="py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-transform active:scale-95"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
              >
                <Phone className="w-4 h-4" />
                <span>{t('account.callDirect')}</span>
              </a>
            </div>

            <button
              onClick={() => setShowSupportModal(false)}
              className="w-full py-2 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-xs"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <footer className="text-center text-[10px] opacity-40 py-2">
        {t('account.footerProtected')}
      </footer>
    </div>
  );
}

export default function AccountPage() {
  const { t } = useLocale();
  return (
    <main 
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-hidden"
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

      <Suspense fallback={
        <div className="py-20 flex flex-col items-center justify-center opacity-70">
          <RefreshCw className="w-8 h-8 animate-spin mb-2" style={{ color: '#6C63FF' }} />
          <span className="text-xs">{t('common.loading')}</span>
        </div>
      }>
        <AccountContent />
      </Suspense>
    </main>
  );
}
