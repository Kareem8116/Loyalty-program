'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, ArrowLeft, User, Phone, Globe, Headphones, 
  FloppyDisk, CircleNotch, Check, WarningCircle, ChatCircle,
  Bell, BellSlash, ClockCounterClockwise, ShareNetwork, Copy, Gift, ChatText,
  Trash, Warning, X
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { validateName, validateEgyptianPhone } from '@/lib/validation';

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
      <header className="page-header flex items-center justify-between w-full pb-3 border-b border-[var(--color-separator)]">
        <Link
          href={backUrl}
          aria-label={t('common.back')}
          className="w-9 h-9 rounded-[8px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)] transition-all active:scale-95"
        >
          {isRtl ? (
            <ArrowRight weight="light" className="w-4 h-4" />
          ) : (
            <ArrowLeft weight="light" className="w-4 h-4" />
          )}
        </Link>
        <span className="text-sm font-medium tracking-tight text-[var(--color-text)]">{t('account.title')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Global Feedback */}
      {feedback && (
        <div 
          className="mt-4 p-3 rounded-[6px] text-xs font-mono flex items-center gap-2 border"
          style={{
            backgroundColor: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success-text)' : 'var(--color-error-text)',
            borderColor: feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
          }}
        >
          {feedback.type === 'success' ? (
            <Check weight="light" className="w-4 h-4 shrink-0" />
          ) : (
            <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {isLoading ? (
        <div className="my-auto py-16 flex flex-col items-center justify-center opacity-70">
          <CircleNotch weight="light" className="w-8 h-8 animate-spin mb-2 text-[var(--color-signal-blue)]" />
          <span className="text-xs font-mono text-[var(--color-text-muted)]">{t('account.loadingAccount')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 my-auto py-4">
          
          {/* User Points Card Summary: 8px radius, hairline border, Inter weight 300 */}
          {customer && (
            <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-[0.05em] text-[var(--color-text-muted)] block">{t('account.enrolledBusiness')}</span>
                <span className="text-xs font-semibold text-[var(--color-text)]">{customer.business_name || t('account.defaultBusiness')}</span>
              </div>
              <div className={isRtl ? 'text-left' : 'text-right'}>
                <span className="text-[11px] font-mono uppercase tracking-[0.05em] text-[var(--color-text-muted)] block">{t('account.pointsBalance')}</span>
                <span className="text-2xl font-light font-display tracking-tight text-[var(--color-text)]">
                  {customer.points_balance || 0} <span className="text-xs font-mono uppercase text-[var(--color-text-muted)]">{t('account.pointsUnit')}</span>
                </span>
              </div>
            </div>
          )}

          {/* Link to view transaction history on customer card */}
          {token && (
            <Link
              href={`/card/${token}`}
              id="account-view-history-link"
              className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex items-center justify-between transition-all hover:border-[var(--color-signal-blue)] active:scale-98"
              style={{
                color: 'var(--color-text)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <ClockCounterClockwise weight="light" className="w-4 h-4 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                <span className="text-xs font-mono uppercase tracking-[0.05em]">{t('customer.transactionHistory')}</span>
              </div>
              {isRtl ? (
                <ArrowLeft weight="light" className="w-4 h-4 opacity-50" />
              ) : (
                <ArrowRight weight="light" className="w-4 h-4 opacity-50" />
              )}
            </Link>
          )}

          {/* 19.5 & 22.8: Referral Code & Sharing Card */}
          {customer?.referral_code && customer?.features?.referral_program !== false && (
            <div 
              className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex flex-col gap-3"
              id="referral-card"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
                >
                  <Gift weight="light" className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-[var(--color-text)]">
                  {t('account.referralTitle')}
                </h2>
              </div>

              <p className="text-xs opacity-75 leading-relaxed text-[var(--color-text)]">
                {t('account.referralDesc')}
              </p>

              {/* Referral Code Display Box */}
              <div 
                className="p-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-between gap-2"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">{t('account.yourReferralCode')}</span>
                  <span className="text-sm font-medium font-mono tracking-widest truncate text-[var(--color-text)]">
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
                    className="p-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] hover:border-[var(--color-signal-blue)] flex items-center gap-1 text-xs font-mono uppercase tracking-[0.05em] transition-all active:scale-95 cursor-pointer text-[var(--color-text)]"
                  >
                    {isCopied ? <Check weight="light" className="w-3.5 h-3.5 text-emerald-400" /> : <Copy weight="light" className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isCopied ? t('account.codeCopied') : t('account.copyCode')}</span>
                  </button>

                  {/* Share Button */}
                  <button
                    type="button"
                    id="share-referral-btn"
                    onClick={handleShareReferral}
                    aria-label={t('account.shareCode')}
                    className="ios-btn-primary py-2 px-3 rounded-[8px] flex items-center gap-1 text-xs font-mono uppercase tracking-[0.05em] transition-transform active:scale-95"
                  >
                    <ShareNetwork weight="light" className="w-3.5 h-3.5" />
                    <span>{t('account.shareCode')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Name & Phone Form */}
          <form 
            onSubmit={handleSaveProfile}
            className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex flex-col gap-3"
          >
            <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-[var(--color-text)] flex items-center gap-1.5">
              <User weight="light" className="w-3.5 h-3.5 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
              <span>{t('account.personalInfo')}</span>
            </h2>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[var(--color-text-muted)] mb-1">{t('account.fullName')}</label>
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
                  className={`ios-input w-full rounded-[4px] ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    borderColor: nameTouched && !nameValidation.isValid ? 'var(--color-error-border, #ef4444)' : undefined,
                  }}
                />
                <User weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 pointer-events-none ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              {nameTouched && !nameValidation.isValid && (
                <p className="text-[11px] text-red-500 font-mono mt-1 flex items-center gap-1">
                  <WarningCircle weight="light" className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(`validation.${nameValidation.errorKey}`)}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-[var(--color-text-muted)] mb-1">{t('account.phone')}</label>
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
                  className={`ios-input w-full rounded-[4px] ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    borderColor: phone.trim() !== '' && !phoneValidation.isValid ? 'var(--color-error-border, #ef4444)' : undefined,
                  }}
                />
                <Phone weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 pointer-events-none ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              {phone.trim() !== '' && !phoneValidation.isValid && (
                <p className="text-[11px] text-red-500 font-mono mt-1 flex items-center gap-1">
                  <WarningCircle weight="light" className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(`validation.${phoneValidation.errorKey}`)}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              id="save-profile-btn"
              disabled={isSaving || !nameValidation.isValid || (phone.trim() !== '' && !phoneValidation.isValid)}
              className="ios-btn-primary w-full py-2.5 px-4 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] transition-all mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <FloppyDisk weight="light" className="w-3.5 h-3.5" />}
              <span>{isSaving ? t('account.saving') : t('account.saveChanges')}</span>
            </button>
          </form>

          {/* Language Selection */}
          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex flex-col gap-3">
            <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-[var(--color-text)] flex items-center gap-1.5">
              <Globe weight="light" className="w-3.5 h-3.5 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
              <span>{t('account.appLanguage')}</span>
            </h2>

            <div className="grid grid-cols-2 gap-2" dir="ltr">
              <button
                type="button"
                id="lang-ar-btn"
                onClick={() => handleLanguageChange('ar')}
                className={`py-2 px-3 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  locale === 'ar' 
                    ? 'bg-[var(--color-signal-blue)] text-white border-[var(--color-signal-blue)] font-medium' 
                    : 'border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)]'
                }`}
              >
                <span>العربية</span>
                {locale === 'ar' && <Check weight="light" className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                id="lang-en-btn"
                onClick={() => handleLanguageChange('en')}
                className={`py-2 px-3 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  locale === 'en' 
                    ? 'bg-[var(--color-signal-blue)] text-white border-[var(--color-signal-blue)] font-medium' 
                    : 'border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] hover:border-[var(--color-signal-blue)]'
                }`}
              >
                <span>English</span>
                {locale === 'en' && <Check weight="light" className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Notifications Toggle */}
          {customer?.business_notifications_active && (
            <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  {notificationsEnabled ? (
                    <Bell weight="light" className="w-3.5 h-3.5 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                  ) : (
                    <BellSlash weight="light" className="w-3.5 h-3.5 opacity-50" />
                  )}
                  <span>{t('accountNotifications.title')}</span>
                </h2>

                <button
                  type="button"
                  id="toggle-notifications-btn"
                  onClick={handleToggleNotifications}
                  disabled={isUpdatingNotif}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-[4px] border border-[var(--color-border)] transition-colors duration-200 ease-in-out disabled:opacity-50 ${
                    notificationsEnabled ? 'bg-[var(--color-signal-blue)]' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-[2px] bg-white transition duration-200 ease-in-out ${
                      notificationsEnabled ? (isRtl ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs opacity-70 text-[var(--color-text)]">
                {t('accountNotifications.desc')}
              </p>

              <div 
                className="py-1.5 px-2.5 rounded-[4px] text-[11px] font-mono flex items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-input-bg)]"
                style={{
                  color: notificationsEnabled ? 'var(--color-signal-blue)' : 'inherit',
                }}
              >
                {notificationsEnabled ? (
                  <Check weight="light" className="w-3.5 h-3.5" />
                ) : (
                  <BellSlash weight="light" className="w-3.5 h-3.5 opacity-50" />
                )}
                <span>
                  {notificationsEnabled ? t('accountNotifications.statusActive') : t('accountNotifications.statusMuted')}
                </span>
              </div>

              {/* Notification Channel Selection */}
              {notificationsEnabled && (
                <div className="mt-2 pt-3 border-t border-[var(--color-separator)] flex flex-col gap-2">
                  <label className="text-[11px] font-mono uppercase text-[var(--color-text-muted)] block">
                    {t('accountNotifications.channelLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: 'all', label: t('accountNotifications.channelAll'), icon: ChatCircle },
                      { id: 'whatsapp', label: t('accountNotifications.channelWhatsapp'), icon: ChatCircle },
                      { id: 'sms', label: t('accountNotifications.channelSms'), icon: ChatText },
                      { id: 'none', label: t('accountNotifications.channelNone'), icon: BellSlash },
                    ].map((ch) => {
                      const isSelected = notificationChannel === ch.id;
                      const Icon = ch.icon;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          disabled={isUpdatingChannel}
                          onClick={() => handleChannelChange(ch.id as any)}
                          className={`p-2 rounded-[6px] border text-xs font-mono text-start flex items-center justify-between transition-all cursor-pointer ${
                            isSelected 
                              ? 'border-[var(--color-signal-blue)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] font-medium' 
                              : 'border-[var(--color-border)] bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon weight="light" className="w-3.5 h-3.5 shrink-0" />
                            <span>{ch.label}</span>
                          </div>
                          {isSelected && <Check weight="light" className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact Support Button */}
          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] flex flex-col gap-3">
            <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-[var(--color-text)] flex items-center gap-1.5">
              <Headphones weight="light" className="w-3.5 h-3.5 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
              <span>{t('account.helpSupport')}</span>
            </h2>

            <p className="text-xs opacity-70 text-[var(--color-text)]">
              {t('account.supportDesc')}
            </p>

            <button
              type="button"
              id="contact-support-btn"
              onClick={() => setShowSupportModal(true)}
              className="w-full py-2.5 px-4 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] transition-all border border-[var(--color-border)] bg-[var(--color-input-bg)] hover:border-[var(--color-signal-blue)] flex items-center justify-center gap-2 active:scale-95 text-[var(--color-text)] cursor-pointer"
            >
              <ChatCircle weight="light" className="w-4 h-4" />
              <span>{t('account.contactSupport')}</span>
            </button>
          </div>

          {/* Danger Zone: Delete Single Loyalty Card */}
          <div
            className="p-4 rounded-[8px] border border-red-500/25 bg-red-500/5 flex flex-col gap-3"
          >
            <h2 className="text-xs font-mono uppercase tracking-[0.08em] font-medium text-rose-500 flex items-center gap-1.5">
              <Warning weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('accountDeletion.dangerZone')}</span>
            </h2>

            <p className="text-xs opacity-70 text-[var(--color-text)]">
              {t('accountDeletion.confirmCardDesc')}
            </p>

            {deleteCardError && (
              <div className="p-2 rounded-[4px] border border-red-500/30 bg-red-500/10 text-xs font-mono text-rose-400">
                {deleteCardError}
              </div>
            )}

            <button
              type="button"
              id="delete-card-open-btn"
              onClick={() => setShowCardDeleteModal(true)}
              className="w-full py-2 px-4 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] text-white transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer bg-red-600 hover:bg-red-700"
            >
              <Trash weight="light" className="w-3.5 h-3.5" />
              <span>{t('accountDeletion.deleteCard')}</span>
            </button>
          </div>

        </div>
      )}

      {/* Delete Card Confirmation Modal */}
      {showCardDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => {
            if (!isDeletingCard) setShowCardDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-[8px] p-6 border border-red-500/40 bg-[var(--color-card-bg)] text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className="w-10 h-10 mx-auto mb-3 rounded-[4px] border border-red-500/30 bg-red-500/10 flex items-center justify-center text-rose-400"
            >
              <Warning weight="light" className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-rose-500 mb-1">
              {t('accountDeletion.deleteCard')}
            </h3>
            <p className="text-xs opacity-80 mb-4 leading-relaxed text-[var(--color-text)]">
              {t('accountDeletion.confirmCardDesc')}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCardDeleteModal(false)}
                disabled={isDeletingCard}
                className="flex-1 py-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-xs font-mono uppercase tracking-[0.05em] transition-all hover:border-[var(--color-signal-blue)] cursor-pointer text-[var(--color-text)] disabled:opacity-50"
              >
                {t('accountDeletion.cancelButton')}
              </button>
              <button
                type="button"
                onClick={handleDeleteCard}
                id="confirm-delete-card-btn"
                disabled={isDeletingCard}
                className="flex-1 py-2 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 bg-red-600 hover:bg-red-700"
              >
                {isDeletingCard ? (
                  <>
                    <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('accountDeletion.deleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash weight="light" className="w-3.5 h-3.5" />
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => setShowSupportModal(false)}
        >
          <div 
            className="w-full max-w-xs rounded-[8px] p-6 border border-[var(--color-border)] bg-[var(--color-card-bg)] text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="w-10 h-10 mx-auto mb-3 rounded-[4px] flex items-center justify-center border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
            >
              <Headphones weight="light" className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium mb-1 text-[var(--color-text)]">{t('account.supportModalTitle')}</h3>
            <p className="text-xs opacity-70 mb-4 text-[var(--color-text)]">
              {t('account.reachUs')}
            </p>

            <div className="flex flex-col gap-2 mb-4 text-xs font-mono">
              <a
                href="https://wa.me/201012345678"
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-input-bg)] hover:border-[var(--color-signal-blue)] flex items-center justify-center gap-2 transition-all active:scale-95 text-[var(--color-text)]"
              >
                <ChatCircle weight="light" className="w-4 h-4 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                <span>{t('account.whatsappDirect')}</span>
              </a>

              <a
                href="tel:+201012345678"
                className="py-2.5 px-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-input-bg)] hover:border-[var(--color-signal-blue)] flex items-center justify-center gap-2 transition-all active:scale-95 text-[var(--color-text)]"
              >
                <Phone weight="light" className="w-4 h-4 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]" />
                <span>{t('account.callDirect')}</span>
              </a>
            </div>

            <button
              onClick={() => setShowSupportModal(false)}
              className="ios-btn-primary w-full py-2 rounded-[8px] text-xs font-mono uppercase tracking-[0.05em] transition-all active:scale-95"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <footer className="text-center text-[10px] font-mono opacity-50 py-3 text-[var(--color-text-muted)]">
        {t('account.footerProtected')}
      </footer>
    </div>
  );
}

export default function AccountPage() {
  const { t } = useLocale();
  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-hidden">
      <Suspense fallback={
        <div className="py-20 flex flex-col items-center justify-center opacity-70">
          <CircleNotch weight="light" className="w-8 h-8 animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs">{t('common.loading')}</span>
        </div>
      }>
        <AccountContent />
      </Suspense>
    </main>
  );
}
