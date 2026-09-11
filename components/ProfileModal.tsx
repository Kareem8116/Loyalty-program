'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Mail, Phone, Shield, Edit3, X, Check, 
  AlertCircle, ArrowRight, RefreshCw, KeyRound, Sparkles,
  Smartphone, MessageSquare
} from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { validateEgyptianPhone, validateEmail } from '@/lib/validation';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  jwtToken: string | null;
  initialData?: {
    email?: string;
    name?: string;
    phone?: string;
    role?: string;
    businessName?: string;
  };
  onProfileUpdated?: (updated: { email?: string; name?: string; phone?: string }) => void;
  extraInfo?: React.ReactNode;
  dangerZone?: React.ReactNode;
}

type ModalMode = 'view' | 'edit' | 'otp';
type OtpTargetType = 'email' | 'phone';

export default function ProfileModal({
  isOpen,
  onClose,
  jwtToken,
  initialData,
  onProfileUpdated,
  extraInfo,
  dangerZone,
}: ProfileModalProps) {
  const { t, isRtl } = useLocale();

  // Mode state
  const [mode, setMode] = useState<ModalMode>('view');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Profile data
  const [currentName, setCurrentName] = useState(initialData?.name || '');
  const [currentEmail, setCurrentEmail] = useState(initialData?.email || '');
  const [currentPhone, setCurrentPhone] = useState(initialData?.phone || '');
  const [userRole, setUserRole] = useState(initialData?.role || 'customer');
  const [businessName, setBusinessName] = useState(initialData?.businessName || '');

  // Form edit state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // OTP Challenge state
  const [otpType, setOtpType] = useState<OtpTargetType>('email');
  const [otpTarget, setOtpTarget] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [simulatedSms, setSimulatedSms] = useState<{ phone?: string; otp?: string } | null>(null);

  // Queue for sequential verification if both email and phone changed
  const [pendingPhoneUpdate, setPendingPhoneUpdate] = useState<string | null>(null);

  // OTP inputs ref for autofocus
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Load latest profile from API whenever modal opens
  useEffect(() => {
    if (!isOpen || !jwtToken) return;

    let isMounted = true;
    setIsLoadingProfile(true);

    fetch('/api/account/profile', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    })
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.success && data.profile) {
          setCurrentName(data.profile.name || '');
          setCurrentEmail(data.profile.email || '');
          setCurrentPhone(data.profile.phone || '');
          if (data.profile.role) setUserRole(data.profile.role);
          if (data.profile.businessName) setBusinessName(data.profile.businessName);
        }
      })
      .catch(err => console.warn('Failed to load profile details:', err))
      .finally(() => {
        if (isMounted) setIsLoadingProfile(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, jwtToken]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Focus OTP input on mode change
  useEffect(() => {
    if (mode === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [mode]);

  // Reset states when modal is closed
  const handleClose = () => {
    setMode('view');
    setFormError(null);
    setFeedbackSuccess(null);
    setOtpError(null);
    setOtpInput('');
    setSimulatedSms(null);
    setPendingPhoneUpdate(null);
    onClose();
  };

  // Switch to edit mode
  const handleStartEdit = () => {
    setEditName(currentName);
    setEditEmail(currentEmail);
    setEditPhone(currentPhone);
    setFormError(null);
    setFeedbackSuccess(null);
    setMode('edit');
  };

  // Check if credentials changed
  const isEmailChanged = editEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();
  const isPhoneChanged = editPhone.replace(/\D/g, '') !== currentPhone.replace(/\D/g, '');
  const isNameChanged = editName.trim() !== currentName.trim();

  // Save changes handler
  const handleSaveChanges = async () => {
    setFormError(null);
    setFeedbackSuccess(null);

    // Validate name
    if (isNameChanged && editName.trim().length < 2) {
      setFormError(t('profileEdit.invalidName') || 'الاسم يجب أن يحتوي على حرفين على الأقل');
      return;
    }

    // Validate email if changed
    if (isEmailChanged) {
      const emailVal = validateEmail(editEmail);
      if (!emailVal.isValid) {
        setFormError(t('profileEdit.invalidEmail') || 'صيغة البريد الإلكتروني غير صالحة');
        return;
      }
    }

    // Validate phone if changed
    if (isPhoneChanged) {
      const phoneVal = validateEgyptianPhone(editPhone);
      if (!phoneVal.isValid) {
        setFormError(phoneVal.errorMessage || t('profileEdit.invalidPhone') || 'رقم الموبايل غير صالح');
        return;
      }
    }

    // No changes at all
    if (!isNameChanged && !isEmailChanged && !isPhoneChanged) {
      setMode('view');
      return;
    }

    setIsSaving(true);

    try {
      // CASE 1: Only name changed (Direct save, 0 OTP)
      if (isNameChanged && !isEmailChanged && !isPhoneChanged) {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            action: 'update_name',
            name: editName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'فشل تحديث الاسم');

        setCurrentName(editName.trim());
        setFeedbackSuccess(t('profileEdit.updateSuccess') || 'تم تحديث البيانات بنجاح!');
        onProfileUpdated?.({ name: editName.trim() });
        setMode('view');
        return;
      }

      // CASE 2: Email changed (with or without phone/name)
      if (isEmailChanged) {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            action: 'request_otp',
            type: 'email',
            target: editEmail.trim(),
            name: editName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'فشل إرسال رمز التحقق');
        }

        // If phone is also changed, queue it for step 2
        if (isPhoneChanged) {
          setPendingPhoneUpdate(editPhone.replace(/\D/g, ''));
        } else {
          setPendingPhoneUpdate(null);
        }

        setOtpType('email');
        setOtpTarget(editEmail.trim().toLowerCase());
        setResendCooldown(data.cooldownSeconds || 60);
        setOtpInput('');
        setOtpError(null);
        setMode('otp');
        return;
      }

      // CASE 3: Only Phone changed (with or without name)
      if (isPhoneChanged && !isEmailChanged) {
        const cleanPhone = editPhone.replace(/\D/g, '');
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            action: 'request_otp',
            type: 'phone',
            target: cleanPhone,
            name: editName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'فشل إرسال رمز التحقق');
        }

        setPendingPhoneUpdate(null);
        setOtpType('phone');
        setOtpTarget(cleanPhone);
        setResendCooldown(data.cooldownSeconds || 60);
        if (data.simulatedSms) setSimulatedSms(data.simulatedSms);
        setOtpInput('');
        setOtpError(null);
        setMode('otp');
        return;
      }
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء معالجة الطلب');
    } finally {
      setIsSaving(false);
    }
  };

  // Verify OTP submission
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpInput.trim() || otpInput.trim().length !== 6) {
      setOtpError(t('profileEdit.invalidOtp') || 'رمز التحقق يجب أن يتكون من 6 أرقام');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          action: 'verify_and_update',
          type: otpType,
          target: otpTarget,
          otp: otpInput.trim(),
          name: editName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('profileEdit.invalidOtp') || 'رمز التحقق غير صحيح');
      }

      // Check if step 2 is queued (Phone update)
      if (otpType === 'email' && pendingPhoneUpdate) {
        // Step 1 email completed! Now initiate Step 2 phone
        setCurrentEmail(otpTarget);
        if (editName.trim()) setCurrentName(editName.trim());

        setOtpType('phone');
        setOtpTarget(pendingPhoneUpdate);
        setOtpInput('');
        setOtpError(null);
        setPendingPhoneUpdate(null);

        // Request OTP for phone
        const pRes = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            action: 'request_otp',
            type: 'phone',
            target: pendingPhoneUpdate,
            name: editName.trim(),
          }),
        });
        const pData = await pRes.json();
        if (pData.success) {
          setResendCooldown(pData.cooldownSeconds || 60);
          if (pData.simulatedSms) setSimulatedSms(pData.simulatedSms);
        }
        return;
      }

      // All updates complete!
      if (otpType === 'email') {
        setCurrentEmail(otpTarget);
      } else if (otpType === 'phone') {
        setCurrentPhone(otpTarget);
      }
      if (editName.trim()) setCurrentName(editName.trim());

      setFeedbackSuccess(t('profileEdit.updateSuccess') || 'تم تحديث البيانات بنجاح!');
      onProfileUpdated?.({
        name: editName.trim() || currentName,
        email: otpType === 'email' ? otpTarget : currentEmail,
        phone: otpType === 'phone' ? otpTarget : currentPhone,
      });

      setMode('view');
    } catch (err: any) {
      setOtpError(err.message || t('profileEdit.invalidOtp') || 'رمز التحقق غير صحيح');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          action: 'request_otp',
          type: otpType,
          target: otpTarget,
          name: editName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل إعادة إرسال الرمز');
      }

      setResendCooldown(data.cooldownSeconds || 60);
      if (data.simulatedSms) setSimulatedSms(data.simulatedSms);
      setOtpInput('');
    } catch (err: any) {
      setOtpError(err.message || 'فشل إعادة إرسال الرمز');
    } finally {
      setIsResending(false);
    }
  };

  if (!isOpen) return null;

  // Format initial letter for avatar
  const avatarLetter = (currentName.trim() || currentEmail || 'P').charAt(0).toUpperCase();

  // Role label lookup
  const roleDisplay = 
    userRole === 'super_admin' ? (isRtl ? 'سوبر أدمن' : 'Super Admin') :
    userRole === 'owner' ? (isRtl ? 'مالك متجر' : 'Store Owner') :
    userRole === 'branch_admin' ? (isRtl ? 'مدير فرع' : 'Branch Admin') :
    userRole === 'cashier' ? (isRtl ? 'كاشير' : 'Cashier') :
    (isRtl ? 'عميل' : 'Customer');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
      onClick={handleClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 border shadow-2xl animate-in zoom-in-95 duration-150 relative max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ──── MODAL HEADER ──── */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs font-bold text-sm"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
            >
              {avatarLetter}
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                {t('profileEdit.title') || 'الملف الشخصي'}
                {mode === 'edit' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {t('profileEdit.editProfile') || 'تعديل البيانات'}
                  </span>
                )}
                {mode === 'otp' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    OTP Verification
                  </span>
                )}
              </h2>
              <span className="text-[11px] opacity-60">
                {businessName ? `${roleDisplay} • ${businessName}` : roleDisplay}
              </span>
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Feedback Alert */}
        {feedbackSuccess && (
          <div className="p-3 my-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1 font-medium">{feedbackSuccess}</span>
            <button onClick={() => setFeedbackSuccess(null)} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ──── MODE 1: VIEW PROFILE ──── */}
        {mode === 'view' && (
          <div className="py-4 space-y-3.5">
            {/* Identity Card */}
            <div
              className="p-4 rounded-2xl border text-xs space-y-3"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              {/* Name */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 opacity-50 shrink-0" />
                  <span className="text-[11px] opacity-60">{t('profileEdit.fullName') || 'الاسم الكامل'}</span>
                </div>
                <strong className="text-xs font-semibold">
                  {currentName || (isRtl ? 'غير محدد' : 'Not set')}
                </strong>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 opacity-50 shrink-0" />
                  <span className="text-[11px] opacity-60">{t('profileEdit.email') || 'البريد الإلكتروني'}</span>
                </div>
                <strong className="text-xs font-mono select-all text-indigo-400">
                  {currentEmail || (isRtl ? 'غير متوفر' : 'Not available')}
                </strong>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 opacity-50 shrink-0" />
                  <span className="text-[11px] opacity-60">{t('profileEdit.phoneNumber') || 'رقم الموبايل'}</span>
                </div>
                <strong className="text-xs font-mono select-all" dir="ltr">
                  {currentPhone || (isRtl ? 'غير محدد' : 'Not set')}
                </strong>
              </div>
            </div>

            {/* Edit Profile Action Button */}
            <button
              type="button"
              onClick={handleStartEdit}
              id="profile-modal-edit-btn"
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer border"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-btn-text)',
                borderColor: 'var(--color-accent)',
              }}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('profileEdit.editProfile') || 'تعديل البيانات'}</span>
            </button>

            {/* Extra Portal Information Slot (Businesses, Branches, Places, etc.) */}
            {extraInfo && (
              <div className="pt-1">
                {extraInfo}
              </div>
            )}

            {/* Danger Zone Slot (Delete Account) */}
            {dangerZone && (
              <div className="pt-2">
                {dangerZone}
              </div>
            )}
          </div>
        )}

        {/* ──── MODE 2: EDIT PROFILE FORM ──── */}
        {mode === 'edit' && (
          <div className="py-4 space-y-4">
            {formError && (
              <div className="p-3 rounded-xl border text-xs text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium opacity-80 block">
                {t('profileEdit.fullName') || 'الاسم الكامل'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('profileEdit.namePlaceholder') || 'أدخل اسمك...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs transition-colors focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium opacity-80 block">
                  {t('profileEdit.email') || 'البريد الإلكتروني'}
                </label>
                {isEmailChanged && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                    {t('profileEdit.otpNoticeEmail') || 'تأكيد OTP مطلوب'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={t('profileEdit.emailPlaceholder') || 'example@domain.com'}
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: isEmailChanged ? 'rgba(99, 102, 241, 0.5)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            {/* Phone Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium opacity-80 block">
                  {t('profileEdit.phoneNumber') || 'رقم الموبايل'}
                </label>
                {isPhoneChanged && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                    {t('profileEdit.otpNoticePhone') || 'تأكيد OTP مطلوب'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={t('profileEdit.phonePlaceholder') || '01xxxxxxxxx'}
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: isPhoneChanged ? 'rgba(99, 102, 241, 0.5)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            {/* OTP Notice Info Box */}
            {(isEmailChanged || isPhoneChanged) && (
              <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 text-[11px] text-indigo-300 flex items-start gap-2 leading-relaxed">
                <KeyRound className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <span>
                  {isEmailChanged && isPhoneChanged
                    ? (isRtl ? 'لتأكيد تغيير البريد ورقم الموبايل، سيتم التحقق من كل منهما برمز OTP مكون من 6 أرقام لحماية حسابك.' : 'To confirm new email and phone, each will be verified via a 6-digit OTP for security.')
                    : isEmailChanged
                    ? (isRtl ? 'سيتم إرسال رمز تحقق OTP مكون من 6 أرقام إلى بريدك الجديد لتأكيده.' : 'A 6-digit OTP verification code will be sent to your new email.')
                    : (isRtl ? 'سيتم إرسال رمز تحقق OTP مكون من 6 أرقام إلى رقم هاتفك الجديد لتأكيده.' : 'A 6-digit OTP verification code will be sent to your new phone.')}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                id="profile-save-changes-btn"
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-btn-text)',
                }}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('profileEdit.saving') || 'جاري الحفظ...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('profileEdit.saveChanges') || 'حفظ التعديلات'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('view');
                  setFormError(null);
                }}
                disabled={isSaving}
                className="py-2.5 px-4 rounded-xl text-xs font-medium border opacity-80 hover:opacity-100 transition-colors cursor-pointer"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
              >
                {t('profileEdit.cancel') || 'إلغاء'}
              </button>
            </div>
          </div>
        )}

        {/* ──── MODE 3: OTP VERIFICATION CHALLENGE ──── */}
        {mode === 'otp' && (
          <div className="py-4 space-y-4">
            <div className="text-center space-y-1">
              <div
                className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-2"
                style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366F1' }}
              >
                <KeyRound className="w-6 h-6" />
              </div>

              <h3 className="text-sm font-bold">
                {otpType === 'email'
                  ? (pendingPhoneUpdate ? (t('profileEdit.step1Email') || 'خطوة 1 من 2: تأكيد البريد الإلكتروني') : (t('profileEdit.verifyEmailTitle') || 'تأكيد البريد الإلكتروني الجديد'))
                  : (t('profileEdit.verifyPhoneTitle') || 'تأكيد رقم الموبايل الجديد')}
              </h3>

              <p className="text-[11px] opacity-70">
                {otpType === 'email'
                  ? (t('profileEdit.verifyEmailSubtitle') || 'تم إرسال رمز التحقق إلى: {email}').replace('{email}', otpTarget)
                  : (t('profileEdit.verifyPhoneSubtitle') || 'تم إرسال رمز التحقق إلى: {phone}').replace('{phone}', otpTarget)}
              </p>
            </div>

            {/* Error message */}
            {otpError && (
              <div className="p-3 rounded-xl border text-xs text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            {/* Simulated SMS Card (Trial / Demo Mode) */}
            {otpType === 'phone' && simulatedSms && (
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{t('profileEdit.simulatedSmsTitle') || 'رسالة SMS تجريبية (بيئة الاختبار):'}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono bg-indigo-500/20 text-indigo-300">
                    {simulatedSms.phone}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-mono font-bold tracking-widest text-indigo-200">
                    OTP: {simulatedSms.otp}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (simulatedSms.otp) setOtpInput(simulatedSms.otp);
                    }}
                    className="text-[10px] py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-transform active:scale-95 cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{t('profileEdit.fillOtp') || 'إدراج الرمز تلقائياً'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* OTP Form */}
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium opacity-80 block text-center">
                  {t('profileEdit.otpLabel') || 'رمز التحقق (6 أرقام):'}
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  dir="ltr"
                  className="w-full py-3 px-4 rounded-2xl border text-center font-mono text-lg tracking-widest transition-colors focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: otpError ? '#EF4444' : 'var(--color-accent)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingOtp || otpInput.trim().length !== 6}
                id="profile-confirm-otp-btn"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-btn-text)',
                }}
              >
                {isVerifyingOtp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('profileEdit.saving') || 'جاري التحقق...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('profileEdit.confirmBtn') || 'تأكيد الرمز وتحديث الحساب'}</span>
                  </>
                )}
              </button>

              {/* Resend button & Cancel */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isResending}
                  className="opacity-70 hover:opacity-100 disabled:opacity-40 transition-opacity cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? (t('profileEdit.resendIn') || 'إعادة الإرسال بعد {seconds} ثانية').replace('{seconds}', String(resendCooldown))
                      : (t('profileEdit.resendOtp') || 'إعادة إرسال الرمز')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('edit');
                    setOtpError(null);
                  }}
                  className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {t('profileEdit.cancel') || 'رجوع'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
