'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, Buildings, Users, GitBranch, Calendar, Power, Plus,
  CaretDown, CaretUp, CircleNotch, SignOut, WarningCircle, CheckCircle,
  Globe, X, Sliders, Bell, Key, FloppyDisk, Check, Sparkle, ChatText,
  User, Trash, Warning, MagnifyingGlass
} from '@phosphor-icons/react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/components/LocaleProvider';
import { checkColorContrast } from '@/lib/branding';
import { 
  validateName, 
  validateEgyptianPhone, 
  validateEmail, 
  validatePassword 
} from '@/lib/validation';
import ProfileModal from '@/components/ProfileModal';

interface Business {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean;
  created_at: string;
  customer_count: number;
  branch_count: number;
}

interface PlatformUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  primaryRole: string;
  roles: Array<{
    role: string;
    businessId: string | null;
    businessName: string | null;
    subdomain: string | null;
    branchId: string | null;
    branchName: string | null;
  }>;
  customerLinks: Array<{
    customerId: string;
    name: string | null;
    phoneNumber: string | null;
    businessName: string | null;
  }>;
  isCurrentSuperAdmin: boolean;
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { t, isRtl } = useLocale();

  // Active top tab (Businesses vs Users)
  const [activeTab, setActiveTab] = useState<'businesses' | 'users'>('businesses');

  // Users Management state
  const [usersList, setUsersList] = useState<PlatformUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userToDelete, setUserToDelete] = useState<PlatformUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Business | null>(null);

  // Super Admin Profile & Deletion state
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [showSuperAdminProfile, setShowSuperAdminProfile] = useState(false);
  const [showSuperAdminDeleteModal, setShowSuperAdminDeleteModal] = useState(false);
  const [deleteAckChecked1, setDeleteAckChecked1] = useState(false);
  const [deleteAckChecked2, setDeleteAckChecked2] = useState(false);
  const [typedConfirmationPhrase, setTypedConfirmationPhrase] = useState('');
  const [isDeletingSuperAdmin, setIsDeletingSuperAdmin] = useState(false);
  const [deleteSuperAdminError, setDeleteSuperAdminError] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formSubdomain, setFormSubdomain] = useState('');
  const [formBranchName, setFormBranchName] = useState('');
  const [formOwnerEmail, setFormOwnerEmail] = useState('');
  const [formOwnerPassword, setFormOwnerPassword] = useState('');
  const [formOwnerPhone, setFormOwnerPhone] = useState('');

  // Phase 9.4: Auto-slugify subdomain from business name
  const handleNameChange = (val: string) => {
    setFormName(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setFormSubdomain(autoSlug);
  };

  // Phase 9.5 & 9.5.1: Branding modal state
  const [selectedBizForBranding, setSelectedBizForBranding] = useState<Business | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingDisplayName, setBrandingDisplayName] = useState('');
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState('#FAF7F2');
  const [brandingAccentColor, setBrandingAccentColor] = useState('#B08968');
  const [brandingFontFamily, setBrandingFontFamily] = useState('Inter');
  const [brandingLayoutVariant, setBrandingLayoutVariant] = useState<'centered-classic' | 'qr-top' | 'horizontal-offers'>('centered-classic');
  const [brandingFeedback, setBrandingFeedback] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Features modal state (Phase 16.3)
  const [selectedBizForFeatures, setSelectedBizForFeatures] = useState<Business | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresList, setFeaturesList] = useState<Array<{ key: string; name: string; description: string }>>([]);
  const [featuresMap, setFeaturesMap] = useState<Record<string, boolean>>({});
  const [notifProvider, setNotifProvider] = useState('whatsapp');
  const [notifPhoneId, setNotifPhoneId] = useState('');
  const [notifToken, setNotifToken] = useState('');
  const [smsProvider, setSmsProvider] = useState<'mock' | 'twilio'>('mock');
  const [smsAccountSid, setSmsAccountSid] = useState('');
  const [smsAuthToken, setSmsAuthToken] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-1.5-flash');
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [featuresFeedback, setFeaturesFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openFeaturesModal = async (biz: Business) => {
    setSelectedBizForFeatures(biz);
    setFeaturesLoading(true);
    setFeaturesFeedback(null);

    try {
      const res = await fetch(`/api/super-admin/features?businessId=${biz.id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch features');

      setFeaturesList(data.definitions || []);
      setFeaturesMap(data.features || {});
      if (data.notificationSettings) {
        setNotifProvider(data.notificationSettings.provider || 'whatsapp');
        setNotifPhoneId(data.notificationSettings.phone_number_id || '');
        setNotifToken(data.notificationSettings.access_token || '');
      } else {
        setNotifProvider('whatsapp');
        setNotifPhoneId('');
        setNotifToken('');
      }

      if (data.smsSettings) {
        setSmsProvider(data.smsSettings.provider || 'mock');
        setSmsAccountSid(data.smsSettings.account_sid || '');
        setSmsAuthToken(data.smsSettings.auth_token || '');
        setSmsSenderId(data.smsSettings.sender_id || '');
      } else {
        setSmsProvider('mock');
        setSmsAccountSid('');
        setSmsAuthToken('');
        setSmsSenderId('');
      }

      if (data.aiSettings) {
        setGeminiApiKey('');
        setAiModel(data.aiSettings.model || 'gemini-1.5-flash');
      } else {
        setGeminiApiKey('');
        setAiModel('gemini-1.5-flash');
      }
    } catch (err: any) {
      setFeaturesFeedback({ type: 'error', text: err.message });
    } finally {
      setFeaturesLoading(false);
    }
  };

  const handleToggleFeature = (featureKey: string) => {
    setFeaturesMap((prev) => ({
      ...prev,
      [featureKey]: !prev[featureKey],
    }));
  };

  const handleBulkFeatures = async (action: 'enable_all' | 'disable_all') => {
    if (!selectedBizForFeatures || !jwtToken) return;
    setIsSavingFeatures(true);
    setFeaturesFeedback(null);

    try {
      const res = await fetch('/api/super-admin/features', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          businessId: selectedBizForFeatures.id,
          bulkAction: action,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update features');

      const isEnable = action === 'enable_all';
      setFeaturesMap((prev) => {
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(prev)) {
          next[k] = isEnable;
        }
        return next;
      });

      setFeaturesFeedback({
        type: 'success',
        text: isEnable ? t('features.enableAllSuccess') : t('features.disableAllSuccess'),
      });
    } catch (err: any) {
      setFeaturesFeedback({ type: 'error', text: err.message || t('features.saveFailed') });
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const handleSaveFeatures = async () => {
    if (!selectedBizForFeatures || !jwtToken) return;
    setIsSavingFeatures(true);
    setFeaturesFeedback(null);

    try {
      // Single bulk PATCH request (Phase 22.6)
      const payload: any = {
        businessId: selectedBizForFeatures.id,
        features: featuresMap,
      };

      if (featuresMap['notifications']) {
        payload.notificationSettings = {
          provider: notifProvider,
          phoneNumberId: notifPhoneId.trim(),
          accessToken: notifToken.trim(),
        };
      }

      if (featuresMap['sms_notifications']) {
        payload.smsSettings = {
          provider: smsProvider,
          accountSid: smsAccountSid.trim(),
          authToken: smsAuthToken.trim(),
          senderId: smsSenderId.trim(),
        };
      }

      if ((featuresMap['ai_recommendations'] || featuresMap['ai_anomaly_detection']) && geminiApiKey.trim()) {
        payload.aiSettings = {
          geminiApiKey: geminiApiKey.trim(),
          model: aiModel,
        };
      }

      const res = await fetch('/api/super-admin/features', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('features.saveFailed'));

      setFeaturesFeedback({ type: 'success', text: t('features.savedSuccess') });
    } catch (err: any) {
      setFeaturesFeedback({ type: 'error', text: err.message || t('features.saveFailed') });
    } finally {
      setIsSavingFeatures(false);
    }
  };

  // Phase 9.5: Open and load Branding modal
  const openBrandingModal = async (biz: Business) => {
    setSelectedBizForBranding(biz);
    setBrandingLoading(true);
    setBrandingFeedback(null);

    try {
      const res = await fetch(`/api/admin/branding?businessId=${biz.id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (data.success && data.branding) {
        setBrandingDisplayName(data.branding.display_name || biz.name);
        setBrandingPrimaryColor(data.branding.primary_color || '#FAF7F2');
        setBrandingAccentColor(data.branding.accent_color || '#B08968');
        setBrandingFontFamily(data.branding.font_family || 'Inter');
        setBrandingLayoutVariant(data.branding.layout_variant || 'centered-classic');
      }
    } catch (err: any) {
      setBrandingFeedback({ type: 'error', text: err.message });
    } finally {
      setBrandingLoading(false);
    }
  };

  // Phase 9.5 & 9.5.2: Save branding with contrast check warning
  const handleSaveBranding = async () => {
    if (!selectedBizForBranding || !jwtToken) return;
    setIsSavingBranding(true);
    setBrandingFeedback(null);

    try {
      const res = await fetch('/api/admin/branding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          businessId: selectedBizForBranding.id,
          displayName: brandingDisplayName,
          primaryColor: brandingPrimaryColor,
          accentColor: brandingAccentColor,
          fontFamily: brandingFontFamily,
          layoutVariant: brandingLayoutVariant,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update branding');

      if (data.contrastWarning) {
        setBrandingFeedback({
          type: 'warning',
          text: `تم الحفظ بنجاح، لكن تنبيه: تباين اللون ضعيف مع معايير WCAG AA. اللون المقترح: ${data.suggestedColor}`,
        });
      } else {
        setBrandingFeedback({ type: 'success', text: 'تم حفظ الهوية وتصميم المكان بنجاح!' });
      }
    } catch (err: any) {
      setBrandingFeedback({ type: 'error', text: err.message || 'فشل حفظ الهوية' });
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Auth check
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/super-admin/login');
        return;
      }

      // Verify super_admin role
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!userRole || userRole.role !== 'super_admin') {
        await supabase.auth.signOut();
        router.replace('/super-admin/login');
        return;
      }

      setJwtToken(session.access_token);
      setSuperAdminEmail(session.user.email || '');
      setIsAuthed(true);
    })();
  }, [router]);

  // Fetch businesses
  const fetchBusinesses = useCallback(async () => {
    if (!jwtToken) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/super-admin/businesses', {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setBusinesses(data.businesses || []);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [jwtToken]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!jwtToken) return;
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/super-admin/users', {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
      setUsersList(data.users || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [jwtToken]);

  useEffect(() => {
    if (isAuthed && jwtToken) {
      fetchBusinesses();
      fetchUsers();
    }
  }, [isAuthed, jwtToken, fetchBusinesses, fetchUsers]);

  // Permanently delete any user account
  const handleConfirmDeleteUser = async () => {
    if (!userToDelete || !jwtToken) return;
    setIsDeletingUser(true);
    setDeleteUserError(null);
    try {
      const res = await fetch(`/api/super-admin/users?id=${userToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete user');
      }
      setSuccessMsg(data.message || t('superAdmin.userDeletedSuccess'));
      setUserToDelete(null);
      await fetchUsers();
      await fetchBusinesses();
    } catch (err: any) {
      setDeleteUserError(err.message || 'Failed to delete user');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Toggle business status
  const handleToggle = async (biz: Business) => {
    setTogglingId(biz.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/super-admin/businesses', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ businessId: biz.id, isActive: !biz.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle');

      setBusinesses((prev) =>
        prev.map((b) => (b.id === biz.id ? { ...b, is_active: !b.is_active } : b))
      );
      setSuccessMsg(t('superAdmin.toggleSuccess').replace('{name}', biz.name));
      setConfirmToggle(null);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  // Create business
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameVal = validateName(formName);
    if (!nameVal.isValid) {
      setErrorMsg(t(`validation.${nameVal.errorKey}`));
      return;
    }

    const emailVal = validateEmail(formOwnerEmail);
    if (!emailVal.isValid) {
      setErrorMsg(t(`validation.${emailVal.errorKey}`));
      return;
    }

    const passVal = validatePassword(formOwnerPassword);
    if (!passVal.isValid) {
      setErrorMsg(t(`validation.${passVal.errorKey}`));
      return;
    }

    const phoneVal = validateEgyptianPhone(formOwnerPhone);
    if (!phoneVal.isValid) {
      setErrorMsg(t(`validation.${phoneVal.errorKey}`));
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/super-admin/businesses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          name: formName,
          subdomain: formSubdomain,
          ownerEmail: formOwnerEmail,
          ownerPassword: formOwnerPassword,
          ownerPhone: formOwnerPhone,
          branchName: formBranchName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');

      setSuccessMsg(t('superAdmin.createSuccess').replace('{name}', formName));
      setFormName('');
      setFormSubdomain('');
      setFormBranchName('');
      setFormOwnerEmail('');
      setFormOwnerPassword('');
      setFormOwnerPhone('');
      setShowCreateForm(false);
      fetchBusinesses();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/super-admin/login');
  };

  // Delete Super Admin Account with Heightened Security Confirmations
  const handleDeleteSuperAdmin = async () => {
    if (!jwtToken) return;
    const phrase = typedConfirmationPhrase.trim();
    const validPhrases = [
      'حذف حساب السوبر أدمن نهائياً',
      'DELETE SUPER ADMIN ACCOUNT',
    ];
    if (!validPhrases.includes(phrase)) {
      setDeleteSuperAdminError(isRtl ? 'عبارة التأكيد غير مطابقة تماماً' : 'Confirmation phrase does not match');
      return;
    }
    if (!deleteAckChecked1 || !deleteAckChecked2) {
      setDeleteSuperAdminError(isRtl ? 'يرجى تحديد كافة بنود الإقرار والتأكيد' : 'Please check all acknowledgment checkboxes');
      return;
    }

    setIsDeletingSuperAdmin(true);
    setDeleteSuperAdminError(null);

    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ confirmationPhrase: phrase }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isRtl ? 'فشل حذف الحساب' : 'Failed to delete account'));
      }

      await supabase.auth.signOut();
      router.replace('/super-admin/login');
    } catch (err: any) {
      setDeleteSuperAdminError(err.message || (isRtl ? 'حدث خطأ أثناء حذف الحساب' : 'An error occurred'));
    } finally {
      setIsDeletingSuperAdmin(false);
    }
  };

  // Filtered users list
  const filteredUsers = usersList.filter((u) => {
    const matchesSearch =
      !userSearchQuery.trim() ||
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase());
    const matchesRole =
      userRoleFilter === 'all' || u.primaryRole === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  if (!isAuthed) {
    return (
      <main
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ background: 'var(--page-bg-gradient)' }}
      >
        <CircleNotch weight="light" className="w-6 h-6 animate-spin" style={{ color: '#6C63FF' }} />
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col relative overflow-hidden"
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

      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between p-4 border-b shadow-lg backdrop-blur-xl relative"
        style={{ backgroundColor: 'rgba(16, 14, 28, 0.8)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #6C63FF, #4ECDC4)',
              color: '#fff',
            }}
          >
            <Shield weight="light" className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold">{t('superAdmin.dashboardTitle')}</h1>
            <p className="text-[11px] opacity-60">{t('superAdmin.dashboardSubtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            onClick={() => {
              setShowSuperAdminProfile(true);
              setShowSuperAdminDeleteModal(false);
              setDeleteSuperAdminError(null);
            }}
            id="super-admin-profile-btn"
            title={t('accountDeletion.profileTitle')}
            aria-label={t('accountDeletion.profileTitle')}
            className="w-9 h-9 rounded-full flex items-center justify-center border transition-all hover:opacity-80 active:scale-95 cursor-pointer"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <User weight="light" className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-full flex items-center justify-center border transition-colors hover:opacity-80 cursor-pointer"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            aria-label={t('superAdmin.logout')}
          >
            <SignOut weight="light" className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full relative z-10">
        {/* Alert Messages */}
        {errorMsg && (
          <div
            className="p-3 rounded-xl border text-xs flex items-center gap-2 mb-4"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error-text)',
              borderColor: 'var(--color-error-border)',
            }}
          >
            <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)}><X weight="light" className="w-3 h-3" /></button>
          </div>
        )}
        {successMsg && (
          <div
            className="p-3 rounded-xl border text-xs flex items-center gap-2 mb-4"
            style={{
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success-text)',
              borderColor: 'var(--color-success-border)',
            }}
          >
            <CheckCircle weight="light" className="w-4 h-4 shrink-0" />
            <span className="flex-1">{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)}><X weight="light" className="w-3 h-3" /></button>
          </div>
        )}

        {/* Navigation Tabs (Businesses vs Users) */}
        <div
          className="flex items-center p-1 rounded-2xl border mb-5 backdrop-blur-xl shadow-xs"
          style={{ backgroundColor: 'rgba(16, 14, 28, 0.7)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('businesses')}
            id="tab-businesses-btn"
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'businesses' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={
              activeTab === 'businesses'
                ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }
                : {}
            }
          >
            <Buildings weight="light" className="w-4 h-4" />
            <span>{t('superAdmin.tabBusinesses')}</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: activeTab === 'businesses' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {businesses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('users');
              fetchUsers();
            }}
            id="tab-users-btn"
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'users' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={
              activeTab === 'users'
                ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }
                : {}
            }
          >
            <Users weight="light" className="w-4 h-4" />
            <span>{t('superAdmin.tabUsers')}</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: activeTab === 'users' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {usersList.length}
            </span>
          </button>
        </div>

        {/* ──── TAB 1: BUSINESSES ──── */}
        {activeTab === 'businesses' && (
          <div className="animate-in fade-in duration-150">
            {/* Create Business Section */}
            <div
              className="rounded-2xl border mb-6 overflow-hidden"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full flex items-center justify-between p-4 text-sm font-semibold transition-colors hover:opacity-80"
          >
            <div className="flex items-center gap-2">
              <Plus weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span>{t('superAdmin.createTitle')}</span>
            </div>
            {showCreateForm ? (
              <CaretUp weight="light" className="w-4 h-4 opacity-50" />
            ) : (
              <CaretDown weight="light" className="w-4 h-4 opacity-50" />
            )}
          </button>

          {showCreateForm && (
            <form onSubmit={handleCreate} className="p-4 pt-0 flex flex-col gap-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] opacity-60 mb-1">{t('superAdmin.createSubtitle')}</p>

              {/* Business Name */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('superAdmin.businessName')}</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('superAdmin.businessNamePlaceholder')}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                {formName.trim() !== '' && !validateName(formName).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validateName(formName).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Subdomain */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('superAdmin.subdomainLabel')}</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={formSubdomain}
                    onChange={(e) => setFormSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder={t('superAdmin.subdomainPlaceholder')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden ${isRtl ? 'pr-9' : 'pl-9'}`}
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  <Globe weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
                </div>
              </div>

              {/* Branch Name */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('superAdmin.branchName')}</label>
                <input
                  type="text"
                  required
                  value={formBranchName}
                  onChange={(e) => setFormBranchName(e.target.value)}
                  placeholder={t('superAdmin.branchNamePlaceholder')}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              {/* Owner Email */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('superAdmin.ownerEmail')}</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={formOwnerEmail}
                  onChange={(e) => setFormOwnerEmail(e.target.value)}
                  placeholder={t('superAdmin.ownerEmailPlaceholder')}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                {formOwnerEmail.trim() !== '' && !validateEmail(formOwnerEmail).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validateEmail(formOwnerEmail).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Owner Password */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">{t('superAdmin.ownerPassword')}</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  minLength={8}
                  value={formOwnerPassword}
                  onChange={(e) => setFormOwnerPassword(e.target.value)}
                  placeholder={t('superAdmin.ownerPasswordPlaceholder')}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                {formOwnerPassword !== '' && !validatePassword(formOwnerPassword).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validatePassword(formOwnerPassword).errorKey}`)}
                  </p>
                )}
              </div>

              {/* Owner Phone (Phase 9.4) */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  {isRtl ? 'رقم هاتف المالك (إلزامي)' : 'Owner Phone (Mandatory)'}
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  maxLength={11}
                  value={formOwnerPhone}
                  onChange={(e) => setFormOwnerPhone(e.target.value)}
                  placeholder="01000000000"
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                {formOwnerPhone.trim() !== '' && !validateEgyptianPhone(formOwnerPhone).isValid && (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    {t(`validation.${validateEgyptianPhone(formOwnerPhone).errorKey}`)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
                  color: 'var(--color-btn-text)',
                }}
              >
                {isCreating ? <CircleNotch weight="light" className="w-4 h-4 animate-spin" /> : <Plus weight="light" className="w-4 h-4" />}
                <span>{isCreating ? t('superAdmin.creating') : t('superAdmin.createBtn')}</span>
              </button>
            </form>
          )}
        </div>

        {/* Business List */}
        <h2 className="text-sm font-bold mb-3">
          {t('superAdmin.businessesTitle').replace('{count}', String(businesses.length))}
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <CircleNotch weight="light" className="w-5 h-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : businesses.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl border"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <Buildings weight="light" className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-xs opacity-60">{t('superAdmin.noBusiness')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {businesses.map((biz) => (
              <div
                key={biz.id}
                className="rounded-2xl border p-4 transition-all"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border)',
                  opacity: biz.is_active ? 1 : 0.7,
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Buildings weight="light" className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                      <span className="text-sm font-bold truncate">{biz.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] opacity-60">
                      <Globe weight="light" className="w-3 h-3" />
                      <span dir="ltr">{biz.subdomain}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                    style={{
                      backgroundColor: biz.is_active ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                      color: biz.is_active ? 'var(--color-success-text)' : 'var(--color-error-text)',
                      border: `1px solid ${biz.is_active ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
                    }}
                  >
                    {biz.is_active ? t('superAdmin.statusActive') : t('superAdmin.statusInactive')}
                  </span>
                </div>

                {/* Stats Row */}
                <div
                  className="flex items-center gap-4 text-[11px] mb-3 py-2 px-3 rounded-xl"
                  style={{ backgroundColor: 'var(--color-bg)' }}
                >
                  <div className="flex items-center gap-1">
                    <Users weight="light" className="w-3 h-3 opacity-50" />
                    <span className="font-medium">{biz.customer_count}</span>
                    <span className="opacity-60">{t('superAdmin.customers')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitBranch weight="light" className="w-3 h-3 opacity-50" />
                    <span className="font-medium">{biz.branch_count}</span>
                    <span className="opacity-60">{t('superAdmin.branches')}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
                    <Calendar weight="light" className="w-3 h-3 opacity-50" />
                    <span className="opacity-60">
                      {new Date(biz.created_at).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Actions: Features, Branding & Toggle */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => openFeaturesModal(biz)}
                    className="py-2 px-2 rounded-xl text-[10px] font-semibold border flex items-center justify-center gap-1 transition-all hover:opacity-80 active:scale-[0.98]"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    <Sliders weight="light" className="w-3.5 h-3.5" />
                    <span>{t('features.btnManage')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openBrandingModal(biz)}
                    className="py-2 px-2 rounded-xl text-[10px] font-semibold border flex items-center justify-center gap-1 transition-all hover:opacity-80 active:scale-[0.98]"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-accent)',
                    }}
                    id={`branding-btn-${biz.id}`}
                  >
                    <Sparkle weight="light" className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'الهوية' : 'Branding'}</span>
                  </button>

                  <button
                    onClick={() => setConfirmToggle(biz)}
                    disabled={togglingId === biz.id}
                    className="py-2 px-2 rounded-xl text-[10px] font-semibold border flex items-center justify-center gap-1 transition-all hover:opacity-80 active:scale-[0.98] disabled:opacity-50"
                    style={{
                      borderColor: biz.is_active ? 'var(--color-error-border)' : 'var(--color-success-border)',
                      color: biz.is_active ? 'var(--color-error-text)' : 'var(--color-success-text)',
                      backgroundColor: biz.is_active ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                    }}
                  >
                    {togglingId === biz.id ? (
                      <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                    ) : biz.is_active ? (
                      <Power weight="light" className="w-3.5 h-3.5" />
                    ) : (
                      <Power weight="light" className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {biz.is_active ? t('superAdmin.statusInactive') : t('superAdmin.statusActive')}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* ──── TAB 2: USERS MANAGEMENT ──── */}
    {activeTab === 'users' && (
      <div className="animate-in fade-in duration-150 space-y-4">
        {/* User Statistics Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <span className="text-[11px] opacity-60 font-medium">{t('superAdmin.tabUsers')}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-extrabold">{usersList.length}</span>
              <Users weight="light" className="w-4 h-4 opacity-40 text-purple-400" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <span className="text-[11px] opacity-60 font-medium">{t('superAdmin.roleOwner')}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-extrabold text-amber-500">
                {usersList.filter((u) => u.roles.some((r) => r.role === 'owner') || u.primaryRole === 'owner').length}
              </span>
              <Buildings weight="light" className="w-4 h-4 opacity-40 text-amber-500" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <span className="text-[11px] opacity-60 font-medium">{t('superAdmin.roleCashier')}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-extrabold text-blue-500">
                {usersList.filter((u) => u.roles.some((r) => r.role === 'cashier') || u.primaryRole === 'cashier').length}
              </span>
              <GitBranch weight="light" className="w-4 h-4 opacity-40 text-blue-500" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <span className="text-[11px] opacity-60 font-medium">{t('superAdmin.roleCustomer')}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-extrabold text-emerald-500">
                {usersList.filter((u) => u.customerLinks.length > 0 || u.roles.some((r) => r.role === 'customer') || u.primaryRole === 'customer').length}
              </span>
              <User weight="light" className="w-4 h-4 opacity-40 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Search, Filter & Refresh Bar */}
        <div
          className="p-3 rounded-2xl border flex flex-wrap items-center gap-2"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px]">
            <MagnifyingGlass weight="light" className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 opacity-40" />
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder={t('superAdmin.searchUserPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-xl text-xs border bg-transparent transition-colors focus:outline-none"
              style={{ borderColor: 'var(--color-border)' }}
            />
            {userSearchQuery && (
              <button
                type="button"
                onClick={() => setUserSearchQuery('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 opacity-50 hover:opacity-100 p-0.5"
              >
                <X weight="light" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role Filter Select */}
          <div className="flex items-center gap-1 text-xs">
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="py-2 px-3 rounded-xl border text-xs bg-transparent transition-colors focus:outline-none cursor-pointer"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)' }}
            >
              <option value="all">{t('superAdmin.allRoles')}</option>
              <option value="super_admin">{t('superAdmin.roleSuperAdmin')}</option>
              <option value="owner">{t('superAdmin.roleOwner')}</option>
              <option value="branch_admin">{t('superAdmin.roleBranchAdmin')}</option>
              <option value="cashier">{t('superAdmin.roleCashier')}</option>
              <option value="customer">{t('superAdmin.roleCustomer')}</option>
            </select>
          </div>

          {/* Refresh Users Button */}
          <button
            type="button"
            onClick={fetchUsers}
            disabled={isLoadingUsers}
            title={t('common.loading')}
            className="p-2 rounded-xl border transition-all hover:opacity-80 active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <CircleNotch weight="light" className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Users List Container */}
        {isLoadingUsers ? (
          <div className="flex justify-center py-12">
            <CircleNotch weight="light" className="w-5 h-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl border"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <Users weight="light" className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-xs opacity-60">{t('superAdmin.noUsersFound')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredUsers.map((u) => {
              const isSuper = u.isCurrentSuperAdmin;
              return (
                <div
                  key={u.id}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    backgroundColor: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    {/* User Info & Email */}
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                        style={{
                          background: isSuper
                            ? 'linear-gradient(135deg, #8B5CF6, #EC4899)'
                            : u.primaryRole === 'owner'
                            ? 'linear-gradient(135deg, #F59E0B, #EF4444)'
                            : u.primaryRole === 'cashier'
                            ? 'linear-gradient(135deg, #3B82F6, #06B6D4)'
                            : 'linear-gradient(135deg, #10B981, #059669)',
                          color: '#fff',
                        }}
                      >
                        {isSuper ? (
                          <Shield weight="light" className="w-4 h-4" />
                        ) : (
                          <User weight="light" className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate" dir="ltr">
                            {u.email}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] opacity-60 mt-0.5">
                          <span>
                            {t('superAdmin.userCreated')}: {new Date(u.createdAt).toLocaleDateString()}
                          </span>
                          {u.lastSignInAt && (
                            <span>
                              {t('superAdmin.userLastSignIn')}: {new Date(u.lastSignInAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Button: Delete or Cannot Delete Self */}
                    <div>
                      {isSuper ? (
                        <span
                          className="px-2.5 py-1 rounded-xl text-[10px] font-bold border flex items-center gap-1 opacity-70"
                          style={{
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            color: '#A855F7',
                          }}
                        >
                          <Shield weight="light" className="w-3 h-3" />
                          <span>{t('superAdmin.cannotDeleteSelf')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setUserToDelete(u);
                            setDeleteUserError(null);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all text-rose-500 hover:bg-rose-500/10 active:scale-95 cursor-pointer"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          title={t('common.delete')}
                        >
                          <Trash weight="light" className="w-3.5 h-3.5" />
                          <span>{t('common.delete')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Roles & Place Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    {/* Primary Role Badge */}
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold border"
                      style={{
                        backgroundColor:
                          u.primaryRole === 'super_admin'
                            ? 'rgba(147, 51, 234, 0.15)'
                            : u.primaryRole === 'owner'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : u.primaryRole === 'branch_admin'
                            ? 'rgba(14, 165, 233, 0.15)'
                            : u.primaryRole === 'cashier'
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                        borderColor:
                          u.primaryRole === 'super_admin'
                            ? 'rgba(147, 51, 234, 0.3)'
                            : u.primaryRole === 'owner'
                            ? 'rgba(245, 158, 11, 0.3)'
                            : u.primaryRole === 'branch_admin'
                            ? 'rgba(14, 165, 233, 0.3)'
                            : u.primaryRole === 'cashier'
                            ? 'rgba(59, 130, 246, 0.3)'
                            : 'rgba(16, 185, 129, 0.3)',
                        color:
                          u.primaryRole === 'super_admin'
                            ? '#C084FC'
                            : u.primaryRole === 'owner'
                            ? '#FBBF24'
                            : u.primaryRole === 'branch_admin'
                            ? '#38BDF8'
                            : u.primaryRole === 'cashier'
                            ? '#60A5FA'
                            : '#34D399',
                      }}
                    >
                      {u.primaryRole === 'super_admin'
                        ? t('superAdmin.roleSuperAdmin')
                        : u.primaryRole === 'owner'
                        ? t('superAdmin.roleOwner')
                        : u.primaryRole === 'branch_admin'
                        ? t('superAdmin.roleBranchAdmin')
                        : u.primaryRole === 'cashier'
                        ? t('superAdmin.roleCashier')
                        : t('superAdmin.roleCustomer')}
                    </span>

                    {/* Associated Businesses & Branches */}
                    {u.roles.map((r, rIdx) => {
                      if (!r.businessName) return null;
                      return (
                        <span
                          key={rIdx}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 opacity-80"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <Buildings weight="light" className="w-2.5 h-2.5 opacity-60" />
                          <span>{r.businessName}</span>
                          {r.branchName && <span className="opacity-60">({r.branchName})</span>}
                        </span>
                      );
                    })}

                    {/* Customer Linked Cards */}
                    {u.customerLinks.map((c, cIdx) => (
                      <span
                        key={`cust-${cIdx}`}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1"
                        style={{
                          borderColor: 'rgba(16, 185, 129, 0.25)',
                          backgroundColor: 'rgba(16, 185, 129, 0.08)',
                          color: '#34D399',
                        }}
                      >
                        <span>بطاقة {c.businessName || 'Pointat'}</span>
                        {c.phoneNumber && <span dir="ltr" className="opacity-75">({c.phoneNumber})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}
  </div>

  {/* User Deletion Confirmation Modal */}
  {userToDelete && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--color-overlay-bg)' }}
      onClick={() => {
        if (!isDeletingUser) {
          setUserToDelete(null);
          setDeleteUserError(null);
        }
      }}
    >
      <div
        className="rounded-3xl p-6 border shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-150 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
          >
            <Warning weight="light" className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-rose-500">
              حذف الحساب نهائياً
            </h3>
            <p className="text-xs opacity-70 truncate" dir="ltr">
              {userToDelete.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setUserToDelete(null);
              setDeleteUserError(null);
            }}
            disabled={isDeletingUser}
            className="w-8 h-8 rounded-full flex items-center justify-center border transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <X weight="light" className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Message */}
        <div
          className="p-3.5 rounded-2xl border text-xs leading-relaxed"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            color: 'var(--color-text)',
          }}
        >
          <p className="mb-2">
            {t('superAdmin.confirmDeleteUser').replace('{email}', userToDelete.email)}
          </p>
          <ul className="list-disc list-inside opacity-80 text-[11px] space-y-1">
            <li>سيتم حذف الحساب نهائياً من قاعدة بيانات Supabase Auth.</li>
            <li>سيتم إلغاء كافة الصلاحيات والأدوار الإدارية المرتبطة به.</li>
            <li>سيتم مسح أي روابط بطاقات أو نقاط مسجلة بحسابه.</li>
          </ul>
        </div>

        {/* User Details Summary */}
        <div
          className="p-3 rounded-xl border text-xs space-y-1.5"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="opacity-60">{t('accountDeletion.roleLabel')}:</span>
            <span className="font-semibold">{userToDelete.primaryRole}</span>
          </div>
          {userToDelete.roles.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="opacity-60">الأدوار المباشرة:</span>
              <span className="font-mono text-[11px]">
                {userToDelete.roles.map((r) => r.role + (r.businessName ? ` (${r.businessName})` : '')).join(', ')}
              </span>
            </div>
          )}
          {userToDelete.customerLinks.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="opacity-60">بطاقات العملاء:</span>
              <span className="text-[11px]">
                {userToDelete.customerLinks.length} بطاقة
              </span>
            </div>
          )}
        </div>

        {/* Error Feedback */}
        {deleteUserError && (
          <div
            className="p-3 rounded-xl border text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              borderColor: 'var(--color-error-border)',
              color: 'var(--color-error-text)',
            }}
          >
            <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
            <span className="flex-1">{deleteUserError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setUserToDelete(null);
              setDeleteUserError(null);
            }}
            disabled={isDeletingUser}
            className="flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleConfirmDeleteUser}
            id="confirm-delete-user-btn"
            disabled={isDeletingUser}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: '#EF4444' }}
          >
            {isDeletingUser ? (
              <>
                <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                <span>{t('accountDeletion.deleting')}</span>
              </>
            ) : (
              <>
                <Trash weight="light" className="w-3.5 h-3.5" />
                <span>{t('common.delete')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )}

      {/* Confirmation Modal */}
      {confirmToggle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => setConfirmToggle(null)}
        >
          <div
            className="rounded-2xl p-5 border shadow-lg max-w-sm w-full"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: confirmToggle.is_active ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                  color: confirmToggle.is_active ? 'var(--color-error-text)' : 'var(--color-success-text)',
                }}
              >
                {confirmToggle.is_active ? <Power weight="light" className="w-6 h-6" /> : <Power weight="light" className="w-6 h-6" />}
              </div>
              <p className="text-sm font-semibold">
                {confirmToggle.is_active
                  ? t('superAdmin.deactivateConfirm').replace('{name}', confirmToggle.name)
                  : t('superAdmin.activateConfirm').replace('{name}', confirmToggle.name)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleToggle(confirmToggle)}
                disabled={togglingId === confirmToggle.id}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                style={{
                  backgroundColor: confirmToggle.is_active ? 'var(--color-error-text)' : 'var(--color-success-text)',
                  color: 'var(--color-card-bg)',
                }}
              >
                {togglingId === confirmToggle.id && <CircleNotch weight="light" className="w-3 h-3 animate-spin" />}
                <span>{confirmToggle.is_active ? t('superAdmin.statusInactive') : t('superAdmin.statusActive')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Features & Notifications Modal (Phase 16.3) */}
      {selectedBizForFeatures && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
          style={{ backgroundColor: 'var(--color-overlay-bg)' }}
          onClick={() => setSelectedBizForFeatures(null)}
        >
          <div
            className="rounded-3xl p-6 border shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto flex flex-col gap-4 animate-in zoom-in-95 duration-150"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sliders weight="light" className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                  <h3 className="text-sm font-bold">{t('features.title')}</h3>
                </div>
                <p className="text-[11px] opacity-60">
                  {selectedBizForFeatures.name} ({selectedBizForFeatures.subdomain})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBizForFeatures(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center border transition-opacity hover:opacity-80"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <X weight="light" className="w-4 h-4" />
              </button>
            </div>

            {/* Feedback Alert */}
            {featuresFeedback && (
              <div
                className="p-3 rounded-xl border text-xs flex items-center gap-2"
                style={{
                  backgroundColor: featuresFeedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                  color: featuresFeedback.type === 'success' ? 'var(--color-success-text)' : 'var(--color-error-text)',
                  borderColor: featuresFeedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
                }}
              >
                {featuresFeedback.type === 'success' ? <Check weight="light" className="w-4 h-4 shrink-0" /> : <WarningCircle weight="light" className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{featuresFeedback.text}</span>
              </div>
            )}

            {featuresLoading ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-70">
                <CircleNotch weight="light" className="w-6 h-6 animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
                <span className="text-xs">{t('features.loadingFeatures')}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Bulk Action Buttons (Phase 22.6) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="enable-all-features-btn"
                    onClick={() => handleBulkFeatures('enable_all')}
                    disabled={isSavingFeatures}
                    className="flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-accent)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    <CheckCircle weight="light" className="w-3.5 h-3.5" />
                    <span>{t('features.enableAll')}</span>
                  </button>
                  <button
                    type="button"
                    id="disable-all-features-btn"
                    onClick={() => handleBulkFeatures('disable_all')}
                    disabled={isSavingFeatures}
                    className="flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <Power weight="light" className="w-3.5 h-3.5" />
                    <span>{t('features.disableAll')}</span>
                  </button>
                </div>

                {/* 1. Notifications Feature Card (Highlighted) */}
                <div
                  className="p-4 rounded-2xl border transition-colors"
                  style={{
                    backgroundColor: featuresMap['notifications'] ? 'var(--color-bg)' : 'var(--color-card-bg)',
                    borderColor: featuresMap['notifications'] ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                      >
                        <Bell weight="light" className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold">{t('features.notificationsTitle')}</h4>
                        <p className="text-[11px] opacity-60">{t('features.notificationsDesc')}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleFeature('notifications')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        featuresMap['notifications'] ? 'bg-[var(--color-accent)]' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          featuresMap['notifications'] ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* WhatsApp Credentials form (only if notifications toggled ON) */}
                  {featuresMap['notifications'] && (
                    <div className="mt-3 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--color-border)' }}>
                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{t('features.provider')}</label>
                        <select
                          value={notifProvider}
                          onChange={(e) => setNotifProvider(e.target.value)}
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        >
                          <option value="whatsapp">{t('features.whatsappCloud')}</option>
                          <option value="mock">{t('features.mockProvider')}</option>
                        </select>
                      </div>

                      {notifProvider === 'whatsapp' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold mb-1 opacity-80">{t('features.phoneNumberId')}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={notifPhoneId}
                              onChange={(e) => setNotifPhoneId(e.target.value)}
                              placeholder={t('features.phoneNumberIdPlaceholder')}
                              className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold mb-1 opacity-80">{t('features.accessToken')}</label>
                            <input
                              type="password"
                              dir="ltr"
                              value={notifToken}
                              onChange={(e) => setNotifToken(e.target.value)}
                              placeholder={t('features.accessTokenPlaceholder')}
                              className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 1.5 SMS Notifications Feature Card (Phase 30) */}
                <div
                  className="p-4 rounded-2xl border transition-colors"
                  style={{
                    backgroundColor: featuresMap['sms_notifications'] ? 'var(--color-bg)' : 'var(--color-card-bg)',
                    borderColor: featuresMap['sms_notifications'] ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                      >
                        <ChatText weight="light" className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold">{isRtl ? 'إشعارات الرسائل القصيرة (SMS)' : 'SMS Notifications'}</h4>
                        <p className="text-[11px] opacity-60">{isRtl ? 'إرسال رسائل SMS فورية للعملاء مع دعم Twilio و Sandbox' : 'Send SMS messages to customers via Twilio or Sandbox'}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleFeature('sms_notifications')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        featuresMap['sms_notifications'] ? 'bg-[var(--color-accent)]' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          featuresMap['sms_notifications'] ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* SMS Settings form (only if sms_notifications toggled ON) */}
                  {featuresMap['sms_notifications'] && (
                    <div className="mt-3 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--color-border)' }}>
                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'مزود الخدمة (Provider)' : 'SMS Provider'}</label>
                        <select
                          value={smsProvider}
                          onChange={(e) => setSmsProvider(e.target.value as any)}
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        >
                          <option value="mock">{isRtl ? 'بيئة تجريبية مجانية (Mock Sandbox)' : 'Mock Sandbox (Free)'}</option>
                          <option value="twilio">Twilio SMS Gateway</option>
                        </select>
                      </div>

                      {smsProvider === 'twilio' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold mb-1 opacity-80">Twilio Account SID</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={smsAccountSid}
                              onChange={(e) => setSmsAccountSid(e.target.value)}
                              placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                              className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold mb-1 opacity-80">Twilio Auth Token</label>
                            <input
                              type="password"
                              dir="ltr"
                              value={smsAuthToken}
                              onChange={(e) => setSmsAuthToken(e.target.value)}
                              placeholder="••••••••••••••••••••••••••••••••"
                              className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'معرف المرسل أو رقم الهاتف (Sender ID / From)' : 'Sender ID or Twilio Phone'}</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={smsSenderId}
                              onChange={(e) => setSmsSenderId(e.target.value)}
                              placeholder="+1234567890 or POINTAT"
                              className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. AI Recommendations Feature Card (Phase 24.3) */}
                <div
                  className="p-4 rounded-2xl border transition-colors"
                  style={{
                    backgroundColor: featuresMap['ai_recommendations'] ? 'var(--color-bg)' : 'var(--color-card-bg)',
                    borderColor: featuresMap['ai_recommendations'] ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                      >
                        <Sparkle weight="light" className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold">{t('features.aiRecommendationsTitle')}</h4>
                        <p className="text-[11px] opacity-60">{t('features.aiRecommendationsDesc')}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleFeature('ai_recommendations')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        featuresMap['ai_recommendations'] ? 'bg-[var(--color-accent)]' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          featuresMap['ai_recommendations'] ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Gemini API Key form (if either ai_recommendations or ai_anomaly_detection toggled ON) */}
                  {(featuresMap['ai_recommendations'] || featuresMap['ai_anomaly_detection']) && (
                    <div className="mt-3 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--color-border)' }}>
                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{t('features.geminiApiKey')}</label>
                        <input
                          type="password"
                          dir="ltr"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder={t('features.geminiApiKeyPlaceholder')}
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{t('features.geminiModel')}</label>
                        <select
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        >
                          <option value="gemini-1.5-flash">{t('features.geminiFlash')}</option>
                          <option value="gemini-1.5-pro">{t('features.geminiPro')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Other Features List */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold opacity-80">{t('features.featuresList')}</span>
                  {featuresList
                    .filter((f) => f.key !== 'notifications' && f.key !== 'ai_recommendations' && f.key !== 'sms_notifications')
                    .map((feat) => {
                      const isEnabled = featuresMap[feat.key] ?? true;
                      return (
                        <div
                          key={feat.key}
                          className="p-3 rounded-xl border flex items-center justify-between transition-colors"
                          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-xs font-semibold block">{feat.name}</span>
                            <span className="text-[10px] opacity-60 block truncate">{feat.description}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleFeature(feat.key)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                              isEnabled ? 'bg-[var(--color-accent)]' : 'bg-gray-300 dark:bg-gray-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                isEnabled ? (isRtl ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  onClick={handleSaveFeatures}
                  disabled={isSavingFeatures}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                >
                  {isSavingFeatures ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <FloppyDisk weight="light" className="w-3.5 h-3.5" />}
                  <span>{isSavingFeatures ? t('features.saving') : t('features.saveSettings')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase 9.5: Business Branding & Layout Variants Modal */}
      {selectedBizForBranding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-md rounded-3xl p-5 border shadow-2xl relative max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Sparkle weight="light" className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                <div>
                  <h3 className="text-sm font-bold">{isRtl ? 'هوية وتصميم المكان' : 'Business Branding & Design'}</h3>
                  <span className="text-[11px] opacity-60">{selectedBizForBranding.name} ({selectedBizForBranding.subdomain})</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBizForBranding(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors hover:opacity-75"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
              >
                <X weight="light" className="w-4 h-4" />
              </button>
            </div>

            {brandingFeedback && (
              <div
                className="mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2"
                style={{
                  backgroundColor:
                    brandingFeedback.type === 'success'
                      ? 'var(--color-success-bg)'
                      : brandingFeedback.type === 'warning'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : 'var(--color-error-bg)',
                  borderColor:
                    brandingFeedback.type === 'success'
                      ? 'var(--color-success-border)'
                      : brandingFeedback.type === 'warning'
                      ? 'rgba(234, 179, 8, 0.4)'
                      : 'var(--color-error-border)',
                  color:
                    brandingFeedback.type === 'success'
                      ? 'var(--color-success-text)'
                      : brandingFeedback.type === 'warning'
                      ? '#B45309'
                      : 'var(--color-error-text)',
                }}
              >
                <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
                <span>{brandingFeedback.text}</span>
              </div>
            )}

            {brandingLoading ? (
              <div className="py-12 flex justify-center">
                <CircleNotch weight="light" className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Display Name */}
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {isRtl ? 'اسم العرض للعميل (بديل عن Pointat)' : 'Display Name (Replaces Pointat)'}
                  </label>
                  <input
                    type="text"
                    value={brandingDisplayName}
                    onChange={(e) => setBrandingDisplayName(e.target.value)}
                    placeholder={selectedBizForBranding.name}
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                {/* Color Palette */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 opacity-80">
                      {isRtl ? 'اللون الأساسي (خلفية)' : 'Primary Color (BG)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandingPrimaryColor.startsWith('#') ? brandingPrimaryColor : '#FAF7F2'}
                        onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border p-0.5"
                        style={{ borderColor: 'var(--color-border)' }}
                      />
                      <input
                        type="text"
                        value={brandingPrimaryColor}
                        onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                        className="flex-1 py-1.5 px-2 rounded-xl text-xs border font-mono"
                        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 opacity-80">
                      {isRtl ? 'لون التمييز (Accent)' : 'Accent Color'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandingAccentColor.startsWith('#') ? brandingAccentColor : '#B08968'}
                        onChange={(e) => setBrandingAccentColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border p-0.5"
                        style={{ borderColor: 'var(--color-border)' }}
                      />
                      <input
                        type="text"
                        value={brandingAccentColor}
                        onChange={(e) => setBrandingAccentColor(e.target.value)}
                        className="flex-1 py-1.5 px-2 rounded-xl text-xs border font-mono"
                        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Phase 9.5.2: Accessibility Contrast Check (WCAG AA) */}
                {(() => {
                  const pColor = brandingPrimaryColor.startsWith('#') ? brandingPrimaryColor : '#FAF7F2';
                  const aColor = brandingAccentColor.startsWith('#') ? brandingAccentColor : '#B08968';
                  const pCheck = checkColorContrast(pColor, '#2B1810');
                  const aCheck = checkColorContrast(aColor, '#FFFFFF');

                  if (pCheck.passesAA && aCheck.passesAA) {
                    return (
                      <div className="p-2.5 rounded-xl border text-xs flex items-center gap-2" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.25)', color: '#16A34A' }}>
                        <CheckCircle weight="light" className="w-4 h-4 shrink-0" />
                        <span>{isRtl ? 'الألوان تحقق معايير التباين وسهولة القراءة (WCAG AA Pass)' : 'Colors pass accessibility contrast standards (WCAG AA Pass)'}</span>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 rounded-xl border text-xs flex flex-col gap-2" style={{ backgroundColor: 'rgba(234, 88, 12, 0.08)', borderColor: 'rgba(234, 88, 12, 0.3)', color: '#C2410C' }}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
                        <span>{isRtl ? 'تنبيه سهولة القراءة والتباين (WCAG AA)' : 'Accessibility Contrast Warning (WCAG AA)'}</span>
                      </div>
                      {!pCheck.passesAA && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <span>{isRtl ? `اللون الأساسي: تباين ضعيف (${pCheck.ratio}:1). المطلوب 4.5:1 على الأقل.` : `Primary: Low contrast (${pCheck.ratio}:1). Minimum 4.5:1 required.`}</span>
                          {pCheck.suggestedColor && (
                            <button
                              type="button"
                              onClick={() => setBrandingPrimaryColor(pCheck.suggestedColor!)}
                              className="underline font-semibold cursor-pointer hover:opacity-80"
                            >
                              {isRtl ? `استخدم المقترح (${pCheck.suggestedColor})` : `Use suggested (${pCheck.suggestedColor})`}
                            </button>
                          )}
                        </div>
                      )}
                      {!aCheck.passesAA && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <span>{isRtl ? `لون التمييز: تباين ضعيف مع النص الأبيض (${aCheck.ratio}:1).` : `Accent: Low contrast against white text (${aCheck.ratio}:1).`}</span>
                          {aCheck.suggestedColor && (
                            <button
                              type="button"
                              onClick={() => setBrandingAccentColor(aCheck.suggestedColor!)}
                              className="underline font-semibold cursor-pointer hover:opacity-80"
                            >
                              {isRtl ? `استخدم المقترح (${aCheck.suggestedColor})` : `Use suggested (${aCheck.suggestedColor})`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Font Family (Phase 9.5: pre-approved list) */}
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {isRtl ? 'نوع الخط المعتمد' : 'Approved Font Family'}
                  </label>
                  <select
                    value={brandingFontFamily}
                    onChange={(e) => setBrandingFontFamily(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <option value="Inter">Inter (Clean Modern)</option>
                    <option value="Roboto">Roboto (Geometric)</option>
                    <option value="Cairo">Cairo (Arabic Optimized)</option>
                    <option value="Tajawal">Tajawal (Elegant Arabic)</option>
                  </select>
                </div>

                {/* Layout Variant (Phase 9.5.1: 3 pre-built layout variants) */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5 opacity-80">
                    {isRtl ? 'قالب ترتيب شاشة العميل (Layout Variant)' : 'Customer Screen Layout Variant'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'centered-classic', name: isRtl ? 'كلاسيكي متوازن' : 'Classic' },
                      { id: 'qr-top', name: isRtl ? 'QR في الأعلى' : 'QR Top' },
                      { id: 'horizontal-offers', name: isRtl ? 'عروض أفقية' : 'Carousel' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setBrandingLayoutVariant(v.id as any)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                          brandingLayoutVariant === v.id ? 'ring-2' : 'opacity-70'
                        }`}
                        style={{
                          backgroundColor: 'var(--color-bg)',
                          borderColor: brandingLayoutVariant === v.id ? 'var(--color-accent)' : 'var(--color-border)',
                          color: brandingLayoutVariant === v.id ? 'var(--color-accent)' : 'inherit',
                        }}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview Card */}
                <div
                  className="p-3.5 rounded-2xl border text-center transition-all mt-1"
                  style={{
                    backgroundColor: brandingPrimaryColor,
                    borderColor: 'var(--color-border)',
                    fontFamily: `${brandingFontFamily}, sans-serif`,
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: brandingAccentColor }}>
                    {brandingDisplayName || selectedBizForBranding.name}
                  </span>
                  <span className="text-xs font-semibold opacity-90 block mt-0.5">
                    {isRtl ? 'معاينة تجربة العميل' : 'Customer Experience Preview'}
                  </span>
                  <div className="mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold shadow-xs" style={{ backgroundColor: brandingAccentColor, color: '#FFFFFF' }}>
                    {isRtl ? 'قالب: ' : 'Layout: '}{brandingLayoutVariant}
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  onClick={handleSaveBranding}
                  disabled={isSavingBranding}
                  className="w-full py-3 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                >
                  {isSavingBranding ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <FloppyDisk weight="light" className="w-3.5 h-3.5" />}
                  <span>{isSavingBranding ? t('features.saving') : (isRtl ? 'حفظ هوية وتصميم المكان' : 'Save Branding Settings')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──── SUPER ADMIN PROFILE MODAL WITH EDIT & OTP ──── */}
      <ProfileModal
        isOpen={showSuperAdminProfile}
        onClose={() => setShowSuperAdminProfile(false)}
        jwtToken={jwtToken}
        initialData={{
          email: superAdminEmail,
          role: 'super_admin',
        }}
        onProfileUpdated={(updated) => {
          if (updated.email) setSuperAdminEmail(updated.email);
        }}
        extraInfo={
          <div className="grid grid-cols-2 gap-2 text-center text-xs mt-1">
            <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <span className="text-[10px] opacity-60 block mb-0.5">{isRtl ? 'المتاجر المسجلة' : 'Businesses'}</span>
              <strong className="text-sm font-bold">{businesses.length}</strong>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <span className="text-[10px] opacity-60 block mb-0.5">{isRtl ? 'الفروع الإجمالية' : 'Total Branches'}</span>
              <strong className="text-sm font-bold">
                {businesses.reduce((acc, b) => acc + (b.branch_count || 0), 0)}
              </strong>
            </div>
          </div>
        }
        dangerZone={
          <div
            className="p-4 rounded-2xl border"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
            }}
          >
            <div className="flex items-center gap-2 mb-2 text-rose-500">
              <Warning weight="light" className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold">{t('accountDeletion.dangerZone')}</span>
            </div>
            <p className="text-[11px] opacity-75 mb-3 leading-relaxed">
              {isRtl
                ? 'حذف هذا الحساب سيلغي صلاحية السوبر أدمن نهائياً. لا يمكن التراجع عن هذه العملية.'
                : 'Deleting this account will permanently revoke super administrator access. This cannot be undone.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowSuperAdminProfile(false);
                setShowSuperAdminDeleteModal(true);
                setDeleteAckChecked1(false);
                setDeleteAckChecked2(false);
                setTypedConfirmationPhrase('');
                setDeleteSuperAdminError(null);
              }}
              id="super-admin-open-delete-btn"
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: '#EF4444' }}
            >
              <Trash weight="light" className="w-3.5 h-3.5" />
              <span>{t('accountDeletion.deleteSuperAdminAccount')}</span>
            </button>
          </div>
        }
      />

      {/* ──── SUPER ADMIN HEIGHTENED SECURITY CONFIRMATION MODAL ──── */}
      {showSuperAdminDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
          onClick={() => {
            if (!isDeletingSuperAdmin) setShowSuperAdminDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl p-6 border-2 shadow-2xl animate-in zoom-in-95 duration-150"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: '#EF4444',
              color: 'var(--color-text)',
            }}
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Warning Icon & Title */}
            <div className="text-center mb-4">
              <div
                className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center animate-pulse"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
              >
                <Warning weight="light" className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-rose-500">
                {isRtl ? 'تأكيد أمني فائق - حذف حساب السوبر أدمن' : 'CRITICAL SECURITY CONFIRMATION'}
              </h2>
              <p className="text-xs opacity-80 mt-1.5 leading-relaxed">
                {t('accountDeletion.confirmSuperAdminDesc')}
              </p>
            </div>

            {/* Error Message */}
            {deleteSuperAdminError && (
              <div
                className="p-3 mb-4 rounded-xl border text-xs text-rose-400 flex items-center gap-2"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
                <span>{deleteSuperAdminError}</span>
              </div>
            )}

            {/* Heightened Confirmations: Step 1 - Acknowledgement Checkboxes */}
            <div
              className="p-3.5 mb-4 rounded-2xl border space-y-2.5 text-xs"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70 mb-1">
                {isRtl ? 'الخطوة 1 من 2: الإقرارات الأمنية الإلزامية' : 'Step 1 of 2: Mandatory Acknowledgments'}
              </span>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteAckChecked1}
                  onChange={(e) => setDeleteAckChecked1(e.target.checked)}
                  id="super-admin-ack-1"
                  className="mt-0.5 rounded border-gray-400 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-[11px] leading-snug">
                  {isRtl
                    ? 'أقر بأنني على علم بأن هذا الحساب يمتلك أعلى صلاحيات الإدارة للمنصة وأن حذفه سيؤدي إلى فقدان الوصول الكامل.'
                    : 'I acknowledge that this account holds the highest platform administration privileges and deleting it will revoke full access.'}
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteAckChecked2}
                  onChange={(e) => setDeleteAckChecked2(e.target.checked)}
                  id="super-admin-ack-2"
                  className="mt-0.5 rounded border-gray-400 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-[11px] leading-snug">
                  {isRtl
                    ? 'أؤكد مسؤوليتي الكاملة عن هذا القرار ولن يمكن استرجاع الحساب بعد التنفيذ بأي شكل.'
                    : 'I confirm my full responsibility for this decision and the account cannot be recovered once executed.'}
                </span>
              </label>
            </div>

            {/* Heightened Confirmations: Step 2 - Exact Phrase Typing */}
            <div
              className="p-3.5 mb-5 rounded-2xl border text-xs"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70 mb-1">
                {isRtl ? 'الخطوة 2 من 2: كتابة عبارة التأكيد بالضبط' : 'Step 2 of 2: Type Confirmation Phrase'}
              </span>

              <div className="mb-2">
                <span className="text-[11px] opacity-80 block mb-1">
                  {t('accountDeletion.superAdminPhrasePrompt')}
                </span>
                <div
                  className="p-2 rounded-xl border font-mono text-xs font-bold text-center select-all"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                  }}
                >
                  {isRtl ? 'حذف حساب السوبر أدمن نهائياً' : 'DELETE SUPER ADMIN ACCOUNT'}
                </div>
              </div>

              <input
                type="text"
                value={typedConfirmationPhrase}
                onChange={(e) => setTypedConfirmationPhrase(e.target.value)}
                placeholder={isRtl ? 'اكتب العبارة هنا بالضبط...' : 'Type the exact phrase here...'}
                id="super-admin-confirmation-phrase-input"
                className="w-full p-2.5 rounded-xl border text-xs font-medium transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor:
                    typedConfirmationPhrase.trim() === 'حذف حساب السوبر أدمن نهائياً' ||
                    typedConfirmationPhrase.trim() === 'DELETE SUPER ADMIN ACCOUNT'
                      ? '#10B981'
                      : 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />

              {/* Match Indicator */}
              <div className="mt-2 text-[10px] flex items-center justify-between">
                {(typedConfirmationPhrase.trim() === 'حذف حساب السوبر أدمن نهائياً' ||
                  typedConfirmationPhrase.trim() === 'DELETE SUPER ADMIN ACCOUNT') ? (
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle weight="light" className="w-3.5 h-3.5" />
                    {isRtl ? 'العبارة مطابقة تماماً ✓' : 'Phrase matched accurately ✓'}
                  </span>
                ) : (
                  <span className="opacity-60">
                    {isRtl ? 'يجب كتابة العبارة لتفعيل الحذف' : 'Must type the phrase to unlock'}
                  </span>
                )}
                {(!deleteAckChecked1 || !deleteAckChecked2) && (
                  <span className="text-amber-500 font-medium">
                    {isRtl ? 'يرجى تحديد الإقرارات' : 'Check all acknowledgments'}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSuperAdminDeleteModal(false)}
                disabled={isDeletingSuperAdmin}
                className="flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {t('accountDeletion.cancelButton')}
              </button>

              <button
                type="button"
                onClick={handleDeleteSuperAdmin}
                id="super-admin-confirm-delete-btn"
                disabled={
                  !deleteAckChecked1 ||
                  !deleteAckChecked2 ||
                  (typedConfirmationPhrase.trim() !== 'حذف حساب السوبر أدمن نهائياً' &&
                    typedConfirmationPhrase.trim() !== 'DELETE SUPER ADMIN ACCOUNT') ||
                  isDeletingSuperAdmin
                }
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: '#EF4444',
                }}
              >
                {isDeletingSuperAdmin ? (
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

      {/* Footer */}
      <footer className="text-center text-[11px] opacity-50 py-3">
        {t('superAdmin.footer')}
      </footer>
    </main>
  );
}
