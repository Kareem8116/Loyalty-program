'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Coffee, Users, Gear, Plus, Trash, QrCode,
  SignOut, CircleNotch, Check, WarningCircle, ArrowRight, ArrowLeft, Sparkle, Image as ImageIcon, X,
  Handshake, ArrowsLeftRight, PaperPlaneTilt, ShieldWarning, ClipboardText, Medal, PencilSimple, FloppyDisk, Gift,
  ChartBar, TrendUp, ChartPie, Receipt, Flag, UserPlus, CheckCircle, Palette, ArrowCounterClockwise,
  User, Warning
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
  validatePassword, 
  validatePositiveNumber 
} from '@/lib/validation';
import ProfileModal from '@/components/ProfileModal';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { t, isRtl } = useLocale();
  const [activeTab, setActiveTab] = useState<'menu' | 'offers' | 'customers' | 'cashiers' | 'settings' | 'partnerships' | 'audit' | 'tiers' | 'referral' | 'analytics' | 'dailyReview'>('menu');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [userRole, setUserRole] = useState<string>('owner');
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Admin Profile & Account Deletion state
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [showAdminProfile, setShowAdminProfile] = useState(false);
  const [showAdminDeleteConfirm, setShowAdminDeleteConfirm] = useState(false);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);
  const [deleteAdminError, setDeleteAdminError] = useState<string | null>(null);

  // Tab 1: Menu state (5.2)
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Tab 2: Offers state (6.1.2 & 6.2)
  const [offers, setOffers] = useState<any[]>([]);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerType, setOfferType] = useState<'special' | 'daily'>('special');
  const [offerStartDate, setOfferStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [offerEndDate, setOfferEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [offerImage, setOfferImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAddingOffer, setIsAddingOffer] = useState(false);

  // Tab 3: Customers state (5.3 & 13.3)
  const [customers, setCustomers] = useState<any[]>([]);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustConsent, setNewCustConsent] = useState(false);
  const [newCustReferralCode, setNewCustReferralCode] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Tab 4: Settings state (5.4 & 14.1)
  const [pointsPerUnit, setPointsPerUnit] = useState('1.0');
  const [currencyPerPoint, setCurrencyPerPoint] = useState('0.1');
  const [pointsExpiryMonths, setPointsExpiryMonths] = useState('12');
  const [redemptionType, setRedemptionType] = useState<'product' | 'cash' | 'both'>('both');
  const [maxOfflineTransactions, setMaxOfflineTransactions] = useState('25');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Points summary stats (daily/monthly) for owner dashboard
  const [pointsSummary, setPointsSummary] = useState<{
    todayIssued: number;
    todayRedeemed: number;
    monthIssued: number;
    monthRedeemed: number;
    totalCustomers: number;
    isLoading: boolean;
  }>({ todayIssued: 0, todayRedeemed: 0, monthIssued: 0, monthRedeemed: 0, totalCustomers: 0, isLoading: false });

  // Tab 4: Phase 9.5 & 9.5.2 Branding state
  const [brandingDisplayName, setBrandingDisplayName] = useState('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState('#FAF7F2');
  const [brandingAccentColor, setBrandingAccentColor] = useState('#B08968');
  const [brandingFontFamily, setBrandingFontFamily] = useState('Inter');
  const [brandingLayoutVariant, setBrandingLayoutVariant] = useState<'centered-classic' | 'qr-top' | 'horizontal-offers'>('centered-classic');
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Tab 4: Phase 16 — Notification Settings state
  const [notifPhoneNumberId, setNotifPhoneNumberId] = useState('');
  const [notifAccessToken, setNotifAccessToken] = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [isSavingNotif, setIsSavingNotif] = useState(false);
  const [notifLoaded, setNotifLoaded] = useState(false);

  // Tab 5: Partnerships state (Phase 10)
  const [partnerships, setPartnerships] = useState<any[]>([]);
  const [targetSubdomain, setTargetSubdomain] = useState('');
  const [partnershipTerms, setPartnershipTerms] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [transferPartnershipId, setTransferPartnershipId] = useState('');
  const [transferCustomerId, setTransferCustomerId] = useState('');
  const [transferPoints, setTransferPoints] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Tab 6: Audit Log + Cashier Limits state (Phase 15 & Pre-Phase 27)
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditCashierFilter, setAuditCashierFilter] = useState('');
  const [auditFromDate, setAuditFromDate] = useState('');
  const [auditToDate, setAuditToDate] = useState('');
  const [cashierLimitEdits, setCashierLimitEdits] = useState<Record<string, string>>({});
  const [cashierTxLimitEdits, setCashierTxLimitEdits] = useState<Record<string, string>>({});
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);
  const [auditAlertDismissed, setAuditAlertDismissed] = useState(false);
  const [showAddCashierModal, setShowAddCashierModal] = useState(false);
  const [newCashierEmail, setNewCashierEmail] = useState('');
  const [newCashierPassword, setNewCashierPassword] = useState('');
  const [newCashierName, setNewCashierName] = useState('');
  const [newCashierPhone, setNewCashierPhone] = useState('');
  const [newCashierBranchId, setNewCashierBranchId] = useState('');
  const [newCashierDailyLimit, setNewCashierDailyLimit] = useState('1000');
  const [newCashierTxLimit, setNewCashierTxLimit] = useState('500');
  const [isCreatingCashier, setIsCreatingCashier] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  // Tab 7: Membership Tiers state (Phase 17)
  const [tiers, setTiers] = useState<any[]>([]);
  const [newTierName, setNewTierName] = useState('');
  const [newTierMinPoints, setNewTierMinPoints] = useState('');
  const [newTierBenefits, setNewTierBenefits] = useState('');
  const [isAddingTier, setIsAddingTier] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierName, setEditTierName] = useState('');
  const [editTierMinPoints, setEditTierMinPoints] = useState('');
  const [editTierBenefits, setEditTierBenefits] = useState('');
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  // Tab 8: Referral state (Phase 19)
  const [referrerRewardPoints, setReferrerRewardPoints] = useState('50');
  const [refereeRewardPoints, setRefereeRewardPoints] = useState('25');
  const [referralStats, setReferralStats] = useState<{ totalReferrals: number; totalPointsAwarded: number }>({
    totalReferrals: 0,
    totalPointsAwarded: 0,
  });
  const [isSavingReferral, setIsSavingReferral] = useState(false);

  // Tab 9: Analytics state (Phase 20)
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Tab 10: Daily Review state (Phase 15.13 & 15.14)
  const [dailyReviewDate, setDailyReviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyReviewFlaggedOnly, setDailyReviewFlaggedOnly] = useState(false);
  const [dailyReviewData, setDailyReviewData] = useState<any | null>(null);
  const [isLoadingDailyReview, setIsLoadingDailyReview] = useState(false);
  const [flagModalTx, setFlagModalTx] = useState<any | null>(null);
  const [flagReasonInput, setFlagReasonInput] = useState('');
  const [isSubmittingFlag, setIsSubmittingFlag] = useState(false);

  // Phase 28: Admin Reversals state
  const [reversingTx, setReversingTx] = useState<any | null>(null);
  const [adminReversalReason, setAdminReversalReason] = useState('');
  const [isSubmittingAdminReversal, setIsSubmittingAdminReversal] = useState(false);

  // Phase 22.8: Business features state to conditionally show/hide tabs
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>({});

  const loadBusinessFeatures = async (bizId: string) => {
    try {
      const res = await fetch(`/api/admin/features?businessId=${bizId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.features) {
        setEnabledFeatures(data.features);
      }
    } catch (err) {
      console.warn('Failed to load business features:', err);
    }
  };

  // Phase 22.8: Fallback active tab if current tab feature gets disabled
  useEffect(() => {
    if (
      (activeTab === 'offers' && enabledFeatures.offers === false && enabledFeatures.daily_offers === false) ||
      (activeTab === 'partnerships' && enabledFeatures.branch_partnerships === false) ||
      (activeTab === 'tiers' && enabledFeatures.membership_tiers === false) ||
      (activeTab === 'referral' && enabledFeatures.referral_program === false) ||
      (activeTab === 'analytics' && enabledFeatures.analytics_reports === false)
    ) {
      setActiveTab('menu');
    }
  }, [activeTab, enabledFeatures]);

  // Load Session and Active Business
  useEffect(() => {
    async function initDashboard() {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.replace('/admin/login');
          return;
        }

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role, business_id, businesses (name)')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // COMPLETE ISOLATION: Admin dashboard is strictly for Store Managers (owner, branch_admin)
        const allowedAdminRoles = ['owner', 'branch_admin'];
        if (!userRoles || !allowedAdminRoles.includes(userRoles.role)) {
          // Cashier, customer, or unauthorized role attempted to access /admin
          await supabase.auth.signOut();
          router.replace('/admin/login');
          return;
        }

        const role = userRoles.role;
        const activeBizId = userRoles.business_id;
        if ((userRoles as any).businesses?.name) {
          setBusinessName((userRoles as any).businesses.name);
        }

        if (!activeBizId) {
          await supabase.auth.signOut();
          router.replace('/admin/login');
          return;
        }

        setBusinessId(activeBizId);
        setUserRole(role);
        setJwtToken(session.access_token);
        setAdminEmail(session.user.email || '');

        if (activeBizId) {
          await Promise.all([
            loadBusinessFeatures(activeBizId),
            loadMenu(activeBizId),
            loadOffers(activeBizId),
            loadCustomers(activeBizId),
            loadSettings(activeBizId),
            loadBranding(activeBizId),
            loadNotificationSettings(activeBizId),
            loadPartnerships(activeBizId),
            loadCashiers(activeBizId),
            loadTiers(activeBizId),
            loadReferral(activeBizId),
            loadAnalytics(activeBizId, '30d'),
            loadDailyReview(activeBizId),
            loadBranches(activeBizId),
          ]);
        }
      } catch (err: any) {
        console.error('Error initializing dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    }

    initDashboard();
  }, []);

  const loadBranches = async (bId: string) => {
    try {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('business_id', bId)
        .order('name');
      setBranches(data || []);
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const loadMenu = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/menu?businessId=${bId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setMenuItems(data.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOffers = async (bId: string) => {
    try {
      const res = await fetch(`/api/offers?businessId=${bId}&admin=true`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setOffers(data.offers || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCustomers = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/customers?businessId=${bId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setCustomers(data.customers || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadSettings = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/settings?businessId=${bId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.rates) {
        setPointsPerUnit(data.rates.points_per_currency_unit?.toString() || '1.0');
        setCurrencyPerPoint(data.rates.currency_per_point?.toString() || '0.1');
        if (data.rates.points_expiry_months !== undefined) {
          setPointsExpiryMonths(data.rates.points_expiry_months?.toString() || '12');
        }
        if (data.rates.redemption_type) {
          setRedemptionType(data.rates.redemption_type as 'product' | 'cash' | 'both');
        }
        if (data.rates.max_offline_transactions !== undefined) {
          setMaxOfflineTransactions(data.rates.max_offline_transactions?.toString() || '25');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPointsSummary = async (bId: string) => {
    setPointsSummary(prev => ({ ...prev, isLoading: true }));
    try {
      const headers = await getAuthHeaders();
      const today = new Date().toISOString().split('T')[0];

      const [dailyRes, custRes] = await Promise.all([
        fetch(`/api/admin/daily-review?businessId=${bId}&date=${today}`, { headers }),
        fetch(`/api/admin/customers?businessId=${bId}`, { headers }),
      ]);

      const [dailyData, custData] = await Promise.all([
        dailyRes.json(), custRes.json()
      ]);

      // daily-review returns transactions list; compute stats from them
      const txs: any[] = dailyData?.transactions || [];
      const todayIssued = txs.filter((t: any) => t.points_change > 0).reduce((s: number, t: any) => s + t.points_change, 0);
      const todayRedeemed = Math.abs(txs.filter((t: any) => t.points_change < 0).reduce((s: number, t: any) => s + t.points_change, 0));

      // Month totals (approximate from customer balances if no separate API)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthRes = await fetch(`/api/admin/daily-review?businessId=${bId}&date=${today}&since=${encodeURIComponent(monthStart)}`, { headers });
      const monthData = await monthRes.json().catch(() => ({}));
      const monthTxs: any[] = monthData?.transactions || [];
      const monthIssued = monthTxs.filter((t: any) => t.points_change > 0).reduce((s: number, t: any) => s + t.points_change, 0);
      const monthRedeemed = Math.abs(monthTxs.filter((t: any) => t.points_change < 0).reduce((s: number, t: any) => s + t.points_change, 0));

      setPointsSummary({
        todayIssued,
        todayRedeemed,
        monthIssued: monthIssued || todayIssued,
        monthRedeemed: monthRedeemed || todayRedeemed,
        totalCustomers: custData?.customers?.length || 0,
        isLoading: false,
      });
    } catch (err) {
      console.error('Error loading points summary:', err);
      setPointsSummary(prev => ({ ...prev, isLoading: false }));
    }
  };

  const loadBranding = async (bId: string) => {

    try {
      const res = await fetch(`/api/admin/branding?businessId=${bId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.branding) {
        setBrandingDisplayName(data.branding.display_name || '');
        setBrandingLogoUrl(data.branding.logo_url || '');
        setBrandingPrimaryColor(data.branding.primary_color || '#FAF7F2');
        setBrandingAccentColor(data.branding.accent_color || '#B08968');
        setBrandingFontFamily(data.branding.font_family || 'Inter');
        setBrandingLayoutVariant(data.branding.layout_variant || 'centered-classic');
      }
    } catch (err) {
      console.error('Error loading branding:', err);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setIsSavingBranding(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/branding', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          displayName: brandingDisplayName,
          logoUrl: brandingLogoUrl,
          primaryColor: brandingPrimaryColor,
          accentColor: brandingAccentColor,
          fontFamily: brandingFontFamily,
          layoutVariant: brandingLayoutVariant,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', text: isRtl ? 'تم حفظ إعدادات الهوية والتصميم بنجاح' : 'Branding updated successfully' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to update branding' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error updating branding' });
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Phase 16: Load notification settings
  const loadNotificationSettings = async (bId: string) => {
    try {
      const res = await fetch('/api/admin/notifications', { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.settings) {
        setNotifPhoneNumberId(data.settings.phone_number_id || '');
        setNotifEnabled(enabledFeatures.notifications === true);
      }
      setNotifLoaded(true);
    } catch {
      setNotifLoaded(true);
    }
  };

  // Phase 16: Save notification settings
  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setIsSavingNotif(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          phone_number_id: notifPhoneNumberId.trim(),
          access_token: notifAccessToken.trim(),
          is_enabled: notifEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));
      setFeedback({ type: 'success', text: isRtl ? 'تم حفظ إعدادات الإشعارات' : 'Notification settings saved' });
      setNotifAccessToken(''); // Clear sensitive field after save
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSavingNotif(false);
    }
  };

  const loadPartnerships = async (bId: string) => {
    try {
      const res = await fetch('/api/admin/partnerships', {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) setPartnerships(data.partnerships || []);
    } catch (err) {
      console.error('Error loading partnerships:', err);
    }
  };

  // 15.1: Load audit log with optional filters
  const loadAuditLog = async (bId: string, filters?: { cashierId?: string; fromDate?: string; toDate?: string }) => {
    setIsLoadingAudit(true);
    try {
      let url = `/api/admin/audit-log?business_id=${bId}`;
      if (filters?.cashierId) url += `&cashier_id=${filters.cashierId}`;
      if (filters?.fromDate) url += `&from_date=${filters.fromDate}`;
      if (filters?.toDate) url += `&to_date=${filters.toDate}`;
      const res = await fetch(url, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.success) setAuditLogs(data.logs || []);
    } catch (err) {
      console.error('Error loading audit log:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // 15.2: Load cashiers with daily stats and limits
  const loadCashiers = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/cashiers?business_id=${bId}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setCashiers(data.cashiers || []);
        const dailyEdits: Record<string, string> = {};
        const txEdits: Record<string, string> = {};
        (data.cashiers || []).forEach((c: any) => {
          dailyEdits[c.roleId] = String(c.dailyPointsLimit ?? 1000);
          txEdits[c.roleId] = c.perTransactionPointsLimit !== null && c.perTransactionPointsLimit !== undefined ? String(c.perTransactionPointsLimit) : '';
        });
        setCashierLimitEdits(dailyEdits);
        setCashierTxLimitEdits(txEdits);
      }
    } catch (err) {
      console.error('Error loading cashiers:', err);
    }
  };

  // 15.2 & Pre-Phase 27: Save updated limits for a cashier
  const handleSaveCashierLimit = async (roleId: string) => {
    if (!businessId) return;
    setSavingLimitId(roleId);
    try {
      const dailyVal = cashierLimitEdits[roleId];
      const txVal = cashierTxLimitEdits[roleId];
      const payload: any = {
        roleId,
        dailyPointsLimit: dailyVal !== undefined && dailyVal !== '' ? parseInt(dailyVal, 10) : 1000,
        perTransactionPointsLimit: txVal && txVal.trim() !== '' ? parseInt(txVal, 10) : null,
      };
      const res = await fetch('/api/admin/cashiers', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setFeedback({ type: 'success', text: t('cashierLimits.savedSuccess') });
      await loadCashiers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || t('cashierLimits.saveFailed') });
    } finally {
      setSavingLimitId(null);
    }
  };

  // Pre-Phase 27: Create new cashier
  const handleCreateCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const nameVal = validateName(newCashierName);
    if (!nameVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${nameVal.errorKey}`) });
      return;
    }
    const emailVal = validateEmail(newCashierEmail);
    if (!emailVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${emailVal.errorKey}`) });
      return;
    }
    const passVal = validatePassword(newCashierPassword);
    if (!passVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${passVal.errorKey}`) });
      return;
    }
    if (newCashierPhone.trim()) {
      const phoneVal = validateEgyptianPhone(newCashierPhone);
      if (!phoneVal.isValid) {
        setFeedback({ type: 'error', text: t(`validation.${phoneVal.errorKey}`) });
        return;
      }
    }
    if (newCashierDailyLimit) {
      const dailyVal = validatePositiveNumber(newCashierDailyLimit, true);
      if (!dailyVal.isValid) {
        setFeedback({ type: 'error', text: t(`validation.${dailyVal.errorKey}`) });
        return;
      }
    }
    if (newCashierTxLimit) {
      const txVal = validatePositiveNumber(newCashierTxLimit, true);
      if (!txVal.isValid) {
        setFeedback({ type: 'error', text: t(`validation.${txVal.errorKey}`) });
        return;
      }
    }

    setIsCreatingCashier(true);
    try {
      const res = await fetch('/api/admin/cashiers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          businessId,
          email: newCashierEmail.trim(),
          password: newCashierPassword,
          fullName: newCashierName.trim(),
          phoneNumber: newCashierPhone.trim() || undefined,
          branchId: newCashierBranchId || null,
          dailyPointsLimit: newCashierDailyLimit ? parseInt(newCashierDailyLimit, 10) : 1000,
          perTransactionPointsLimit: newCashierTxLimit ? parseInt(newCashierTxLimit, 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setFeedback({ type: 'success', text: isRtl ? 'تم إضافة الكاشير بنجاح' : 'Cashier added successfully' });
      setShowAddCashierModal(false);
      setNewCashierEmail('');
      setNewCashierPassword('');
      setNewCashierName('');
      setNewCashierPhone('');
      setNewCashierBranchId('');
      setNewCashierDailyLimit('1000');
      setNewCashierTxLimit('500');
      await loadCashiers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || (isRtl ? 'فشل إضافة الكاشير' : 'Failed to add cashier') });
    } finally {
      setIsCreatingCashier(false);
    }
  };

  // Phase 17: Load membership tiers
  const loadTiers = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/tiers?businessId=${bId}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setTiers(data.tiers || []);
      }
    } catch (err) {
      console.error('Error loading membership tiers:', err);
    }
  };

  // Phase 17: Add membership tier
  const handleAddTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !newTierName.trim()) return;

    setIsAddingTier(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/tiers', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          name: newTierName.trim(),
          minPointsEarned: parseInt(newTierMinPoints, 10) || 0,
          benefitsDescription: newTierBenefits.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('tiers.addFailed'));

      setFeedback({ type: 'success', text: t('tiers.tierAdded').replace('{name}', newTierName.trim()) });
      setNewTierName('');
      setNewTierMinPoints('');
      setNewTierBenefits('');
      await loadTiers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsAddingTier(false);
    }
  };

  // Phase 17: Update membership tier
  const handleUpdateTier = async (tierId: string) => {
    if (!businessId || !editTierName.trim()) return;

    setIsUpdatingTier(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/tiers', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          tierId,
          name: editTierName.trim(),
          minPointsEarned: parseInt(editTierMinPoints, 10) || 0,
          benefitsDescription: editTierBenefits.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('tiers.updateFailed'));

      setFeedback({ type: 'success', text: t('tiers.tierUpdated') });
      setEditingTierId(null);
      await loadTiers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsUpdatingTier(false);
    }
  };

  // Phase 17: Delete membership tier
  const handleDeleteTier = async (tierId: string, name: string) => {
    if (!businessId) return;
    setDeletingTierId(tierId);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/tiers', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ businessId, tierId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('tiers.deleteFailed'));

      setFeedback({ type: 'success', text: t('tiers.tierDeleted').replace('{name}', name) });
      await loadTiers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setDeletingTierId(null);
    }
  };

  // Phase 19: Load referral settings and statistics
  const loadReferral = async (bId: string) => {
    try {
      const res = await fetch(`/api/admin/referral?businessId=${bId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        if (data.settings) {
          setReferrerRewardPoints(String(data.settings.referrerRewardPoints ?? 50));
          setRefereeRewardPoints(String(data.settings.refereeRewardPoints ?? 25));
        }
        if (data.stats) {
          setReferralStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Error loading referral settings:', err);
    }
  };

  // Phase 19: Save referral settings
  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    setIsSavingReferral(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/referral', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          referrerRewardPoints: parseInt(referrerRewardPoints, 10) || 0,
          refereeRewardPoints: parseInt(refereeRewardPoints, 10) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save referral settings');

      setFeedback({ type: 'success', text: t('admin.referralSaved') });
      await loadReferral(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSavingReferral(false);
    }
  };

  // Phase 20: Load owner analytics
  const loadAnalytics = async (bId: string, timeframe: '7d' | '30d' | '90d' | 'all' = '30d') => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/admin/analytics?businessId=${bId}&timeframe=${timeframe}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.analytics) {
        setAnalyticsData(data.analytics);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // Phase 15.14: Load Owner Daily Review
  const loadDailyReview = async (bId: string, dateStr?: string, flaggedOnly?: boolean) => {
    setIsLoadingDailyReview(true);
    try {
      const d = dateStr !== undefined ? dateStr : dailyReviewDate;
      const f = flaggedOnly !== undefined ? flaggedOnly : dailyReviewFlaggedOnly;
      const res = await fetch(`/api/admin/daily-review?businessId=${bId}&date=${d}&flagged_only=${f ? 'true' : 'false'}`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setDailyReviewData(data);
      }
    } catch (err) {
      console.error('Error loading daily review:', err);
    } finally {
      setIsLoadingDailyReview(false);
    }
  };

  const handleToggleFlag = async (tx: any) => {
    if (!businessId) return;
    if (tx.flaggedByOwner) {
      try {
        const res = await fetch('/api/admin/daily-review', {
          method: 'PATCH',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            transactionId: tx.id,
            flagged: false,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setFeedback({ type: 'success', text: t('admin.flagSuccess') });
          await loadDailyReview(businessId);
        } else {
          setFeedback({ type: 'error', text: data.error || t('common.error') });
        }
      } catch (err: any) {
        setFeedback({ type: 'error', text: err.message });
      }
    } else {
      setFlagModalTx(tx);
      setFlagReasonInput('');
    }
  };

  const handleSubmitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !flagModalTx) return;
    setIsSubmittingFlag(true);
    try {
      const res = await fetch('/api/admin/daily-review', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          transactionId: flagModalTx.id,
          flagged: true,
          flagReason: flagReasonInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', text: t('admin.flagSuccess') });
        setFlagModalTx(null);
        setFlagReasonInput('');
        await loadDailyReview(businessId);
      } else {
        setFeedback({ type: 'error', text: data.error || t('common.error') });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  // Phase 28: Admin Reversal handler
  const handleAdminReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingTx || !businessId) return;
    setIsSubmittingAdminReversal(true);
    try {
      const res = await fetch('/api/cashier/reversal', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          transactionId: reversingTx.id,
          reason: adminReversalReason.trim() || 'استرجاع بواسطة الإدارة',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل استرجاع العملية');
      }
      setFeedback({ type: 'success', text: isRtl ? 'تم استرجاع العملية بنجاح' : 'Transaction reversed successfully' });
      setReversingTx(null);
      setAdminReversalReason('');
      loadDailyReview(businessId, dailyReviewDate, dailyReviewFlaggedOnly);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSubmittingAdminReversal(false);
    }
  };

  // Phase 10: Send Partnership Request
  const handleSendPartnershipRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSubdomain.trim()) return;

    setIsSendingRequest(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/partnerships', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          target_subdomain: targetSubdomain.trim(),
          terms: partnershipTerms.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('partnerships.requestSent') });
      setTargetSubdomain('');
      setPartnershipTerms('');
      if (businessId) await loadPartnerships(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSendingRequest(false);
    }
  };

  // Phase 10: Accept/Reject Partnership
  const handlePartnershipAction = async (id: string, action: 'accept' | 'reject') => {
    setActionLoadingId(id);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/partnerships/${id}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({
        type: 'success',
        text: action === 'accept' ? t('partnerships.accepted') : t('partnerships.rejected'),
      });
      if (businessId) await loadPartnerships(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Phase 10: Transfer Points
  const handleTransferPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferPartnershipId || !transferCustomerId.trim() || !transferPoints) return;

    const selectedPart = partnerships.find((p) => p.id === transferPartnershipId);
    if (!selectedPart) return;

    setIsTransferring(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/partnerships/transfer', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          partnership_id: transferPartnershipId,
          customer_id: transferCustomerId.trim(),
          points: parseInt(transferPoints, 10),
          to_business_id: selectedPart.partner_business_id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({
        type: 'success',
        text: t('partnerships.transferSuccess', { points: transferPoints }),
      });
      setTransferCustomerId('');
      setTransferPoints('');
      if (businessId) {
        await Promise.all([loadCustomers(businessId), loadPartnerships(businessId)]);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsTransferring(false);
    }
  };

  // 5.2: Add Menu Item
  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const nameVal = validateName(newItemName);
    if (!nameVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${nameVal.errorKey}`) });
      return;
    }

    const priceVal = validatePositiveNumber(newItemPrice, false);
    if (!priceVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${priceVal.errorKey}`) });
      return;
    }

    setIsAddingItem(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/menu', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          name: newItemName.trim(),
          price: priceVal.value,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('admin.itemAdded', { name: newItemName }) });
      setNewItemName('');
      setNewItemPrice('');
      await loadMenu(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsAddingItem(false);
    }
  };

  // 5.2: Delete Menu Item
  const handleDeleteMenuItem = async (id: string, name: string) => {
    if (!confirm(t('admin.deleteConfirm', { name }))) return;

    try {
      const res = await fetch(`/api/admin/menu?id=${id}&businessId=${businessId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('admin.itemDeleted', { name }) });
      if (businessId) await loadMenu(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };


  // Handle Image Selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOfferImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const handleClearImage = () => {
    setOfferImage(null);
    setImagePreview(null);
  };

  // 6.1.2 & 6.2: Add Offer with optional image upload to Supabase storage
  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !offerTitle.trim() || !offerDesc.trim()) return;

    setIsAddingOffer(true);
    setFeedback(null);

    try {
      let uploadedImageUrl: string | null = null;

      if (offerImage) {
        const formData = new FormData();
        formData.append('file', offerImage);

        const uploadRes = await fetch('/api/offers/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || t('common.error'));
        }

        uploadedImageUrl = uploadData.url;
      }

      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          title: offerTitle.trim(),
          description: offerDesc.trim(),
          type: offerType,
          startDate: offerStartDate,
          endDate: offerEndDate,
          imageUrl: uploadedImageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('admin.offerAdded') });
      setOfferTitle('');
      setOfferDesc('');
      setOfferImage(null);
      setImagePreview(null);
      await loadOffers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsAddingOffer(false);
    }
  };

  // 6.2: Delete Offer
  const handleDeleteOffer = async (id: string, title: string) => {
    if (!confirm(t('admin.deleteOfferConfirm', { title }))) return;

    try {
      const res = await fetch(`/api/offers?id=${id}&businessId=${businessId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('admin.offerDeleted') });
      if (businessId) await loadOffers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  // 5.3 & 13.3: Add Customer
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const nameVal = validateName(newCustName);
    if (!nameVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${nameVal.errorKey}`) });
      return;
    }

    const phoneVal = validateEgyptianPhone(newCustPhone);
    if (!phoneVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${phoneVal.errorKey}`) });
      return;
    }

    // 13.3 & 13.4: Mandatory consent check
    if (!newCustConsent) {
      setFeedback({ type: 'error', text: t('admin.consentRequiredError') });
      return;
    }

    setIsAddingCustomer(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          name: newCustName.trim(),
          phoneNumber: newCustPhone.trim(),
          consentGiven: true,
          referralCode: newCustReferralCode.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ 
        type: 'success', 
        text: t('common.success') 
      });
      setNewCustName('');
      setNewCustPhone('');
      setNewCustConsent(false);
      setNewCustReferralCode('');
      await loadCustomers(businessId);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsAddingCustomer(false);
    }
  };

  // 5.4: Save Redemption Rates Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const ppuVal = validatePositiveNumber(pointsPerUnit, false);
    if (!ppuVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${ppuVal.errorKey}`) });
      return;
    }

    const cppVal = validatePositiveNumber(currencyPerPoint, false);
    if (!cppVal.isValid) {
      setFeedback({ type: 'error', text: t(`validation.${cppVal.errorKey}`) });
      return;
    }

    const maxOfflineNum = parseInt(maxOfflineTransactions, 10);
    if (isNaN(maxOfflineNum) || maxOfflineNum < 5 || maxOfflineNum > 200) {
      setFeedback({ 
        type: 'error', 
        text: isRtl ? 'الحد الأقصى للعمليات بدون اتصال يجب أن يكون بين 5 و 200' : 'Max offline transactions must be between 5 and 200' 
      });
      return;
    }

    setIsSavingSettings(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          businessId,
          pointsPerCurrencyUnit: ppuVal.value,
          currencyPerPoint: cppVal.value,
          pointsExpiryMonths: parseInt(pointsExpiryMonths, 10) || 0,
          redemptionType,
          maxOfflineTransactions: maxOfflineNum,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('common.error'));

      setFeedback({ type: 'success', text: t('admin.settingsSaved') });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSavingSettings(false);
    }
  };


  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('admin_business_id');
    localStorage.removeItem('admin_role');
    router.push('/admin/login');
  };

  const handleDeleteAdminAccount = async () => {
    setIsDeletingAdmin(true);
    setDeleteAdminError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('accountDeletion.deleteError'));
      }

      await supabase.auth.signOut();
      localStorage.removeItem('admin_business_id');
      localStorage.removeItem('admin_role');
      router.push('/admin/login');
    } catch (err: any) {
      setDeleteAdminError(err.message || t('accountDeletion.deleteError'));
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--page-bg-gradient)' }}>
        <CircleNotch weight="light" className="w-8 h-8 animate-spin" style={{ color: '#6C63FF' }} />
      </main>
    );
  }

  return (
    <main 
      className="min-h-screen p-4 sm:p-6 relative overflow-hidden"
      style={{
        background: 'var(--page-bg-gradient)',
        color: 'var(--color-text)'
      }}
    >
      
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

      <div className="max-w-2xl mx-auto flex flex-col gap-6 relative z-10">
        
        {/* Header bar */}
        <header 
          className="rounded-3xl p-4 sm:p-5 border shadow-sm flex items-center justify-between backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(16, 14, 28, 0.80)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
        >
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label={t('common.home')}
              className="w-9 h-9 rounded-full flex items-center justify-center border shadow-xs transition-transform active:scale-95"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <ArrowRight weight="light" className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold">{businessName || t('admin.demoStore')}</h1>
                <span 
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
                >
                  {userRole}
                </span>
              </div>
              <span className="text-[11px] opacity-60">{t('admin.dashboardTitle')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              onClick={() => {
                setShowAdminProfile(true);
                setShowAdminDeleteConfirm(false);
                setDeleteAdminError(null);
              }}
              id="admin-profile-btn"
              title={t('accountDeletion.profileTitle')}
              aria-label={t('accountDeletion.profileTitle')}
              className="w-9 h-9 rounded-full flex items-center justify-center border transition-all hover:opacity-80 active:scale-95 cursor-pointer"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)', color: 'var(--color-accent)' }}
            >
              <User weight="light" className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              id="admin-logout-btn"
              title={t('admin.logout')}
              aria-label={t('admin.logout')}
              className="w-9 h-9 rounded-full flex items-center justify-center border text-rose-500 transition-transform active:scale-95 cursor-pointer"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)' }}
            >
              <SignOut weight="light" className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Global Feedback Alert */}
        {feedback && (
          <div 
            className="p-3 rounded-2xl text-xs font-medium flex items-center gap-2 border"
            style={{
              backgroundColor: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
              color: feedback.type === 'success' ? 'var(--color-success-text)' : 'var(--color-error-text)',
              borderColor: feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
            }}
          >
            {feedback.type === 'success' ? <Check weight="light" className="w-4 h-4 shrink-0" /> : <WarningCircle weight="light" className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Navigation Tabs (6 Tabs) */}
        {/* 15.4: Alert badge for cashiers near/over limit */}
        {!auditAlertDismissed && cashiers.some(c => c.isNearLimit || c.isOverLimit) && (
          <div
            className="p-3 rounded-2xl border-2 flex items-start gap-2 text-xs"
            style={{
              backgroundColor: 'var(--color-error-bg)',
              borderColor: 'var(--color-error-border)',
              color: 'var(--color-error-text)',
            }}
          >
            <ShieldWarning weight="light" className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">
                {cashiers.some(c => c.isOverLimit)
                  ? t('cashierLimits.overLimitWarning')
                  : t('cashierLimits.nearLimitWarning')}
              </span>
              <button
                className="underline opacity-70 mt-1"
                onClick={() => { setActiveTab('audit'); setAuditAlertDismissed(true); if (businessId) loadAuditLog(businessId); }}
              >
                {t('auditLog.tab')} ←
              </button>
            </div>
            <button onClick={() => setAuditAlertDismissed(true)} className="opacity-60 hover:opacity-100">
              <X weight="light" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <nav 
          className="flex items-center overflow-x-auto p-1.5 rounded-2xl border text-[10px] sm:text-xs font-bold shadow-xs gap-1.5 backdrop-blur-xl no-scrollbar"
          style={{ backgroundColor: 'rgba(16, 14, 28, 0.75)', borderColor: 'rgba(255, 255, 255, 0.08)' }}
        >
          <button
            onClick={() => { setActiveTab('menu'); setFeedback(null); }}
            id="tab-menu-items"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'menu' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'menu' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            <Coffee weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('admin.menuTab')}</span>
          </button>

          {/* Phase 22.8: Offers Tab - completely hidden if both offers and daily_offers are disabled */}
          {(enabledFeatures.offers !== false || enabledFeatures.daily_offers !== false) && (
            <button
              onClick={() => { setActiveTab('offers'); setFeedback(null); }}
              id="tab-offers"
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'offers' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={activeTab === 'offers' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
            >
              <Sparkle weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('admin.offersTab')}</span>
            </button>
          )}

          <button
            onClick={() => { setActiveTab('customers'); setFeedback(null); }}
            id="tab-customers"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'customers' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'customers' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            <Users weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('admin.customersTab')}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('cashiers');
              setFeedback(null);
              if (businessId) {
                loadCashiers(businessId);
              }
            }}
            id="tab-cashiers"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer relative ${
              activeTab === 'cashiers' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'cashiers' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            {cashiers.some(c => c.isNearLimit || c.isOverLimit) && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2"
                style={{ backgroundColor: 'var(--color-error-text)', borderColor: 'var(--color-card-bg)' }}
              />
            )}
            <UserPlus weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('admin.cashiersTab')}</span>
          </button>

          <button
            onClick={() => { setActiveTab('settings'); setFeedback(null); if (businessId) loadPointsSummary(businessId); }}
            id="tab-settings"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === 'settings' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'settings' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            <Gear weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('admin.settingsTab')}</span>
          </button>

          {/* Phase 22.8: Partnerships Tab - completely hidden if branch_partnerships is disabled */}
          {enabledFeatures.branch_partnerships !== false && (
            <button
              onClick={() => { setActiveTab('partnerships'); setFeedback(null); }}
              id="tab-partnerships"
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'partnerships' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={activeTab === 'partnerships' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
            >
              <Handshake weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('partnerships.tab')}</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('audit');
              setFeedback(null);
              if (businessId) {
                loadAuditLog(businessId);
              }
            }}
            id="tab-audit-log"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer relative ${
              activeTab === 'audit' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'audit' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            {cashiers.some(c => c.isNearLimit || c.isOverLimit) && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2"
                style={{ backgroundColor: 'var(--color-error-text)', borderColor: 'var(--color-card-bg)' }}
              />
            )}
            <ClipboardText weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('auditLog.tab')}</span>
          </button>

          {/* Phase 22.8: Tiers Tab - completely hidden if membership_tiers is disabled */}
          {enabledFeatures.membership_tiers !== false && (
            <button
              onClick={() => {
                setActiveTab('tiers');
                setFeedback(null);
                if (businessId) {
                  loadTiers(businessId);
                }
              }}
              id="tab-tiers"
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'tiers' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={activeTab === 'tiers' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
            >
              <Medal weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('tiers.tab')}</span>
            </button>
          )}

          {/* Phase 22.8: Referral Tab - completely hidden if referral_program is disabled */}
          {enabledFeatures.referral_program !== false && (
            <button
              onClick={() => {
                setActiveTab('referral');
                setFeedback(null);
                if (businessId) {
                  loadReferral(businessId);
                }
              }}
              id="tab-referral"
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'referral' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={activeTab === 'referral' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
            >
              <Gift weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('admin.referralTab')}</span>
            </button>
          )}

          {/* Phase 22.8: Analytics Tab - completely hidden if analytics_reports is disabled */}
          {enabledFeatures.analytics_reports !== false && (
            <button
              onClick={() => {
                setActiveTab('analytics');
                setFeedback(null);
                if (businessId) {
                  loadAnalytics(businessId, analyticsTimeframe);
                }
              }}
              id="tab-analytics"
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'analytics' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
              }`}
              style={activeTab === 'analytics' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
            >
              <ChartBar weight="light" className="w-3.5 h-3.5 shrink-0" />
              <span>{t('analytics.tab')}</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('dailyReview');
              setFeedback(null);
              if (businessId) {
                loadDailyReview(businessId);
              }
            }}
            id="tab-daily-review"
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer relative ${
              activeTab === 'dailyReview' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={activeTab === 'dailyReview' ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' } : {}}
          >
            {dailyReviewData?.summary?.flaggedCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2"
                style={{ backgroundColor: 'var(--color-error-text)', borderColor: 'var(--color-card-bg)' }}
              />
            )}
            <Receipt weight="light" className="w-3.5 h-3.5 shrink-0" />
            <span>{t('admin.dailyReviewTab')}</span>
          </button>
        </nav>

        {/* =========================================================================
            TAB 1: 5.2 إدارة المنيو (Menu Items)
           ========================================================================= */}
        {activeTab === 'menu' && (
          <div className="flex flex-col gap-4">
            <form 
              onSubmit={handleAddMenuItem}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.addMenuItem')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    id="menu-item-name-input"
                    placeholder={t('admin.itemNamePlaceholder')}
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    required
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  {newItemName.trim() !== '' && !validateName(newItemName).isValid && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">
                      {t(`validation.${validateName(newItemName).errorKey}`)}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    id="menu-item-price-input"
                    dir="ltr"
                    placeholder={t('admin.itemPricePlaceholder')}
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    required
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  {newItemPrice.trim() !== '' && !validatePositiveNumber(newItemPrice, false).isValid && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">
                      {t(`validation.${validatePositiveNumber(newItemPrice, false).errorKey}`)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="submit"
                id="submit-menu-item-btn"
                disabled={isAddingItem}
                className="py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isAddingItem ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Plus weight="light" className="w-3.5 h-3.5" />}
                <span>{t('admin.addItem')}</span>
              </button>
            </form>

            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.menuItemsCount', { count: menuItems.length })}</h2>
              {menuItems.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">{t('admin.emptyMenu')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {menuItems.map((item) => {
                    const pointsCost = Math.ceil(item.price / parseFloat(currencyPerPoint || '0.1'));
                    return (
                      <div 
                        key={item.id}
                        className="p-3 rounded-2xl border flex items-center justify-between text-xs transition-colors"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      >
                        <div>
                          <span className="font-bold block">{item.name}</span>
                          <span className="text-[11px] opacity-60">{t('admin.redeemedFor', { price: item.price, points: pointsCost })}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteMenuItem(item.id, item.name)}
                          id={`delete-item-${item.id}`}
                          title={t('admin.deleteItemTitle')}
                          aria-label={t('admin.deleteItemTitle')}
                          className="p-2 rounded-lg transition-colors hover:opacity-70"
                          style={{ color: 'var(--color-error-text)' }}
                        >
                          <Trash weight="light" className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: 6.1.2 & 6.2 إدارة العروض (Offers with Image Upload)
           ========================================================================= */}
        {activeTab === 'offers' && (
          <div className="flex flex-col gap-4">
            <form 
              onSubmit={handleAddOffer}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.addOffer')}</h2>
              
              <div>
                <input
                  type="text"
                  id="offer-title-input"
                  placeholder={t('admin.offerTitlePlaceholder')}
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <div>
                <textarea
                  id="offer-desc-input"
                  placeholder={t('admin.offerDescPlaceholder')}
                  value={offerDesc}
                  onChange={(e) => setOfferDesc(e.target.value)}
                  required
                  rows={2}
                  className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] opacity-70 mb-1">{t('admin.offerType')}</label>
                  <select
                    id="offer-type-select"
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as any)}
                    className="w-full py-2 px-2.5 rounded-xl text-xs border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <option value="special">{t('admin.specialOption')}</option>
                    <option value="daily">{t('admin.dailyOption')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] opacity-70 mb-1">{t('admin.startDate')}</label>
                  <input
                    type="date"
                    id="offer-start-date"
                    dir="ltr"
                    value={offerStartDate}
                    onChange={(e) => setOfferStartDate(e.target.value)}
                    required
                    className="w-full py-1.5 px-2 rounded-xl text-xs border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] opacity-70 mb-1">{t('admin.endDate')}</label>
                  <input
                    type="date"
                    id="offer-end-date"
                    dir="ltr"
                    value={offerEndDate}
                    onChange={(e) => setOfferEndDate(e.target.value)}
                    required
                    className="w-full py-1.5 px-2 rounded-xl text-xs border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              {/* Image Upload Field */}
              <div>
                <label className="block text-[10px] opacity-70 mb-1">{t('admin.offerImage')}</label>
                <div className="flex items-center gap-2">
                  <label 
                    htmlFor="offer-image-file"
                    className="cursor-pointer py-2 px-3 rounded-xl border text-xs flex items-center gap-1.5 transition-colors hover:opacity-80"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <ImageIcon weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                    <span>{offerImage ? offerImage.name : t('admin.chooseImage')}</span>
                  </label>
                  <input
                    type="file"
                    id="offer-image-file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={handleClearImage}
                      title="Clear image"
                      className="p-2 rounded-xl border transition-colors hover:opacity-70"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-error-text)' }}
                    >
                      <X weight="light" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {imagePreview && (
                  <div className="mt-2 w-full h-24 rounded-xl overflow-hidden relative border" style={{ borderColor: 'var(--color-border)' }}>
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <button
                type="submit"
                id="submit-offer-btn"
                disabled={isAddingOffer}
                className="py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 mt-1"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isAddingOffer ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Sparkle weight="light" className="w-3.5 h-3.5" />}
                <span>{t('admin.publishOffer')}</span>
              </button>
            </form>

            {/* Offers List */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.offersCount', { count: offers.length })}</h2>

              {offers.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">{t('admin.emptyOffers')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {offers.map((offer) => (
                    <div 
                      key={offer.id}
                      className="p-3.5 rounded-2xl border flex flex-col gap-2"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                    >
                      {offer.image_url && (
                        <div className="w-full h-24 rounded-xl overflow-hidden relative border" style={{ borderColor: 'var(--color-border)' }}>
                          <img src={offer.image_url} alt={offer.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span 
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: offer.type === 'special' ? 'var(--color-badge-special-bg)' : 'var(--color-badge-daily-bg)',
                              color: offer.type === 'special' ? 'var(--color-badge-special-text)' : 'var(--color-badge-daily-text)',
                              borderColor: offer.type === 'special' ? 'var(--color-badge-special-border)' : 'var(--color-badge-daily-border)',
                            }}
                          >
                            {offer.type === 'special' ? t('admin.special') : t('admin.daily')}
                          </span>
                          <span className="font-bold text-xs">{offer.title}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteOffer(offer.id, offer.title)}
                          id={`delete-offer-${offer.id}`}
                          title="Delete offer"
                          aria-label="Delete offer"
                          className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                          style={{ color: 'var(--color-error-text)' }}
                        >
                          <Trash weight="light" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] opacity-70 leading-relaxed">{offer.description}</p>
                      <div className="text-[10px] opacity-50 font-mono">
                        {t('admin.fromTo', { from: offer.start_date, to: offer.end_date })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: 5.3 إدارة العملاء (Customers)
           ========================================================================= */}
        {activeTab === 'customers' && (
          <div className="flex flex-col gap-4">
            <form 
              onSubmit={handleAddCustomer}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.newCustomerTitle')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <input
                    type="text"
                    id="new-customer-name-input"
                    placeholder={t('admin.customerNamePlaceholder')}
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    required
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  {newCustName.trim() !== '' && !validateName(newCustName).isValid && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">
                      {t(`validation.${validateName(newCustName).errorKey}`)}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="tel"
                    id="new-customer-phone-input"
                    dir="ltr"
                    maxLength={11}
                    placeholder={t('admin.customerPhonePlaceholder')}
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    required
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  {newCustPhone.trim() !== '' && !validateEgyptianPhone(newCustPhone).isValid && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">
                      {t(`validation.${validateEgyptianPhone(newCustPhone).errorKey}`)}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="text"
                    id="new-customer-referral-input"
                    placeholder={t('admin.referralCodePlaceholder')}
                    value={newCustReferralCode}
                    onChange={(e) => setNewCustReferralCode(e.target.value.toUpperCase())}
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden font-mono uppercase"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              {/* 13.2 & 13.3: Mandatory Consent Checkbox */}
              <div 
                className="p-3 rounded-xl border flex items-start gap-2.5 transition-colors"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              >
                <input
                  type="checkbox"
                  id="customer-consent-checkbox"
                  checked={newCustConsent}
                  onChange={(e) => setNewCustConsent(e.target.checked)}
                  required
                  className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-amber-700"
                />
                <label 
                  htmlFor="customer-consent-checkbox" 
                  className="text-[11px] leading-relaxed cursor-pointer select-none opacity-90"
                >
                  {t('admin.consentCheckbox')} <span className="text-red-500 font-bold">*</span>
                </label>
              </div>

              <button
                type="submit"
                id="submit-customer-btn"
                disabled={isAddingCustomer || !newCustConsent}
                className="py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isAddingCustomer ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Plus weight="light" className="w-3.5 h-3.5" />}
                <span>{t('admin.generateCardBtn')}</span>
              </button>
            </form>

            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('admin.customersCount', { count: customers.length })}</h2>

              {customers.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">{t('admin.emptyCustomers')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {customers.map((c) => (
                    <div 
                      key={c.id}
                      className="p-3 rounded-2xl border flex items-center justify-between text-xs"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                    >
                      <div>
                        <span className="font-bold block">{c.name}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[11px] opacity-60 font-mono" dir="ltr">{c.phone_number}</span>
                          {c.referral_code && (
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold border"
                              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)', color: 'var(--color-accent)' }}
                            >
                              {c.referral_code}
                            </span>
                          )}
                          {c.consent_given_at && (
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium border"
                              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)', color: 'var(--color-accent)' }}
                            >
                              {t('admin.consentBadge')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
                          {c.points_balance || 0} {t('common.pointsUnit')}
                        </span>
                        <Link
                          href={`/card/${c.qr_token}`}
                          target="_blank"
                          title={t('admin.viewCardTitle')}
                          aria-label={t('admin.viewCardTitle')}
                          className="p-2 rounded-lg border transition-transform active:scale-95 shadow-xs"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                        >
                          <QrCode weight="light" className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: 5.4 إعدادات نسب النقاط (Redemption Rates)
           ========================================================================= */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-6">

            {/* ── Points Summary Dashboard ── */}
            <div
              className="p-5 rounded-3xl border shadow-sm"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <ChartBar weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  {isRtl ? 'ملخص النقاط' : 'Points Summary'}
                </h2>
                {pointsSummary.isLoading && <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin opacity-50" />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Today */}
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--color-bg)' }}>
                  <span className="text-[11px] opacity-60 uppercase tracking-wider block mb-2">{isRtl ? 'اليوم' : 'Today'}</span>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] opacity-70">{isRtl ? 'أضيف' : 'Issued'}</span>
                      <span className="text-sm font-black" style={{ color: '#22c55e' }}>+{pointsSummary.todayIssued.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] opacity-70">{isRtl ? 'استُبدل' : 'Redeemed'}</span>
                      <span className="text-sm font-black" style={{ color: 'var(--color-error-text)' }}>-{pointsSummary.todayRedeemed.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                {/* This Month */}
                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--color-bg)' }}>
                  <span className="text-[11px] opacity-60 uppercase tracking-wider block mb-2">{isRtl ? 'الشهر' : 'This Month'}</span>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] opacity-70">{isRtl ? 'أضيف' : 'Issued'}</span>
                      <span className="text-sm font-black" style={{ color: '#22c55e' }}>+{pointsSummary.monthIssued.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] opacity-70">{isRtl ? 'استُبدل' : 'Redeemed'}</span>
                      <span className="text-sm font-black" style={{ color: 'var(--color-error-text)' }}>-{pointsSummary.monthRedeemed.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Total Customers */}
              <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs opacity-70">{isRtl ? 'إجمالي العملاء المسجلين' : 'Total Registered Customers'}</span>
                <span className="text-lg font-black" style={{ color: 'var(--color-accent)' }}>{pointsSummary.totalCustomers.toLocaleString()}</span>
              </div>
            </div>

            <form 
              onSubmit={handleSaveSettings}
            className="p-6 rounded-3xl border shadow-sm flex flex-col gap-4"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h2 className="text-sm font-bold mb-1">{t('admin.ratesTitle')}</h2>
              <p className="text-xs opacity-70">
                {t('admin.ratesDesc')}
              </p>
            </div>

            <div className="flex flex-col gap-3.5 pt-2">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {t('admin.pointsPerCurrencyLabel')}
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  id="points-per-currency-input"
                  dir="ltr"
                  value={pointsPerUnit}
                  onChange={(e) => setPointsPerUnit(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {t('admin.currencyPerPointLabel')}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  id="currency-per-point-input"
                  dir="ltr"
                  value={currencyPerPoint}
                  onChange={(e) => setCurrencyPerPoint(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              {/* 4.4: Points Expiry Months */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {t('admin.pointsExpiryLabel')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  id="points-expiry-months-input"
                  dir="ltr"
                  value={pointsExpiryMonths}
                  onChange={(e) => setPointsExpiryMonths(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                <p className="text-[11px] opacity-60 mt-1">{t('admin.pointsExpiryHint')}</p>
              </div>

              {/* 5.4 & PLAN.md 4.4: Redemption Type Selector */}
              <div>
                <label className="block text-xs font-semibold mb-2 opacity-85">
                  {t('admin.redemptionTypeLabel')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['product', 'cash', 'both'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      id={`redemption-type-${type}`}
                      onClick={() => setRedemptionType(type)}
                      className="py-2.5 px-2 rounded-xl text-[11px] font-bold border transition-all active:scale-95"
                      style={
                        redemptionType === type
                          ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)', borderColor: 'var(--color-accent)' }
                          : { backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }
                      }
                    >
                      {t(`admin.redemptionType_${type}`)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] opacity-60 mt-1">{t('admin.redemptionTypeHint')}</p>
              </div>

              {/* Phase 32: Max Offline Transactions */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {t('admin.maxOfflineLimitLabel')}
                </label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  step="1"
                  id="max-offline-transactions-input"
                  dir="ltr"
                  value={maxOfflineTransactions}
                  onChange={(e) => setMaxOfflineTransactions(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
                <p className="text-[11px] opacity-60 mt-1">{t('admin.maxOfflineLimitDesc')}</p>
              </div>
            </div>

            <button
              type="submit"
              id="save-settings-btn"
              disabled={isSavingSettings}
              className="py-3 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
            >
              {isSavingSettings ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Check weight="light" className="w-3.5 h-3.5" />}
              <span>{t('admin.saveSettings')}</span>
            </button>
          </form>

          {/* Phase 9.5 & 9.5.2: الهوية البصرية والتصميم (Branding & Identity) */}
          <form 
            onSubmit={handleSaveBranding}
            className="p-6 rounded-3xl border shadow-sm flex flex-col gap-4 mt-6"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2">
              <Palette weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <div>
                <h2 className="text-sm font-bold mb-0.5">{isRtl ? 'الهوية البصرية والمظهر (Branding)' : 'Brand & Visual Identity'}</h2>
                <p className="text-xs opacity-70">
                  {isRtl ? 'تخصيص ألوان وخطوط وقالب شاشة العميل الخاصة بمتجرك' : 'Customize colors, font, and customer layout variant for your store'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 pt-2">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {isRtl ? 'اسم المتجر المعروض للعميل' : 'Display Name for Customers'}
                </label>
                <input
                  type="text"
                  placeholder={businessName || 'مثال: كافيه النخيل'}
                  value={brandingDisplayName}
                  onChange={(e) => setBrandingDisplayName(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {isRtl ? 'رابط الشعار (Logo URL)' : 'Logo Image URL'}
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={brandingLogoUrl}
                  onChange={(e) => setBrandingLogoUrl(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              {/* Color Palette */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-85">
                    {isRtl ? 'اللون الأساسي (خلفية شاشة العميل)' : 'Primary Color (Customer BG)'}
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
                  <label className="block text-xs font-semibold mb-1 opacity-85">
                    {isRtl ? 'لون التمييز (Accent Color للأزرار)' : 'Accent Color (Buttons & Icons)'}
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
                      <span>{isRtl ? 'الألوان المختارة تحقق معايير سهولة القراءة والتباين (WCAG AA Pass)' : 'Colors pass accessibility contrast standards (WCAG AA Pass)'}</span>
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
                <label className="block text-xs font-semibold mb-1 opacity-85">
                  {isRtl ? 'نوع الخط المعتمد لشاشة العميل' : 'Approved Font Family'}
                </label>
                <select
                  value={brandingFontFamily}
                  onChange={(e) => setBrandingFontFamily(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <option value="Inter">Inter (Modern Clean)</option>
                  <option value="Roboto">Roboto (Geometric)</option>
                  <option value="Cairo">Cairo (Arabic Optimized)</option>
                  <option value="Tajawal">Tajawal (Elegant Arabic)</option>
                </select>
              </div>

              {/* Layout Variant (Phase 9.5.1: 3 pre-built layout variants) */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 opacity-85">
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
                      className="p-2 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer"
                      style={
                        brandingLayoutVariant === v.id
                          ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)', borderColor: 'var(--color-accent)' }
                          : { backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }
                      }
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              id="save-branding-btn"
              disabled={isSavingBranding}
              className="py-3 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
            >
              {isSavingBranding ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Check weight="light" className="w-3.5 h-3.5" />}
              <span>{isRtl ? 'حفظ الهوية والتصميم' : 'Save Brand Settings'}</span>
            </button>
          </form>

          {/* Phase 16: Notification Settings Card */}
          {userRole === 'owner' && (
            <form
              onSubmit={handleSaveNotifications}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">
                    {isRtl ? 'إعدادات الإشعارات (WhatsApp)' : 'Notifications (WhatsApp)'}
                  </h2>
                  <p className="text-[11px] opacity-55 mt-0.5">
                    {isRtl
                      ? 'أدخل بيانات WhatsApp Cloud API لتفعيل إشعارات العملاء'
                      : 'Enter WhatsApp Cloud API credentials to enable customer notifications'}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="notif-enabled-toggle"
                    checked={notifEnabled}
                    onChange={(e) => setNotifEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                  />
                  <span className="text-[11px] font-semibold opacity-70">
                    {notifEnabled ? (isRtl ? 'مفعّل' : 'Enabled') : (isRtl ? 'معطّل' : 'Disabled')}
                  </span>
                </label>
              </div>
              <div>
                <label className="text-[11px] font-semibold opacity-70 block mb-1">
                  {isRtl ? 'Phone Number ID' : 'Phone Number ID'}
                </label>
                <input
                  id="notif-phone-number-id"
                  type="text"
                  value={notifPhoneNumberId}
                  onChange={(e) => setNotifPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold opacity-70 block mb-1">
                  {isRtl ? 'Access Token (سيُمحى بعد الحفظ)' : 'Access Token (cleared after save)'}
                </label>
                <input
                  id="notif-access-token"
                  type="password"
                  value={notifAccessToken}
                  onChange={(e) => setNotifAccessToken(e.target.value)}
                  placeholder={notifLoaded && notifPhoneNumberId ? '••••••••••••••• (already saved)' : 'EAAxxxxxxxxx...'}
                  className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden font-mono"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>
              <button
                type="submit"
                id="save-notifications-btn"
                disabled={isSavingNotif}
                className="py-3 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isSavingNotif ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Check weight="light" className="w-3.5 h-3.5" />}
                <span>{isRtl ? 'حفظ إعدادات الإشعارات' : 'Save Notification Settings'}</span>
              </button>
            </form>
          )}
        </div>
      )}


        {/* =========================================================================
            TAB 5: Phase 10 التعاون بين الأماكن (Partnerships)
           ========================================================================= */}
        {activeTab === 'partnerships' && (
          <div className="flex flex-col gap-6">
            {/* 10.3 Send Partnership Request Form */}
            <form
              onSubmit={handleSendPartnershipRequest}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2">
                <Handshake weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">
                  {t('partnerships.sendRequest')}
                </h2>
              </div>
              <p className="text-[11px] opacity-60">{t('partnerships.subtitle')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-80">
                    {t('partnerships.targetSubdomain')}
                  </label>
                  <input
                    type="text"
                    id="target-subdomain-input"
                    placeholder={t('partnerships.targetSubdomainPlaceholder')}
                    value={targetSubdomain}
                    onChange={(e) => setTargetSubdomain(e.target.value)}
                    required
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-80">
                    {t('partnerships.terms')}
                  </label>
                  <input
                    type="text"
                    id="partnership-terms-input"
                    placeholder={t('partnerships.termsPlaceholder')}
                    value={partnershipTerms}
                    onChange={(e) => setPartnershipTerms(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                id="send-partnership-btn"
                disabled={isSendingRequest}
                className="py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-1.5 self-start disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isSendingRequest ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <PaperPlaneTilt weight="light" className="w-3.5 h-3.5" />}
                <span>{t('partnerships.sendBtn')}</span>
              </button>
            </form>

            {/* List of Partnerships */}
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 px-1">
                {t('partnerships.listTitle', { count: partnerships.length })}
              </h2>

              {partnerships.length === 0 ? (
                <div 
                  className="p-8 rounded-3xl border text-center text-xs opacity-60"
                  style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                >
                  {t('partnerships.emptyList')}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {partnerships.map((p) => {
                    const isPending = p.status === 'pending';
                    const isActive = p.status === 'active';
                    const canRespond = isPending && !p.is_initiator;

                    return (
                      <div
                        key={p.id}
                        className="p-4 rounded-2xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold">{p.partner_name}</span>
                            <span className="text-[10px] opacity-60 font-mono">(@{p.partner_subdomain})</span>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: isActive
                                  ? 'var(--color-success-bg)'
                                  : isPending
                                  ? 'var(--color-bg)'
                                  : 'var(--color-error-bg)',
                                color: isActive
                                  ? 'var(--color-success-text)'
                                  : isPending
                                  ? 'var(--color-accent)'
                                  : 'var(--color-error-text)',
                              }}
                            >
                              {p.status === 'active'
                                ? t('partnerships.statusActive')
                                : p.status === 'pending'
                                ? t('partnerships.statusPending')
                                : t('partnerships.statusRejected')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] opacity-60 flex-wrap">
                            <span>{p.is_initiator ? t('partnerships.initiatedByYou') : t('partnerships.initiatedByPartner')}</span>
                            {p.terms && <span>• {p.terms}</span>}
                          </div>
                        </div>

                        {canRespond && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handlePartnershipAction(p.id, 'accept')}
                              disabled={actionLoadingId === p.id}
                              id={`accept-partnership-${p.id}`}
                              className="py-1.5 px-3 rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center gap-1 disabled:opacity-50"
                              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                            >
                              <Check weight="light" className="w-3 h-3" />
                              <span>{t('partnerships.acceptBtn')}</span>
                            </button>
                            <button
                              onClick={() => handlePartnershipAction(p.id, 'reject')}
                              disabled={actionLoadingId === p.id}
                              id={`reject-partnership-${p.id}`}
                              className="py-1.5 px-3 rounded-lg text-xs font-bold border text-rose-500 transition-transform active:scale-95 flex items-center gap-1 disabled:opacity-50"
                              style={{ borderColor: 'var(--color-border)' }}
                            >
                              <X weight="light" className="w-3 h-3" />
                              <span>{t('partnerships.rejectBtn')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 10.4 Transfer Points Form (Shown if active partnerships exist) */}
            {partnerships.some((p) => p.status === 'active') && (
              <form
                onSubmit={handleTransferPoints}
                className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
                style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <ArrowsLeftRight weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">
                    {t('partnerships.transferTitle')}
                  </h2>
                </div>
                <p className="text-[11px] opacity-60">{t('partnerships.transferSubtitle')}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1 opacity-80">
                      {t('partnerships.selectPartnership')}
                    </label>
                    <select
                      id="transfer-partnership-select"
                      value={transferPartnershipId}
                      onChange={(e) => setTransferPartnershipId(e.target.value)}
                      required
                      className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                      style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                    >
                      <option value="">{t('partnerships.selectPartnershipPlaceholder')}</option>
                      {partnerships
                        .filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.partner_name} (@{p.partner_subdomain})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 opacity-80">
                      {t('partnerships.customerId')}
                    </label>
                    <input
                      type="text"
                      id="transfer-customer-id-input"
                      placeholder={t('partnerships.customerIdPlaceholder')}
                      value={transferCustomerId}
                      onChange={(e) => setTransferCustomerId(e.target.value)}
                      required
                      className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                      style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1 opacity-80">
                      {t('partnerships.pointsToTransfer')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      id="transfer-points-input"
                      placeholder={t('partnerships.pointsPlaceholder')}
                      value={transferPoints}
                      onChange={(e) => setTransferPoints(e.target.value)}
                      required
                      className="w-full py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden"
                      style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  id="transfer-points-btn"
                  disabled={isTransferring}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-1.5 self-start disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                >
                  {isTransferring ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <ArrowsLeftRight weight="light" className="w-3.5 h-3.5" />}
                  <span>{t('partnerships.transferBtn')}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 6: Phase 15 — Audit Log + Cashier Limits
           ========================================================================= */}
        {(activeTab === 'cashiers' || activeTab === 'audit') && (
          <div className="flex flex-col gap-6">

            {/* 15.2: Cashier Daily Limits Manager */}
            <div
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldWarning weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('cashierLimits.title')}</h2>
                    <p className="text-[11px] opacity-60 mt-0.5">{t('cashierLimits.subtitle')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddCashierModal(true)}
                  id="admin-add-cashier-btn"
                  className="py-1.5 px-3 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                >
                  <UserPlus weight="light" className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'إضافة كاشير' : 'Add Cashier'}</span>
                </button>
              </div>

              {/* Add Cashier Form / Modal */}
              {showAddCashierModal && (
                <div className="p-4 rounded-2xl border flex flex-col gap-3 transition-all" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-accent)' }}>
                  <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-xs font-bold">{isRtl ? 'إضافة موظف كاشير جديد' : 'Add New Cashier'}</span>
                    <button
                      type="button"
                      onClick={() => setShowAddCashierModal(false)}
                      className="opacity-60 hover:opacity-100 p-1 cursor-pointer"
                    >
                      <X weight="light" className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateCashier} className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'الاسم الكامل *' : 'Full Name *'}</label>
                        <input
                          type="text"
                          required
                          value={newCashierName}
                          onChange={(e) => setNewCashierName(e.target.value)}
                          placeholder={isRtl ? 'مثال: أحمد محمد' : 'e.g. Ahmed Ali'}
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                        {newCashierName.trim() !== '' && !validateName(newCashierName).isValid && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">
                            {t(`validation.${validateName(newCashierName).errorKey}`)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'البريد الإلكتروني *' : 'Email *'}</label>
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={newCashierEmail}
                          onChange={(e) => setNewCashierEmail(e.target.value)}
                          placeholder="cashier@example.com"
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                        {newCashierEmail.trim() !== '' && !validateEmail(newCashierEmail).isValid && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">
                            {t(`validation.${validateEmail(newCashierEmail).errorKey}`)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'كلمة المرور * (8 خانات، حرف ورقم)' : 'Password *'}</label>
                        <input
                          type="password"
                          required
                          dir="ltr"
                          value={newCashierPassword}
                          onChange={(e) => setNewCashierPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                        {newCashierPassword !== '' && !validatePassword(newCashierPassword).isValid && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">
                            {t(`validation.${validatePassword(newCashierPassword).errorKey}`)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'رقم الهاتف (اختياري - 010/011/012/015)' : 'Phone Number'}</label>
                        <input
                          type="tel"
                          dir="ltr"
                          maxLength={11}
                          value={newCashierPhone}
                          onChange={(e) => setNewCashierPhone(e.target.value)}
                          placeholder="01012345678"
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                        {newCashierPhone.trim() !== '' && !validateEgyptianPhone(newCashierPhone).isValid && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">
                            {t(`validation.${validateEgyptianPhone(newCashierPhone).errorKey}`)}
                          </p>
                        )}
                      </div>

                      {branches.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'الفرع' : 'Branch'}</label>
                          <select
                            value={newCashierBranchId}
                            onChange={(e) => setNewCashierBranchId(e.target.value)}
                            className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                          >
                            <option value="">{isRtl ? 'جميع الفروع / غير محدد' : 'All Branches / None'}</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'الحد اليومي للنقاط' : 'Daily Points Limit'}</label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          dir="ltr"
                          value={newCashierDailyLimit}
                          onChange={(e) => setNewCashierDailyLimit(e.target.value)}
                          placeholder="1000"
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1 opacity-80">{isRtl ? 'الحد لكل عملية (نقطة)' : 'Per-Tx Limit (pts)'}</label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          dir="ltr"
                          value={newCashierTxLimit}
                          onChange={(e) => setNewCashierTxLimit(e.target.value)}
                          placeholder="500"
                          className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <button
                        type="button"
                        onClick={() => setShowAddCashierModal(false)}
                        className="py-1.5 px-3 rounded-xl text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingCashier}
                        className="py-1.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                      >
                        {isCreatingCashier ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <UserPlus weight="light" className="w-3.5 h-3.5" />}
                        <span>{isCreatingCashier ? t('common.loading') : (isRtl ? 'إنشاء الحساب' : 'Create Cashier')}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {cashiers.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-4">{t('cashierLimits.noCashiers')}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {cashiers.map((cashier) => {
                    const isOver = cashier.isOverLimit;
                    const isNear = cashier.isNearLimit && !isOver;
                    return (
                      <div
                        key={cashier.roleId}
                        className="p-3 rounded-2xl border"
                        style={{
                          backgroundColor: 'var(--color-bg)',
                          borderColor: isOver ? 'var(--color-error-border)' : isNear ? 'var(--color-accent)' : 'var(--color-border)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">
                                {cashier.fullName || cashier.email || `ID: ${cashier.userId.slice(0, 8)}…`}
                              </span>
                              {cashier.email && cashier.fullName && (
                                <span className="text-[10px] opacity-60 font-mono" dir="ltr">
                                  ({cashier.email})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {cashier.phoneNumber && (
                                <span className="text-[10px] opacity-60 font-mono" dir="ltr">
                                  {cashier.phoneNumber}
                                </span>
                              )}
                              {cashier.branchName && (
                                <span className="text-[10px] opacity-60">
                                  • {t('cashierLimits.branch')} {cashier.branchName}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            isOver ? 'bg-red-100 text-red-700' : isNear ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {cashier.dailyPointsLimit > 0
                              ? t('cashierLimits.usagePercent', { percent: cashier.usagePercent })
                              : '∞'}
                          </div>
                        </div>

                        {/* Usage bar */}
                        {cashier.dailyPointsLimit > 0 && (
                          <div className="mb-2">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(cashier.usagePercent, 100)}%`,
                                  backgroundColor: isOver ? 'var(--color-error-text)' : isNear ? '#f59e0b' : 'var(--color-accent)',
                                }}
                              />
                            </div>
                            <p className="text-[11px] opacity-60 mt-1">
                              {t('cashierLimits.todayUsage', {
                                today: cashier.pointsAddedToday,
                                limit: cashier.dailyPointsLimit,
                              })}
                            </p>
                          </div>
                        )}

                        {cashier.dailyPointsLimit === 0 && (
                          <p className="text-[11px] opacity-60 mb-2">
                            {t('cashierLimits.todayUsageNoLimit', { today: cashier.pointsAddedToday })}
                          </p>
                        )}

                        {/* Edit limits */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="block text-[10px] font-semibold opacity-70 mb-0.5">
                              {isRtl ? 'الحد اليومي (0 = بلا حد)' : 'Daily Limit (0 = no limit)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              dir="ltr"
                              id={`cashier-limit-input-${cashier.roleId}`}
                              value={cashierLimitEdits[cashier.roleId] ?? String(cashier.dailyPointsLimit)}
                              onChange={(e) =>
                                setCashierLimitEdits((prev) => ({ ...prev, [cashier.roleId]: e.target.value }))
                              }
                              className="w-full py-1.5 px-2.5 rounded-lg text-xs border focus:outline-hidden"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold opacity-70 mb-0.5">
                              {isRtl ? 'الحد لكل عملية (فارغ = بلا حد)' : 'Per-Tx Limit (blank = no limit)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              dir="ltr"
                              placeholder={isRtl ? 'بلا حد' : 'Unlimited'}
                              id={`cashier-tx-limit-input-${cashier.roleId}`}
                              value={cashierTxLimitEdits[cashier.roleId] ?? ''}
                              onChange={(e) =>
                                setCashierTxLimitEdits((prev) => ({ ...prev, [cashier.roleId]: e.target.value }))
                              }
                              className="w-full py-1.5 px-2.5 rounded-lg text-xs border focus:outline-hidden"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end mt-2">
                          <button
                            id={`save-cashier-limit-${cashier.roleId}`}
                            onClick={() => handleSaveCashierLimit(cashier.roleId)}
                            disabled={savingLimitId === cashier.roleId}
                            className="py-1.5 px-3 rounded-lg text-xs font-bold transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                          >
                            {savingLimitId === cashier.roleId
                              ? <CircleNotch weight="light" className="w-3 h-3 animate-spin" />
                              : <Check weight="light" className="w-3 h-3" />}
                            <span>{t('cashierLimits.saveLimit')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* === 15.1: Audit Log Section === */}
            {activeTab === 'audit' && (
            <div
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2">
                <ClipboardText weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">{t('auditLog.title')}</h2>
                  <p className="text-[11px] opacity-60 mt-0.5">{t('auditLog.subtitle')}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] opacity-70 mb-1">{t('auditLog.filterByCashier')}</label>
                  <select
                    id="audit-cashier-filter"
                    value={auditCashierFilter}
                    onChange={(e) => setAuditCashierFilter(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  >
                    <option value="">{t('auditLog.allCashiers')}</option>
                    {cashiers.map((c) => (
                      <option key={c.userId} value={c.userId}>ID: {c.userId.slice(0, 12)}…</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] opacity-70 mb-1">{t('auditLog.filterFromDate')}</label>
                  <input
                    type="date"
                    id="audit-from-date"
                    value={auditFromDate}
                    onChange={(e) => setAuditFromDate(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] opacity-70 mb-1">{t('auditLog.filterToDate')}</label>
                  <input
                    type="date"
                    id="audit-to-date"
                    value={auditToDate}
                    onChange={(e) => setAuditToDate(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg text-[11px] border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  id="apply-audit-filter-btn"
                  onClick={() => businessId && loadAuditLog(businessId, {
                    cashierId: auditCashierFilter || undefined,
                    fromDate: auditFromDate || undefined,
                    toDate: auditToDate || undefined,
                  })}
                  className="py-1.5 px-3 rounded-lg text-[11px] font-bold transition-transform active:scale-95"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                >
                  {t('auditLog.applyFilter')}
                </button>
                <button
                  id="reset-audit-filter-btn"
                  onClick={() => {
                    setAuditCashierFilter('');
                    setAuditFromDate('');
                    setAuditToDate('');
                    if (businessId) loadAuditLog(businessId);
                  }}
                  className="py-1.5 px-3 rounded-lg text-[11px] font-bold border transition-transform active:scale-95"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {t('auditLog.resetFilter')}
                </button>
              </div>

              {/* Audit log entries */}
              {isLoadingAudit ? (
                <div className="flex justify-center py-6">
                  <CircleNotch weight="light" className="w-5 h-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">{t('auditLog.empty')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {auditLogs.map((log: any) => {
                    const isRejected = log.status === 'rejected';
                    const actionLabel =
                      log.action === 'add_points' ? t('auditLog.actionAddPoints')
                      : log.action === 'deduct_points' ? t('auditLog.actionDeductPoints')
                      : t('auditLog.actionRejected');

                    return (
                      <div
                        key={log.id}
                        className="p-3 rounded-2xl border text-[11px] flex flex-col gap-1"
                        style={{
                          backgroundColor: 'var(--color-bg)',
                          borderColor: isRejected ? 'var(--color-error-border)' : 'var(--color-border)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {isRejected
                              ? <ShieldWarning weight="light" className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-error-text)' }} />
                              : log.action === 'add_points'
                                ? <span className="font-bold text-green-600">+{log.pointsChange}</span>
                                : <span className="font-bold" style={{ color: 'var(--color-error-text)' }}>{log.pointsChange}</span>
                            }
                            <span className="font-semibold">{actionLabel}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isRejected ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {isRejected ? t('auditLog.statusRejected') : t('auditLog.statusSuccess')}
                          </span>
                        </div>

                        <div className="opacity-60 space-y-0.5">
                          <div>{t('auditLog.colCustomer')}: {log.customerName || t('auditLog.unknownCustomer')}</div>
                          <div>{t('auditLog.colCashier')}: {log.cashierId?.slice(0, 12)}…</div>
                          {log.reason && <div>{t('auditLog.reasonLabel')} {log.reason}</div>}
                          {isRejected && log.errorMessage && (
                            <div className="text-[10px]" style={{ color: 'var(--color-error-text)' }}>
                              {t('auditLog.errorLabel')} {log.errorMessage}
                            </div>
                          )}
                          <div>{t('auditLog.colTime')}: {new Date(log.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

          </div>
        )}

        {/* =========================================================================
            Tab 7: Membership Tiers (Phase 17)
           ========================================================================= */}
        {activeTab === 'tiers' && (
          <div className="flex flex-col gap-6">
            
            {/* Create Tier Form */}
            <form 
              onSubmit={handleAddTier} 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <Plus weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <span>{t('tiers.addTierTitle')}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] opacity-70 mb-1 font-medium">{t('tiers.tierNameLabel')}</label>
                  <input
                    type="text"
                    id="tier-name-input"
                    value={newTierName}
                    onChange={(e) => setNewTierName(e.target.value)}
                    placeholder={t('tiers.tierNamePlaceholder')}
                    required
                    className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] opacity-70 mb-1 font-medium">{t('tiers.minPointsLabel')}</label>
                  <input
                    type="number"
                    id="tier-min-points-input"
                    value={newTierMinPoints}
                    onChange={(e) => setNewTierMinPoints(e.target.value)}
                    placeholder="0"
                    min="0"
                    required
                    className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] opacity-70 mb-1 font-medium">{t('tiers.benefitsLabel')}</label>
                <input
                  type="text"
                  id="tier-benefits-input"
                  value={newTierBenefits}
                  onChange={(e) => setNewTierBenefits(e.target.value)}
                  placeholder={t('tiers.benefitsPlaceholder')}
                  className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <button
                type="submit"
                id="add-tier-btn"
                disabled={isAddingTier || !newTierName.trim()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isAddingTier ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" /> : <Plus weight="light" className="w-3.5 h-3.5" />}
                <span>{isAddingTier ? t('tiers.adding') : t('tiers.addTierBtn')}</span>
              </button>
            </form>

            {/* Tiers List */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Medal weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  <span>{t('tiers.tiersListTitle', { count: tiers.length })}</span>
                </h2>
              </div>

              {tiers.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">{t('tiers.emptyTiers')}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {tiers.map((tier: any) => {
                    const isEditing = editingTierId === tier.id;

                    if (isEditing) {
                      return (
                        <div
                          key={tier.id}
                          className="p-4 rounded-2xl border flex flex-col gap-3"
                          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-accent)' }}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editTierName}
                              onChange={(e) => setEditTierName(e.target.value)}
                              placeholder={t('tiers.tierNameLabel')}
                              className="py-1.5 px-3 rounded-lg text-xs border focus:outline-hidden"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                            <input
                              type="number"
                              value={editTierMinPoints}
                              onChange={(e) => setEditTierMinPoints(e.target.value)}
                              placeholder={t('tiers.minPointsLabel')}
                              className="py-1.5 px-3 rounded-lg text-xs border focus:outline-hidden"
                              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                            />
                          </div>
                          <input
                            type="text"
                            value={editTierBenefits}
                            onChange={(e) => setEditTierBenefits(e.target.value)}
                            placeholder={t('tiers.benefitsLabel')}
                            className="py-1.5 px-3 rounded-lg text-xs border focus:outline-hidden"
                            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateTier(tier.id)}
                              disabled={isUpdatingTier}
                              className="py-1.5 px-3 rounded-lg text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1"
                              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                            >
                              {isUpdatingTier ? <CircleNotch weight="light" className="w-3 h-3 animate-spin" /> : <Check weight="light" className="w-3 h-3" />}
                              <span>{t('common.save')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTierId(null)}
                              className="py-1.5 px-3 rounded-lg text-xs font-semibold border"
                              style={{ borderColor: 'var(--color-border)' }}
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={tier.id}
                        className="p-4 rounded-2xl border flex items-center justify-between gap-3"
                        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs"
                              style={{
                                backgroundColor: 'var(--color-card-bg)',
                                borderColor: 'var(--color-accent)',
                                color: 'var(--color-accent)',
                              }}
                            >
                              <Medal weight="light" className="w-3 h-3" />
                              <span>{tier.name}</span>
                            </span>
                            <span className="text-[11px] opacity-60">
                              {t('tiers.minRequired', { points: tier.min_points_earned })}
                            </span>
                          </div>
                          {tier.benefits_description && (
                            <p className="text-xs opacity-70 truncate">{tier.benefits_description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTierId(tier.id);
                              setEditTierName(tier.name);
                              setEditTierMinPoints(String(tier.min_points_earned));
                              setEditTierBenefits(tier.benefits_description || '');
                            }}
                            className="w-8 h-8 rounded-xl border flex items-center justify-center transition-opacity hover:opacity-80"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                            title={t('common.edit')}
                          >
                            <PencilSimple weight="light" className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTier(tier.id, tier.name)}
                            disabled={deletingTierId === tier.id}
                            className="w-8 h-8 rounded-xl border flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-error-text)' }}
                            title={t('common.delete')}
                          >
                            {deletingTierId === tier.id ? (
                              <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash weight="light" className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 8: 19.3 & 19.4 برنامج الإحالة (Referral Program)
           ========================================================================= */}
        {activeTab === 'referral' && (
          <div className="flex flex-col gap-4">
            {/* Referral Settings Form */}
            <form
              onSubmit={handleSaveReferral}
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Gift weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  <span>{t('admin.referralSettingsTitle')}</span>
                </h2>
                <p className="text-xs opacity-60 mt-1">
                  {t('admin.referralSettingsDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] opacity-70 mb-1 font-medium">
                    {t('admin.referrerRewardLabel')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    id="referrer-reward-points-input"
                    value={referrerRewardPoints}
                    onChange={(e) => setReferrerRewardPoints(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] opacity-70 mb-1 font-medium">
                    {t('admin.refereeRewardLabel')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    id="referee-reward-points-input"
                    value={refereeRewardPoints}
                    onChange={(e) => setRefereeRewardPoints(e.target.value)}
                    required
                    className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                id="save-referral-btn"
                disabled={isSavingReferral}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-transform active:scale-95 shadow-sm mt-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isSavingReferral ? (
                  <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FloppyDisk weight="light" className="w-3.5 h-3.5" />
                )}
                <span>{isSavingReferral ? t('common.loading') : t('admin.saveReferralSettings')}</span>
              </button>
            </form>

            {/* Referral Stats Summary Card */}
            <div
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
              id="referral-stats-card"
            >
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">
                {t('admin.referralStatsTitle')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-1"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-60 font-medium">{t('admin.totalReferrals')}</span>
                  <span className="text-2xl font-black" style={{ color: 'var(--color-accent)' }}>
                    {referralStats.totalReferrals}
                  </span>
                </div>

                <div
                  className="p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-1"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-60 font-medium">{t('admin.totalReferralPoints')}</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    +{referralStats.totalPointsAwarded} {t('common.pointsUnit')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 9: 20.1 - 20.3 لوحة التحليلات وتقارير المالك (Owner Analytics)
           ========================================================================= */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-5">
            {/* Header & Timeframe Filter Pills */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <ChartBar weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                  <span>{t('analytics.title')}</span>
                </h2>
                <p className="text-xs opacity-60 mt-1">
                  {t('analytics.subtitle')}
                </p>
              </div>

              {/* Timeframe selector */}
              <div 
                className="p-1 rounded-2xl border flex items-center gap-1 self-start sm:self-auto text-xs font-semibold shrink-0"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              >
                {(['7d', '30d', '90d', 'all'] as const).map((tf) => (
                  <button
                    key={tf}
                    id={`timeframe-${tf}-btn`}
                    onClick={() => {
                      setAnalyticsTimeframe(tf);
                      if (businessId) loadAnalytics(businessId, tf);
                    }}
                    className={`px-3 py-1.5 rounded-xl transition-all ${
                      analyticsTimeframe === tf ? 'shadow-xs font-bold' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={
                      analyticsTimeframe === tf
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }
                        : {}
                    }
                  >
                    {tf === '7d' && t('analytics.timeframe7d')}
                    {tf === '30d' && t('analytics.timeframe30d')}
                    {tf === '90d' && t('analytics.timeframe90d')}
                    {tf === 'all' && t('analytics.timeframeAll')}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingAnalytics ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-70">
                <CircleNotch weight="light" className="w-7 h-7 animate-spin mb-2" style={{ color: 'var(--color-accent)' }} />
                <span className="text-xs">{t('analytics.loadingAnalytics')}</span>
              </div>
            ) : (
              <>
                {/* 4 KPI Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* KPI 1: Active Customers */}
                  <div
                    className="p-4 rounded-2xl border flex flex-col justify-between gap-2 shadow-2xs"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                    id="kpi-active-customers"
                  >
                    <div className="flex items-center justify-between opacity-60">
                      <span className="text-[11px] font-medium">{t('analytics.kpiActiveCust')}</span>
                      <Users weight="light" className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black" style={{ color: 'var(--color-accent)' }}>
                          {analyticsData?.activeCustomers ?? 0}
                        </span>
                        <span className="text-xs opacity-50">
                          / {analyticsData?.totalCustomers ?? 0}
                        </span>
                      </div>
                      <span className="text-[10px] opacity-60 block mt-0.5">
                        {t('analytics.activeRate', { percent: analyticsData?.activeRatePercent ?? 0 })}
                      </span>
                    </div>
                  </div>

                  {/* KPI 2: Points Issued */}
                  <div
                    className="p-4 rounded-2xl border flex flex-col justify-between gap-2 shadow-2xs"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                    id="kpi-points-issued"
                  >
                    <div className="flex items-center justify-between opacity-60">
                      <span className="text-[11px] font-medium">{t('analytics.kpiPointsIssued')}</span>
                      <TrendUp weight="light" className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">
                        +{(analyticsData?.totalPointsIssued ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] opacity-60 block mt-0.5">
                        {t('common.pointsUnit')}
                      </span>
                    </div>
                  </div>

                  {/* KPI 3: Points Redeemed */}
                  <div
                    className="p-4 rounded-2xl border flex flex-col justify-between gap-2 shadow-2xs"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                    id="kpi-points-redeemed"
                  >
                    <div className="flex items-center justify-between opacity-60">
                      <span className="text-[11px] font-medium">{t('analytics.kpiPointsRedeemed')}</span>
                      <Gift weight="light" className="w-4 h-4 text-rose-500" />
                    </div>
                    <div>
                      <span className="text-2xl font-black text-rose-600 dark:text-rose-400 block">
                        -{(analyticsData?.totalPointsRedeemed ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] opacity-60 block mt-0.5">
                        {t('common.pointsUnit')}
                      </span>
                    </div>
                  </div>

                  {/* KPI 4: Redemption Rate */}
                  <div
                    className="p-4 rounded-2xl border flex flex-col justify-between gap-2 shadow-2xs"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                    id="kpi-redemption-rate"
                  >
                    <div className="flex items-center justify-between opacity-60">
                      <span className="text-[11px] font-medium">{t('analytics.kpiRedemptionRate')}</span>
                      <ChartPie weight="light" className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-2xl font-black" style={{ color: 'var(--color-accent)' }}>
                        {analyticsData?.redemptionRate ?? 0}%
                      </span>
                      <div 
                        className="w-full h-1.5 rounded-full overflow-hidden mt-1.5"
                        style={{ backgroundColor: 'var(--color-bg)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, analyticsData?.redemptionRate ?? 0)}%`,
                            backgroundColor: 'var(--color-accent)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Points Activity Timeline Chart */}
                <div
                  className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
                  style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                  id="analytics-activity-chart-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider opacity-80">
                      {t('analytics.activityChartTitle')}
                    </h2>
                    {/* Chart Legend */}
                    <div className="flex items-center gap-4 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: 'var(--color-success-text)' }} />
                        <span className="opacity-75">{t('analytics.legendIssued')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: 'var(--color-error-text)' }} />
                        <span className="opacity-75">{t('analytics.legendRedeemed')}</span>
                      </div>
                    </div>
                  </div>

                  {!analyticsData?.dailyActivity || analyticsData.dailyActivity.length === 0 ? (
                    <p className="text-xs opacity-60 text-center py-10">
                      {t('analytics.emptyChart')}
                    </p>
                  ) : (
                    <div className="w-full overflow-x-auto pt-2 pb-1">
                      <div className="min-w-[320px]">
                        {(() => {
                          const items = analyticsData.dailyActivity;
                          const maxVal = Math.max(
                            ...items.map((d: any) => Math.max(d.pointsIssued, d.pointsRedeemed)),
                            10
                          );
                          const svgHeight = 120;
                          const barWidth = 10;
                          const gap = 6;
                          const groupWidth = barWidth * 2 + gap + 16;
                          const totalSvgWidth = Math.max(items.length * groupWidth, 320);

                          return (
                            <svg
                              viewBox={`0 0 ${totalSvgWidth} ${svgHeight + 30}`}
                              className="w-full h-44 overflow-visible"
                            >
                              {/* Grid background lines */}
                              <line
                                x1="0"
                                y1="10"
                                x2={totalSvgWidth}
                                y2="10"
                                stroke="currentColor"
                                strokeDasharray="3 3"
                                strokeOpacity="0.1"
                              />
                              <line
                                x1="0"
                                y1={svgHeight / 2}
                                x2={totalSvgWidth}
                                y2={svgHeight / 2}
                                stroke="currentColor"
                                strokeDasharray="3 3"
                                strokeOpacity="0.1"
                              />
                              <line
                                x1="0"
                                y1={svgHeight}
                                x2={totalSvgWidth}
                                y2={svgHeight}
                                stroke="currentColor"
                                strokeOpacity="0.2"
                              />

                              {/* Bars per day */}
                              {items.map((item: any, idx: number) => {
                                const xGroup = idx * groupWidth + 10;
                                const issuedH = Math.max(2, (item.pointsIssued / maxVal) * (svgHeight - 15));
                                const redeemedH = Math.max(2, (item.pointsRedeemed / maxVal) * (svgHeight - 15));

                                return (
                                  <g key={item.date} className="transition-opacity hover:opacity-80">
                                    {/* Issued bar */}
                                    <rect
                                      x={xGroup}
                                      y={svgHeight - issuedH}
                                      width={barWidth}
                                      height={issuedH}
                                      rx="3"
                                      className="fill-emerald-500 dark:fill-emerald-400"
                                    >
                                      <title>{`${item.date}: +${item.pointsIssued} ${t('analytics.legendIssued')}`}</title>
                                    </rect>

                                    {/* Redeemed bar */}
                                    <rect
                                      x={xGroup + barWidth + 3}
                                      y={svgHeight - redeemedH}
                                      width={barWidth}
                                      height={redeemedH}
                                      rx="3"
                                      className="fill-rose-500 dark:fill-rose-400"
                                    >
                                      <title>{`${item.date}: -${item.pointsRedeemed} ${t('analytics.legendRedeemed')}`}</title>
                                    </rect>

                                    {/* Date label */}
                                    <text
                                      x={xGroup + barWidth}
                                      y={svgHeight + 18}
                                      textAnchor="middle"
                                      fontSize="9"
                                      fill="currentColor"
                                      opacity="0.6"
                                    >
                                      {item.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Top 5 Redeemed Rewards */}
                <div
                  className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
                  style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                  id="analytics-top-items-card"
                >
                  <h2 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                    <Gift weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                    <span>{t('analytics.topItemsTitle')}</span>
                  </h2>

                  {!analyticsData?.topRedeemedItems || analyticsData.topRedeemedItems.length === 0 ? (
                    <p className="text-xs opacity-60 text-center py-6">
                      {t('analytics.emptyTopItems')}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {analyticsData.topRedeemedItems.map((item: any, idx: number) => {
                        const topCount = analyticsData.topRedeemedItems[0]?.count || 1;
                        const pct = Math.max(5, Math.round((item.count / topCount) * 100));

                        return (
                          <div
                            key={idx}
                            className="p-3.5 rounded-2xl border flex flex-col gap-2"
                            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span 
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{
                                    backgroundColor: idx === 0 ? 'var(--color-accent)' : 'var(--color-card-bg)',
                                    color: idx === 0 ? 'var(--color-btn-text)' : 'var(--color-text)',
                                    border: '1px solid var(--color-border)',
                                  }}
                                >
                                  {idx + 1}
                                </span>
                                <span className="font-bold truncate">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-right">
                                <span className="text-[11px] opacity-70">
                                  {t('analytics.redemptionsCount', { count: item.count })}
                                </span>
                                <span className="font-mono font-bold text-rose-500">
                                  -{item.points.toLocaleString()} pts
                                </span>
                              </div>
                            </div>

                            {/* Relative Popularity Bar */}
                            <div 
                              className="w-full h-1.5 rounded-full overflow-hidden"
                              style={{ backgroundColor: 'var(--color-card-bg)' }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: 'var(--color-accent)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 10: 15.13 & 15.14 المراجعة اليومية (Daily Review)
           ========================================================================= */}
        {activeTab === 'dailyReview' && (
          <div className="flex flex-col gap-4">
            {/* Header & Filter Card */}
            <div
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Receipt weight="light" className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                    <span>{t('admin.dailyReviewTitle')}</span>
                  </h2>
                  <p className="text-xs opacity-60 mt-0.5">{t('admin.dailyReviewDesc')}</p>
                </div>

                <button
                  type="button"
                  id="refresh-daily-review-btn"
                  onClick={() => businessId && loadDailyReview(businessId)}
                  disabled={isLoadingDailyReview}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  <CircleNotch weight="light" className={`w-3.5 h-3.5 ${isLoadingDailyReview ? 'animate-spin' : ''}`} />
                  <span>{t('common.refresh')}</span>
                </button>
              </div>

              {/* Filters: Date Picker + Today Shortcut + Flagged Only Toggle */}
              <div 
                className="p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <label htmlFor="daily-review-date-picker" className="font-bold opacity-80">{t('admin.reviewDate')}</label>
                  <input
                    type="date"
                    id="daily-review-date-picker"
                    value={dailyReviewDate}
                    onChange={(e) => {
                      setDailyReviewDate(e.target.value);
                      if (businessId) loadDailyReview(businessId, e.target.value, dailyReviewFlaggedOnly);
                    }}
                    className="py-1 px-2.5 rounded-xl border text-xs focus:outline-hidden"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      setDailyReviewDate(todayStr);
                      if (businessId) loadDailyReview(businessId, todayStr, dailyReviewFlaggedOnly);
                    }}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold border opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                  >
                    {t('admin.today')}
                  </button>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="filter-flagged-checkbox"
                    checked={dailyReviewFlaggedOnly}
                    onChange={(e) => {
                      setDailyReviewFlaggedOnly(e.target.checked);
                      if (businessId) loadDailyReview(businessId, dailyReviewDate, e.target.checked);
                    }}
                    className="w-4 h-4 rounded-md accent-[var(--color-accent)] cursor-pointer"
                  />
                  <span className="font-medium">{t('admin.filterFlagged')}</span>
                </label>
              </div>

              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  className="p-3.5 rounded-2xl border flex flex-col gap-1 shadow-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-70">{t('admin.totalIssuedToday')}</span>
                  <span className="text-base font-mono font-bold" style={{ color: 'var(--color-accent)' }}>
                    +{dailyReviewData?.summary?.totalPointsIssued?.toLocaleString() || 0}
                  </span>
                </div>

                <div
                  className="p-3.5 rounded-2xl border flex flex-col gap-1 shadow-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-70">{t('admin.totalRedeemedToday')}</span>
                  <span className="text-base font-mono font-bold text-rose-500">
                    -{dailyReviewData?.summary?.totalPointsRedeemed?.toLocaleString() || 0}
                  </span>
                </div>

                <div
                  className="p-3.5 rounded-2xl border flex flex-col gap-1 shadow-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-70">{t('admin.totalTxToday')}</span>
                  <span className="text-base font-mono font-bold">
                    {dailyReviewData?.summary?.totalTransactions || 0}
                  </span>
                </div>

                <div
                  className="p-3.5 rounded-2xl border flex flex-col gap-1 shadow-xs"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[11px] opacity-70">{t('admin.flaggedCount')}</span>
                  <span className={`text-base font-mono font-bold ${dailyReviewData?.summary?.flaggedCount > 0 ? 'text-rose-500' : ''}`}>
                    {dailyReviewData?.summary?.flaggedCount || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Phase 31.4: Anomalies Section ("عمليات تحتاج انتباه") */}
            {dailyReviewData?.anomalies && dailyReviewData.anomalies.length > 0 && (
              <div 
                className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
                style={{
                  backgroundColor: 'var(--color-card-bg)',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#D97706' }}
                    >
                      <ShieldWarning weight="light" className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold flex items-center gap-1.5">
                        <span>{t('admin.anomaliesTitle')}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          {dailyReviewData.anomalies.length}
                        </span>
                      </h3>
                      <p className="text-[11px] opacity-60">
                        {t('admin.anomaliesDesc')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {dailyReviewData.anomalies.map((anom: any) => (
                    <div
                      key={anom.id}
                      className="p-3.5 rounded-2xl border flex flex-col gap-2 transition-all"
                      style={{
                        backgroundColor: 'var(--color-bg)',
                        borderColor: anom.severity === 'high' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.3)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              anom.severity === 'high'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {anom.severity === 'high'
                              ? t('admin.anomalyHigh')
                              : t('admin.anomalyMedium')}
                          </span>

                          {anom.isAiGenerated ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                              <Sparkle weight="light" className="w-3 h-3" />
                              <span>{t('admin.anomalyAiBadge')}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border opacity-70" style={{ borderColor: 'var(--color-border)' }}>
                              {t('admin.anomalyRuleBadge')}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] opacity-60 font-mono">
                          {new Date(anom.transaction.createdAt).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Explanation text */}
                      <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--color-text)' }}>
                        {anom.explanation}
                      </p>

                      {/* Transaction details row */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t text-[11px] opacity-80 flex-wrap" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>
                            {t('admin.pointsCol')}:{' '}
                            <strong className="font-mono">{anom.transaction.pointsChange > 0 ? `+${anom.transaction.pointsChange}` : anom.transaction.pointsChange}</strong>
                          </span>
                          <span>
                            {t('admin.cashierCol')}:{' '}
                            <strong>{anom.transaction.cashierName}</strong>
                          </span>
                          {anom.transaction.invoiceReference && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}>
                              #{anom.transaction.invoiceReference}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`daily-tx-${anom.transactionId}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('ring-2', 'ring-[var(--color-accent)]');
                              setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--color-accent)]'), 2500);
                            }
                          }}
                          className="text-[11px] font-bold underline cursor-pointer hover:opacity-80"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {t('admin.anomalyJumpToTx')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transactions List */}
            <div
              className="p-5 rounded-3xl border shadow-sm flex flex-col gap-3"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">
                {t('auditLog.transactions')} ({dailyReviewData?.transactions?.length || 0})
              </h3>

              {isLoadingDailyReview ? (
                <div className="py-12 flex justify-center">
                  <CircleNotch weight="light" className="w-6 h-6 animate-spin" style={{ color: 'var(--color-accent)' }} />
                </div>
              ) : !dailyReviewData?.transactions || dailyReviewData.transactions.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-8">
                  {t('admin.noDailyTransactions')}
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {dailyReviewData.transactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      id={`daily-tx-${tx.id}`}
                      className="p-3.5 rounded-2xl border flex flex-col gap-2 transition-colors"
                      style={{
                        backgroundColor: tx.flaggedByOwner ? 'var(--color-error-bg)' : 'var(--color-bg)',
                        borderColor: tx.flaggedByOwner ? 'var(--color-error-border)' : 'var(--color-border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                            style={{
                              backgroundColor: 'var(--color-card-bg)',
                              color: tx.pointsChange > 0 ? 'var(--color-accent)' : 'rgb(244 63 94)',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {tx.pointsChange > 0 ? '+' : '-'}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold truncate">
                                {tx.customer?.name || tx.customer?.phoneNumber || 'عميل'}
                              </span>
                              {tx.customer?.phoneNumber && tx.customer?.name && (
                                <span className="text-[10px] opacity-60 font-mono">
                                  ({tx.customer.phoneNumber})
                                </span>
                              )}
                              {tx.invoiceReference && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                                  style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
                                >
                                  #{tx.invoiceReference}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] opacity-60">
                              {t('admin.cashierCol')}: {tx.cashier?.name || 'الكاشير'} • {tx.reason || ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className="font-mono font-bold text-xs"
                              style={{ color: tx.pointsChange > 0 ? 'var(--color-accent)' : 'rgb(244 63 94)' }}
                            >
                              {tx.pointsChange > 0 ? `+${tx.pointsChange}` : tx.pointsChange} pts
                            </span>
                            <span className="text-[10px] opacity-60 font-mono">
                              {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleFlag(tx)}
                            title={tx.flaggedByOwner ? t('admin.unflag') : t('admin.flagForReview')}
                            className="p-2 rounded-xl border transition-transform active:scale-95 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                            style={{
                              backgroundColor: 'var(--color-card-bg)',
                              borderColor: tx.flaggedByOwner ? 'var(--color-error-border)' : 'var(--color-border)',
                              color: tx.flaggedByOwner ? 'rgb(244 63 94)' : 'inherit',
                            }}
                          >
                            <Flag weight="light" className="w-3.5 h-3.5" fill={tx.flaggedByOwner ? 'currentColor' : 'none'} />
                            <span className="hidden sm:inline">
                              {tx.flaggedByOwner ? t('admin.unflag') : t('admin.flagForReview')}
                            </span>
                          </button>

                          {/* Phase 28.4: Reversal status badge or action button */}
                          {tx.isReversed && (
                            <span className="px-2 py-1 rounded-xl text-[10px] font-bold border bg-amber-500/10 text-amber-500 border-amber-500/30">
                              {isRtl ? 'معكوسة' : 'Reversed'}
                            </span>
                          )}
                          {tx.type === 'reversal' && (
                            <span className="px-2 py-1 rounded-xl text-[10px] font-bold border bg-purple-500/10 text-purple-400 border-purple-500/30">
                              {isRtl ? 'استرجاع' : 'Reversal'}
                            </span>
                          )}
                          {!tx.isReversed && tx.type !== 'reversal' && !tx.reversalOf && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingTx(tx);
                                setAdminReversalReason('');
                              }}
                              title={isRtl ? 'استرجاع العملية' : 'Reverse transaction'}
                              className="p-2 rounded-xl border transition-transform active:scale-95 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card-bg)', color: 'var(--color-accent)' }}
                            >
                              <ArrowCounterClockwise weight="light" className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{isRtl ? 'استرجاع' : 'Reverse'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* If flagged, show flag reason box */}
                      {tx.flaggedByOwner && (
                        <div
                          className="px-3 py-1.5 rounded-xl border text-[11px] flex items-center justify-between gap-2"
                          style={{
                            backgroundColor: 'var(--color-card-bg)',
                            borderColor: 'var(--color-error-border)',
                            color: 'var(--color-error-text)',
                          }}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Flag weight="light" className="w-3 h-3 shrink-0" fill="currentColor" />
                            <span className="font-medium truncate">
                              {tx.flagReason || t('admin.flagForReview')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleFlag(tx)}
                            className="text-[10px] underline shrink-0 font-bold opacity-80 hover:opacity-100 cursor-pointer"
                          >
                            {t('admin.unflag')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Flag Reason Modal */}
        {flagModalTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div 
              className="w-full max-w-md p-6 rounded-3xl border shadow-xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
              style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
                  >
                    <Flag weight="light" className="w-4 h-4 text-rose-500" />
                  </div>
                  <h3 className="font-bold text-sm">{t('admin.flagForReview')}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFlagModalTx(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center border opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <X weight="light" className="w-4 h-4" />
                </button>
              </div>

              <div 
                className="p-3 rounded-2xl border text-xs flex flex-col gap-1"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex justify-between">
                  <span className="opacity-60">{t('admin.customerCol')}:</span>
                  <span className="font-bold">{flagModalTx.customer?.name || flagModalTx.customer?.phoneNumber || 'عميل'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-60">{t('admin.pointsCol')}:</span>
                  <span className="font-mono font-bold">
                    {flagModalTx.pointsChange > 0 ? `+${flagModalTx.pointsChange}` : flagModalTx.pointsChange} pts
                  </span>
                </div>
                {flagModalTx.invoiceReference && (
                  <div className="flex justify-between">
                    <span className="opacity-60">{t('admin.invoiceCol')}:</span>
                    <span className="font-mono font-bold">{flagModalTx.invoiceReference}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmitFlag} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold">{t('admin.flagReason')}</label>
                  <textarea
                    rows={3}
                    id="flag-reason-input"
                    value={flagReasonInput}
                    onChange={(e) => setFlagReasonInput(e.target.value)}
                    placeholder={t('admin.flagReasonPlaceholder')}
                    className="py-2.5 px-3 rounded-xl text-xs border focus:outline-hidden resize-none"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setFlagModalTx(null)}
                    className="py-2 px-4 rounded-xl text-xs font-bold border opacity-80 hover:opacity-100 cursor-pointer"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    id="submit-flag-btn"
                    disabled={isSubmittingFlag}
                    className="py-2 px-5 rounded-xl text-xs font-bold transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
                  >
                    {isSubmittingFlag ? (
                      <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Flag weight="light" className="w-3.5 h-3.5" />
                    )}
                    <span>{t('admin.flagForReview')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
      {/* Phase 28: Admin Reversal Confirmation Modal */}
      {reversingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <form
            onSubmit={handleAdminReversal}
            className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl flex flex-col gap-4"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
              <ArrowCounterClockwise weight="light" className="w-5 h-5" />
              <span>{isRtl ? 'تأكيد استرجاع العملية' : 'Confirm Transaction Reversal'}</span>
            </div>

            <p className="text-xs opacity-80 leading-relaxed">
              {isRtl
                ? `سيتم إلغاء تأثير العملية (${reversingTx.pointsChange > 0 ? `+${reversingTx.pointsChange}` : reversingTx.pointsChange} نقطة) الخاصة بالعميل ${reversingTx.customer?.name || 'العميل'} وإعادة حساب الرصيد فوراً.`
                : `You are about to reverse this transaction (${reversingTx.pointsChange} pts).`}
            </p>

            <div>
              <label className="block text-xs font-semibold mb-1 opacity-80">
                {isRtl ? 'سبب الاسترجاع (اختياري)' : 'Reversal Reason (Optional)'}
              </label>
              <input
                type="text"
                value={adminReversalReason}
                onChange={(e) => setAdminReversalReason(e.target.value)}
                placeholder={isRtl ? 'مثال: مرتجع عميل / خطأ في الإدخال' : 'e.g. Return / cashier mistake'}
                className="w-full py-2 px-3 rounded-xl text-xs border focus:outline-hidden"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReversingTx(null)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmittingAdminReversal}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-btn-text)' }}
              >
                {isSubmittingAdminReversal ? <CircleNotch weight="light" className="w-3.5 h-3.5 animate-spin mx-auto" /> : (isRtl ? 'تأكيد الاسترجاع' : 'Confirm Reversal')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ──── ADMIN PROFILE MODAL WITH EDIT & OTP ──── */}
      <ProfileModal
        isOpen={showAdminProfile}
        onClose={() => {
          setShowAdminProfile(false);
          setShowAdminDeleteConfirm(false);
        }}
        jwtToken={jwtToken}
        initialData={{
          email: adminEmail,
          role: userRole,
          businessName: businessName,
        }}
        onProfileUpdated={(updated) => {
          if (updated.email) setAdminEmail(updated.email);
        }}
        extraInfo={
          <div className="space-y-2 mt-1">
            <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
              <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                <span className="text-[9px] opacity-60 block">{isRtl ? 'المنتجات' : 'Items'}</span>
                <strong className="font-bold">{menuItems.length}</strong>
              </div>
              <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                <span className="text-[9px] opacity-60 block">{isRtl ? 'العروض' : 'Offers'}</span>
                <strong className="font-bold">{offers.length}</strong>
              </div>
              <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                <span className="text-[9px] opacity-60 block">{isRtl ? 'العملاء' : 'Clients'}</span>
                <strong className="font-bold">{customers.length}</strong>
              </div>
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
            {deleteAdminError && (
              <div className="p-2.5 mb-3 rounded-xl border text-xs text-rose-400 bg-rose-500/10 border-rose-500/30 flex items-center gap-2">
                <WarningCircle weight="light" className="w-4 h-4 shrink-0" />
                <span>{deleteAdminError}</span>
              </div>
            )}

            {!showAdminDeleteConfirm ? (
              <>
                <div className="flex items-center gap-2 mb-1.5 text-rose-500">
                  <Warning weight="light" className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold">{t('accountDeletion.dangerZone')}</span>
                </div>
                <p className="text-[11px] opacity-75 mb-3 leading-relaxed">
                  {t('accountDeletion.confirmAdminDesc')}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAdminDeleteConfirm(true)}
                  id="admin-open-delete-btn"
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: '#EF4444' }}
                >
                  <Trash weight="light" className="w-3.5 h-3.5" />
                  <span>{t('accountDeletion.deleteAdminAccount')}</span>
                </button>
              </>
            ) : (
              <div className="text-center">
                <div
                  className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
                >
                  <Warning weight="light" className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-bold text-rose-500 mb-1">
                  {isRtl ? 'تأكيد حذف الحساب الإداري' : 'Confirm Manager Account Deletion'}
                </h3>
                <p className="text-[11px] opacity-75 mb-3 leading-relaxed">
                  {t('accountDeletion.confirmAdminDesc')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminDeleteConfirm(false)}
                    disabled={isDeletingAdmin}
                    className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {t('accountDeletion.cancelButton')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAdminAccount}
                    id="admin-confirm-delete-btn"
                    disabled={isDeletingAdmin}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: '#EF4444' }}
                  >
                    {isDeletingAdmin ? (
                      <>
                        <CircleNotch weight="light" className="w-3 h-3 animate-spin" />
                        <span>{t('accountDeletion.deleting')}</span>
                      </>
                    ) : (
                      <>
                        <Trash weight="light" className="w-3 h-3" />
                        <span>{t('accountDeletion.deleteButton')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      />
    </main>
  );
}
