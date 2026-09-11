'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Mail, Phone, ShieldCheck, Lock, Edit3, X, Check, 
  AlertCircle, ArrowRight, ArrowLeft, RefreshCw, KeyRound, Sparkles,
  Smartphone, Eye, EyeOff, Store, ShieldAlert
} from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { 
  validateEgyptianPhone, 
  validateEmail, 
  validatePassword, 
  validatePasswordConfirmation 
} from '@/lib/validation';

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

type ModalMode = 'view' | 'edit' | 'password' | 'otp';
type OtpTargetType = 'email' | 'phone';
type OtpPurpose = 'profile_update' | 'password_change';

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

  // Form edit state (Name, Email, Phone)
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdDeliveryChannel, setPwdDeliveryChannel] = useState<OtpTargetType>('phone');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [isRequestingPwdOtp, setIsRequestingPwdOtp] = useState(false);

  // OTP Challenge state
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('profile_update');
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
          // Set default password delivery channel based on phone availability
          if (data.profile.phone) {
            setPwdDeliveryChannel('phone');
          } else {
            setPwdDeliveryChannel('email');
          }
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

  // Resend cooldown timer (60 seconds countdown)
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
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [mode]);

  // Reset states when modal is closed
  const handleClose = () => {
    setMode('view');
    setFormError(null);
    setPwdError(null);
    setFeedbackSuccess(null);
    setOtpError(null);
    setOtpInput('');
    setNewPassword('');
    setConfirmPassword('');
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

  // Switch to password mode
  const handleStartPasswordChange = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPwdError(null);
    setFeedbackSuccess(null);
    setPwdDeliveryChannel(currentPhone ? 'phone' : 'email');
    setMode('password');
  };

  // Check if credentials changed
  const isEmailChanged = editEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();
  const isPhoneChanged = editPhone.replace(/\D/g, '') !== currentPhone.replace(/\D/g, '');
  const isNameChanged = editName.trim() !== currentName.trim();

  // Save changes handler (Edit profile mode)
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

        if (isPhoneChanged) {
          setPendingPhoneUpdate(editPhone.replace(/\D/g, ''));
        } else {
          setPendingPhoneUpdate(null);
        }

        setOtpPurpose('profile_update');
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
        setOtpPurpose('profile_update');
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

  // Request password change OTP
  const handleRequestPasswordOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPwdError(null);

    // Validate password length and complexity
    const pwdVal = validatePassword(newPassword);
    if (!pwdVal.isValid) {
      setPwdError(pwdVal.errorMessage || 'يجب ألا تقل كلمة المرور عن 8 خانات وتحتوي على رقم وحرف');
      return;
    }

    // Validate confirmation
    const confirmVal = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!confirmVal.isValid) {
      setPwdError(confirmVal.errorMessage || 'كلمتا المرور غير متطابقتين');
      return;
    }

    // Determine target based on selected channel
    let target = '';
    if (pwdDeliveryChannel === 'phone') {
      target = (currentPhone || editPhone || '').replace(/\D/g, '');
      if (!target) {
        setPwdError('لا يوجد رقم موبايل مسجل. يرجى اختيار إرسال الرمز للبريد الإلكتروني.');
        return;
      }
    } else {
      target = (currentEmail || editEmail || '').trim().toLowerCase();
      if (!target) {
        setPwdError('لا يوجد بريد إلكتروني مسجل.');
        return;
      }
    }

    setIsRequestingPwdOtp(true);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          action: 'request_password_otp',
          type: pwdDeliveryChannel,
          target,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل إرسال رمز التحقق');
      }

      setOtpPurpose('password_change');
      setOtpType(pwdDeliveryChannel);
      setOtpTarget(target);
      setResendCooldown(data.cooldownSeconds || 60);
      if (data.simulatedSms) setSimulatedSms(data.simulatedSms);
      setOtpInput('');
      setOtpError(null);
      setMode('otp');
    } catch (err: any) {
      setPwdError(err.message || 'حدث خطأ أثناء إرسال رمز التحقق');
    } finally {
      setIsRequestingPwdOtp(false);
    }
  };

  // Verify OTP submission (Handles both Profile Update & Password Change)
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpInput.trim() || otpInput.trim().length !== 6) {
      setOtpError(t('profileEdit.invalidOtp') || 'رمز التحقق يجب أن يتكون من 6 أرقام');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);

    try {
      // BRANCH A: PASSWORD CHANGE VERIFICATION
      if (otpPurpose === 'password_change') {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            action: 'verify_password_change',
            type: otpType,
            target: otpTarget,
            otp: otpInput.trim(),
            newPassword: newPassword.trim(),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || t('profileEdit.invalidOtp') || 'رمز التحقق غير صحيح');
        }

        setFeedbackSuccess(t('profileEdit.passwordSuccess') || 'تم تغيير وتحديث كلمة المرور بنجاح!');
        setNewPassword('');
        setConfirmPassword('');
        setMode('view');
        return;
      }

      // BRANCH B: PROFILE UPDATE VERIFICATION
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

      // Check if step 2 is queued (Phone update after email)
      if (otpType === 'email' && pendingPhoneUpdate) {
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

  // Resend OTP handler with 60-second cooldown and 15-min quota awareness
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setOtpError(null);

    try {
      const action = otpPurpose === 'password_change' ? 'request_password_otp' : 'request_otp';
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          action,
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
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-200"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)' }}
      onClick={handleClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* 
        Responsive Modal Container:
        - Mobile: Full height of mobile screen (h-[100dvh] w-full rounded-none), smooth scrolling, native app drawer feel.
        - Desktop/Tablet (sm:): max-w-xl centered rounded-3xl with generous padding.
      */}
      <div
        className="w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:max-w-xl rounded-none sm:rounded-3xl border-0 sm:border shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden relative"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ──── TOP NAVIGATION HEADER ──── */}
        <div 
          className="px-5 sm:px-7 py-4 border-b flex items-center justify-between shrink-0 sticky top-0 z-20 backdrop-blur-md"
          style={{ 
            borderColor: 'var(--color-border)',
            backgroundColor: 'rgba(var(--color-card-bg-rgb, 15, 23, 42), 0.85)'
          }}
        >
          <div className="flex items-center gap-3">
            {mode !== 'view' && (
              <button
                type="button"
                onClick={() => {
                  setMode('view');
                  setFormError(null);
                  setPwdError(null);
                  setOtpError(null);
                }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center border hover:opacity-100 transition-all cursor-pointer opacity-70 active:scale-95"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                aria-label="Back"
              >
                {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              </button>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                  {mode === 'view' && (t('profileEdit.title') || 'الملف الشخصي')}
                  {mode === 'edit' && (t('profileEdit.editProfile') || 'تعديل البيانات')}
                  {mode === 'password' && (t('profileEdit.changePassword') || 'تغيير كلمة المرور')}
                  {mode === 'otp' && (otpPurpose === 'password_change' ? (t('profileEdit.verifyPasswordTitle') || 'تأكيد كلمة المرور') : 'تأكيد الرمز')}
                </h1>

                {mode === 'view' && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    {roleDisplay}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-60 font-medium mt-0.5">
                {businessName ? `${businessName}` : (isRtl ? 'حسابك في Pointat' : 'Pointat Account')}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-11 h-11 rounded-2xl flex items-center justify-center border hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 opacity-70 hover:opacity-100 transition-all cursor-pointer active:scale-95"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ──── SCROLLABLE BODY CONTENT ──── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
          {/* Global Feedback Alert */}
          {feedbackSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-3 animate-in fade-in duration-200">
              <Check className="w-5 h-5 shrink-0 text-emerald-400" />
              <span className="flex-1 font-bold">{feedbackSuccess}</span>
              <button onClick={() => setFeedbackSuccess(null)} className="opacity-60 hover:opacity-100 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ════════ MODE 1: VIEW PROFILE ════════ */}
          {mode === 'view' && (
            <div className="space-y-6">
              {/* Profile Hero Avatar & Name */}
              <div 
                className="p-6 rounded-3xl border flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start"
                style={{ 
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)' 
                }}
              >
                <div 
                  className="w-20 h-20 sm:w-22 sm:h-22 rounded-3xl flex items-center justify-center text-2xl sm:text-3xl font-black shadow-lg relative shrink-0 border"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--color-accent), #4F46E5)',
                    color: 'var(--color-btn-text)',
                    borderColor: 'rgba(255,255,255,0.2)'
                  }}
                >
                  {avatarLetter}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[var(--color-card-bg)] flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black truncate">
                    {currentName || (isRtl ? 'حساب المستخدم' : 'User Account')}
                  </h2>
                  <p className="text-sm opacity-60 font-mono truncate select-all" dir="ltr">
                    {currentEmail}
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <span className="text-xs px-3 py-1 rounded-xl font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {roleDisplay}
                    </span>
                    {businessName && (
                      <span className="text-xs px-3 py-1 rounded-xl font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5" />
                        {businessName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Edit Profile & Change Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  id="profile-modal-edit-btn"
                  className="h-12 px-5 rounded-2xl text-sm font-bold transition-all active:scale-98 shadow-sm flex items-center justify-center gap-2.5 cursor-pointer border hover:opacity-95"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-btn-text)',
                    borderColor: 'var(--color-accent)',
                  }}
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t('profileEdit.editProfile') || 'تعديل البيانات'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartPasswordChange}
                  id="profile-modal-password-btn"
                  className="h-12 px-5 rounded-2xl text-sm font-bold transition-all active:scale-98 shadow-sm flex items-center justify-center gap-2.5 cursor-pointer border hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>{t('profileEdit.changePassword') || 'تغيير كلمة المرور'}</span>
                </button>
              </div>

              {/* Spacious, Eye-Friendly Information Cards with Large Icons */}
              <div className="space-y-3">
                {/* 1. Full Name Card */}
                <div 
                  className="p-4 sm:p-5 rounded-2xl border flex items-center gap-4 transition-all hover:border-amber-500/30"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                    <User className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60 block">
                      {t('profileEdit.fullName') || 'الاسم الكامل'}
                    </span>
                    <strong className="text-base sm:text-lg font-bold block truncate mt-0.5">
                      {currentName || (isRtl ? 'غير محدد' : 'Not set')}
                    </strong>
                  </div>
                </div>

                {/* 2. Email Address Card */}
                <div 
                  className="p-4 sm:p-5 rounded-2xl border flex items-center gap-4 transition-all hover:border-indigo-500/30"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 shadow-xs">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60 block">
                      {t('profileEdit.email') || 'البريد الإلكتروني'}
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono block truncate select-all mt-0.5 text-indigo-400" dir="ltr">
                      {currentEmail || (isRtl ? 'غير متوفر' : 'Not available')}
                    </strong>
                  </div>
                </div>

                {/* 3. Mobile Number Card */}
                <div 
                  className="p-4 sm:p-5 rounded-2xl border flex items-center gap-4 transition-all hover:border-emerald-500/30"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
                    <Phone className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60 block">
                      {t('profileEdit.phoneNumber') || 'رقم الموبايل'}
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono block truncate select-all mt-0.5 text-emerald-400" dir="ltr">
                      {currentPhone || (isRtl ? 'غير محدد بعد' : 'Not set')}
                    </strong>
                  </div>
                </div>

                {/* 4. Password / Security Status Card */}
                <div 
                  className="p-4 sm:p-5 rounded-2xl border flex items-center gap-4 transition-all hover:border-cyan-500/30"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60 block">
                      {t('profileEdit.securityTitle') || 'الأمان وكلمة المرور'}
                    </span>
                    <strong className="text-base sm:text-lg font-mono tracking-widest block truncate mt-0.5 opacity-80">
                      ••••••••••••
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartPasswordChange}
                    className="text-xs font-bold px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors cursor-pointer"
                  >
                    {t('profileEdit.changePassword') || 'تعديل'}
                  </button>
                </div>
              </div>

              {/* Extra Slot (e.g. Registered Places count & links) */}
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

          {/* ════════ MODE 2: EDIT PROFILE FORM ════════ */}
          {mode === 'edit' && (
            <div className="space-y-5">
              {formError && (
                <div className="p-4 rounded-2xl border text-sm text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="font-semibold">{formError}</span>
                </div>
              )}

              {/* Name Input */}
              <div className="space-y-2">
                <label className="text-sm font-bold opacity-80 flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-400" />
                  <span>{t('profileEdit.fullName') || 'الاسم الكامل'}</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('profileEdit.namePlaceholder') || 'أدخل اسمك...'}
                  className="w-full h-13 px-4 rounded-2xl border text-sm font-medium transition-colors focus:outline-hidden focus:border-amber-500"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              {/* Email Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold opacity-80 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>{t('profileEdit.email') || 'البريد الإلكتروني'}</span>
                  </label>
                  {isEmailChanged && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                      {t('profileEdit.otpNoticeEmail') || 'تأكيد OTP مطلوب'}
                    </span>
                  )}
                </div>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={t('profileEdit.emailPlaceholder') || 'example@domain.com'}
                  dir="ltr"
                  className="w-full h-13 px-4 rounded-2xl border text-sm font-mono transition-colors focus:outline-hidden focus:border-indigo-500"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: isEmailChanged ? 'rgba(99, 102, 241, 0.6)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              {/* Phone Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold opacity-80 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-400" />
                    <span>{t('profileEdit.phoneNumber') || 'رقم الموبايل'}</span>
                  </label>
                  {isPhoneChanged && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {t('profileEdit.otpNoticePhone') || 'تأكيد OTP مطلوب'}
                    </span>
                  )}
                </div>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={t('profileEdit.phonePlaceholder') || '01xxxxxxxxx'}
                  dir="ltr"
                  className="w-full h-13 px-4 rounded-2xl border text-sm font-mono transition-colors focus:outline-hidden focus:border-emerald-500"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: isPhoneChanged ? 'rgba(16, 185, 129, 0.6)' : 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              {/* OTP Notice Info Box */}
              {(isEmailChanged || isPhoneChanged) && (
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-start gap-3 leading-relaxed">
                  <KeyRound className="w-5 h-5 shrink-0 text-indigo-400 mt-0.5" />
                  <div>
                    <p className="font-bold">
                      {isEmailChanged && isPhoneChanged
                        ? (isRtl ? 'لتأكيد تغيير البريد ورقم الموبايل، سيتم التحقق من كل منهما برمز OTP مكون من 6 أرقام لحماية حسابك.' : 'To confirm new email and phone, each will be verified via a 6-digit OTP for security.')
                        : isEmailChanged
                        ? (isRtl ? 'سيتم إرسال رمز تحقق OTP مكون من 6 أرقام إلى بريدك الجديد لتأكيده.' : 'A 6-digit OTP verification code will be sent to your new email.')
                        : (isRtl ? 'سيتم إرسال رمز تحقق OTP مكون من 6 أرقام إلى رقم هاتفك الجديد لتأكيده.' : 'A 6-digit OTP verification code will be sent to your new phone.')}
                    </p>
                    <p className="text-[11px] opacity-70 mt-1 font-medium">
                      {t('profileEdit.rateLimitNotice') || 'مسموح بـ 5 رموز تحقق كحد أقصى كل 15 دقيقة.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  id="profile-save-changes-btn"
                  className="w-full sm:flex-1 h-13 px-6 rounded-2xl text-sm font-bold transition-all active:scale-98 shadow-md flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-btn-text)',
                  }}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('profileEdit.saving') || 'جاري الحفظ...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
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
                  className="w-full sm:w-auto h-13 px-6 rounded-2xl text-sm font-semibold border opacity-80 hover:opacity-100 transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  {t('profileEdit.cancel') || 'إلغاء'}
                </button>
              </div>
            </div>
          )}

          {/* ════════ MODE 3: PASSWORD CHANGE FORM ════════ */}
          {mode === 'password' && (
            <form onSubmit={handleRequestPasswordOtp} className="space-y-5">
              {pwdError && (
                <div className="p-4 rounded-2xl border text-sm text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="font-semibold">{pwdError}</span>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm">
                    {t('profileEdit.securityTitle') || 'تأمين كلمة المرور برمز OTP'}
                  </h3>
                  <p className="opacity-80 mt-1 leading-relaxed">
                    {isRtl 
                      ? 'لحماية حسابك، سيتم إرسال رمز تحقق مكون من 6 أرقام لتأكيد تغيير كلمة المرور. يمكنك استلام الرمز عبر رقم الموبايل أو البريد الإلكتروني.' 
                      : 'For your security, a 6-digit OTP will be sent to confirm your new password via SMS or Email.'}
                  </p>
                </div>
              </div>

              {/* New Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-bold opacity-80 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-cyan-400" />
                  <span>{t('profileEdit.newPassword') || 'كلمة المرور الجديدة'}</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('profileEdit.newPasswordPlaceholder') || '8 خانات على الأقل (حروف وأرقام)'}
                    className="w-full h-13 px-4 rounded-2xl border text-sm font-mono transition-colors focus:outline-hidden focus:border-cyan-500 pe-12"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 px-4 flex items-center text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-bold opacity-80 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>{t('profileEdit.confirmPassword') || 'تأكيد كلمة المرور'}</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('profileEdit.confirmPasswordPlaceholder') || 'أعد إدخال كلمة المرور للتحقق'}
                  className="w-full h-13 px-4 rounded-2xl border text-sm font-mono transition-colors focus:outline-hidden focus:border-cyan-500"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              {/* OTP Delivery Channel Selector */}
              <div className="space-y-2.5 pt-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-70 block">
                  {t('profileEdit.otpDeliveryChannel') || 'إرسال رمز التحقق OTP لتأكيد كلمة المرور عبر:'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Phone */}
                  <button
                    type="button"
                    onClick={() => setPwdDeliveryChannel('phone')}
                    className={`p-4 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-start ${
                      pwdDeliveryChannel === 'phone'
                        ? 'border-emerald-500 bg-emerald-500/15 shadow-sm'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold block">
                        {t('profileEdit.sendToPhone') || 'رقم الموبايل'}
                      </span>
                      <span className="text-xs font-mono opacity-80 truncate block mt-0.5" dir="ltr">
                        {currentPhone || (isRtl ? 'غير متوفر' : 'Not set')}
                      </span>
                    </div>
                  </button>

                  {/* Option B: Email */}
                  <button
                    type="button"
                    onClick={() => setPwdDeliveryChannel('email')}
                    className={`p-4 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-start ${
                      pwdDeliveryChannel === 'email'
                        ? 'border-indigo-500 bg-indigo-500/15 shadow-sm'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold block">
                        {t('profileEdit.sendToEmail') || 'البريد الإلكتروني'}
                      </span>
                      <span className="text-xs font-mono opacity-80 truncate block mt-0.5" dir="ltr">
                        {currentEmail || (isRtl ? 'غير متوفر' : 'Not set')}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Rate limit note */}
              <p className="text-xs opacity-60 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('profileEdit.rateLimitNotice') || 'مسموح بـ 5 رموز تحقق كحد أقصى كل 15 دقيقة.'}</span>
              </p>

              {/* Submit & Cancel */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isRequestingPwdOtp || !newPassword || !confirmPassword}
                  id="send-password-otp-btn"
                  className="w-full sm:flex-1 h-13 px-6 rounded-2xl text-sm font-bold transition-all active:scale-98 shadow-md flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-btn-text)',
                  }}
                >
                  {isRequestingPwdOtp ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('profileEdit.saving') || 'جاري إرسال الرمز...'}</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>{t('profileEdit.sendPasswordOtpBtn') || 'إرسال رمز التحقق لتغيير كلمة المرور'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('view');
                    setPwdError(null);
                  }}
                  disabled={isRequestingPwdOtp}
                  className="w-full sm:w-auto h-13 px-6 rounded-2xl text-sm font-semibold border opacity-80 hover:opacity-100 transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  {t('profileEdit.cancel') || 'إلغاء'}
                </button>
              </div>
            </form>
          )}

          {/* ════════ MODE 4: OTP VERIFICATION CHALLENGE ════════ */}
          {mode === 'otp' && (
            <div className="space-y-6">
              {/* Header Icon & Explanation */}
              <div className="text-center space-y-2">
                <div
                  className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center mb-3 shadow-lg border"
                  style={{ 
                    backgroundColor: 'rgba(99, 102, 241, 0.15)', 
                    color: '#6366F1',
                    borderColor: 'rgba(99, 102, 241, 0.3)'
                  }}
                >
                  <KeyRound className="w-8 h-8" />
                </div>

                <h3 className="text-lg sm:text-xl font-black">
                  {otpPurpose === 'password_change'
                    ? (t('profileEdit.verifyPasswordTitle') || 'تأكيد تغيير كلمة المرور')
                    : otpType === 'email'
                    ? (pendingPhoneUpdate ? (t('profileEdit.step1Email') || 'خطوة 1 من 2: تأكيد البريد الإلكتروني') : (t('profileEdit.verifyEmailTitle') || 'تأكيد البريد الإلكتروني الجديد'))
                    : (t('profileEdit.verifyPhoneTitle') || 'تأكيد رقم الموبايل الجديد')}
                </h3>

                <p className="text-xs sm:text-sm opacity-70 max-w-sm mx-auto leading-relaxed">
                  {otpType === 'email'
                    ? (t('profileEdit.verifyEmailSubtitle') || 'تم إرسال رمز التحقق المكون من 6 أرقام إلى: {email}').replace('{email}', otpTarget)
                    : (t('profileEdit.verifyPhoneSubtitle') || 'تم إرسال رمز التحقق المكون من 6 أرقام إلى: {phone}').replace('{phone}', otpTarget)}
                </p>
              </div>

              {/* Error message */}
              {otpError && (
                <div className="p-4 rounded-2xl border text-sm text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="font-semibold">{otpError}</span>
                </div>
              )}

              {/* Simulated SMS Card (Trial / Demo Mode) */}
              {otpType === 'phone' && simulatedSms && (
                <div className="p-4 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 animate-in fade-in duration-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                      <Smartphone className="w-4 h-4" />
                      <span>{t('profileEdit.simulatedSmsTitle') || 'رسالة SMS تجريبية (بيئة الاختبار):'}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-lg font-mono bg-indigo-500/20 text-indigo-300">
                      {simulatedSms.phone}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-mono font-bold tracking-widest text-indigo-200">
                      OTP: {simulatedSms.otp}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (simulatedSms.otp) setOtpInput(simulatedSms.otp);
                      }}
                      className="text-xs py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('profileEdit.fillOtp') || 'إدراج الرمز تلقائياً'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* OTP Form */}
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-70 block text-center">
                    {t('profileEdit.otpLabel') || 'أدخل رمز التحقق (6 أرقام)'}
                  </label>
                  <input
                    ref={otpInputRef}
                    type="text"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    dir="ltr"
                    className="w-full h-16 px-4 rounded-3xl border text-center font-mono text-2xl tracking-widest transition-colors focus:outline-hidden shadow-inner"
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
                  className="w-full h-13 px-6 rounded-2xl text-sm font-bold transition-all active:scale-98 shadow-md flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-btn-text)',
                  }}
                >
                  {isVerifyingOtp ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('profileEdit.saving') || 'جاري التحقق...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{t('profileEdit.confirmBtn') || 'تأكيد الرمز والحفظ'}</span>
                    </>
                  )}
                </button>

                {/* Resend button with 60s countdown & 15-min quota note */}
                <div className="pt-2 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || isResending}
                    className="h-11 px-5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: resendCooldown > 0 ? 'transparent' : 'rgba(99, 102, 241, 0.1)',
                      borderColor: resendCooldown > 0 ? 'var(--color-border)' : 'rgba(99, 102, 241, 0.3)',
                      color: resendCooldown > 0 ? 'var(--color-text)' : '#6366F1',
                    }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                    <span>
                      {resendCooldown > 0
                        ? (t('profileEdit.resendIn') || 'إعادة الإرسال بعد {seconds} ثانية').replace('{seconds}', String(resendCooldown))
                        : (t('profileEdit.resendReady') || 'إعادة إرسال رمز جديد الآن')}
                    </span>
                  </button>

                  <span className="text-[11px] opacity-50 text-center">
                    {t('profileEdit.rateLimitNotice') || 'مسموح بـ 5 رموز تحقق كحد أقصى كل 15 دقيقة.'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setMode(otpPurpose === 'password_change' ? 'password' : 'edit');
                      setOtpError(null);
                    }}
                    className="text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer mt-1"
                  >
                    {t('profileEdit.cancel') || 'رجوع'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
