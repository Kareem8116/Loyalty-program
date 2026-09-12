'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { User, Trash, Warning, X, CaretRight, LockKey, LockKeyOpen, ShieldCheck, ArrowsClockwise, Plus, SignOut } from '@phosphor-icons/react';
import { validateEgyptianPhone, validatePin } from '@/lib/validation';
import { setClientRoleCookie, clearClientRoleCookie } from '@/lib/cookies';
import ProfileModal from '@/components/ProfileModal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

interface PlaceCard {
  linkId: string;
  customerId: string;
  businessId: string;
  businessName: string;
  subdomain: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  hasPIN: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
}

interface UnlockedPlace {
  id: string;
  name: string;
  phoneNumber: string;
  qrToken: string;
  pointsBalance: number;
}

type ModalType = 'verify-pin' | 'set-pin' | 'forgot-pin' | 'link-phone' | null;

// ──────────────────────────────────────────
// Helper: get auth token
// ──────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function apiCall(endpoint: string, body: object) {
  const token = await getToken();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function normalizeDigits(str: string): string {
  return str
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/\D/g, '');
}

// ──────────────────────────────────────────
// PIN Dots component
// ──────────────────────────────────────────

function PinDots({ value }: { value: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '1rem 0' }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: i < value.length
              ? 'var(--color-accent)'
              : 'rgba(125,125,125,0.2)',
            border: '2px solid var(--color-border)',
            transition: 'all 0.2s ease',
            transform: i < value.length ? 'scale(1.2)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────
// Place Card
// ──────────────────────────────────────────

function PlaceCardUI({
  place,
  onAction,
}: {
  place: PlaceCard;
  onAction: (place: PlaceCard, type: ModalType) => void;
}) {
  const isLocked = place.isLocked;
  const hasPIN = place.hasPIN;

  const statusLabel = isLocked ? 'مقفول' : hasPIN ? 'محمي' : 'بدون رمز سري';
  const statusColor = isLocked ? '#ff6b6b' : hasPIN ? '#4ECDC4' : '#ffd93d';

  const actionLabel = isLocked
    ? 'مقفول مؤقتاً'
    : !hasPIN
    ? 'تعيين الرمز السري'
    : 'ادخل الرمز السري';

  const handleClick = () => {
    if (isLocked) return;
    onAction(place, hasPIN ? 'verify-pin' : 'set-pin');
  };

  return (
    <div
      className="mp-card"
      style={{
        '--primary': place.primaryColor,
        '--secondary': place.secondaryColor,
      } as React.CSSProperties}
    >
      <div className="mp-card-shine" />

      <div className="mp-card-header">
        <div className="mp-card-logo">
          {place.logoUrl ? (
            <img src={place.logoUrl} alt={place.businessName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
          ) : (
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
              {place.businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="mp-card-info">
          <h3 className="mp-card-name">{place.businessName}</h3>
          <span className="mp-card-status" style={{ color: statusColor }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
              marginLeft: '6px',
              verticalAlign: 'middle',
            }} />
            {statusLabel}
          </span>
        </div>
        <div className={`mp-card-lock ${isLocked ? 'locked' : ''}`}>
          {isLocked ? '🔒' : hasPIN ? '🛡️' : '🔓'}
        </div>
      </div>

      {isLocked && place.lockedUntil && (
        <div className="mp-card-lockinfo">
          مقفول حتى {new Date(place.lockedUntil).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      <div className="mp-card-actions">
        <button
          className="mp-card-btn"
          onClick={handleClick}
          disabled={isLocked}
          id={`place-action-${place.linkId}`}
        >
          {actionLabel}
        </button>
        {!isLocked && hasPIN && (
          <button
            className="mp-card-btn-ghost"
            onClick={() => onAction(place, 'forgot-pin')}
            id={`place-forgot-${place.linkId}`}
          >
            نسيت الرمز؟
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Unlocked Customer View
// ──────────────────────────────────────────

function UnlockedView({
  place,
  customer,
  onBack,
}: {
  place: PlaceCard;
  customer: UnlockedPlace;
  onBack: () => void;
}) {
  return (
    <div className="mp-unlocked">
      <button className="mp-back-btn" onClick={onBack} id="unlocked-back-btn">
        ← الرجوع لاماكني
      </button>

      <div className="mp-unlocked-card">
        <div className="mp-unlocked-header" style={{ background: `linear-gradient(135deg, ${place.primaryColor}, ${place.secondaryColor})` }}>
          <div className="mp-unlocked-logo">
            {place.logoUrl ? (
              <img src={place.logoUrl} alt={place.businessName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
            ) : (
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>
                {place.businessName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <h2 style={{ color: '#fff', fontWeight: 700, fontSize: '1.25rem', margin: '0.75rem 0 0.25rem' }}>
            {place.businessName}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
            {customer.name}
          </p>
        </div>

        <div className="mp-unlocked-body">
          <div className="mp-points-display">
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>رصيد النقاط</p>
            <p className="mp-points-number">{customer.pointsBalance.toLocaleString('ar-EG')}</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>نقطة</p>
          </div>

          <div className="mp-qr-container">
            <div className="mp-qr-box">
              <div style={{ fontSize: '3rem', margin: '1rem 0' }}>
                <svg viewBox="0 0 100 100" width="120" height="120" style={{ filter: 'invert(1)' }}>
                  {/* QR placeholder pattern */}
                  <rect x="10" y="10" width="30" height="30" fill="#000" rx="3"/>
                  <rect x="60" y="10" width="30" height="30" fill="#000" rx="3"/>
                  <rect x="10" y="60" width="30" height="30" fill="#000" rx="3"/>
                  <rect x="15" y="15" width="20" height="20" fill="#fff" rx="2"/>
                  <rect x="65" y="15" width="20" height="20" fill="#fff" rx="2"/>
                  <rect x="15" y="65" width="20" height="20" fill="#fff" rx="2"/>
                  <rect x="20" y="20" width="10" height="10" fill="#000" rx="1"/>
                  <rect x="70" y="20" width="10" height="10" fill="#000" rx="1"/>
                  <rect x="20" y="70" width="10" height="10" fill="#000" rx="1"/>
                  {/* Center data */}
                  <rect x="60" y="50" width="8" height="8" fill="#000"/>
                  <rect x="72" y="50" width="8" height="8" fill="#000"/>
                  <rect x="50" y="60" width="8" height="8" fill="#000"/>
                  <rect x="50" y="72" width="8" height="8" fill="#000"/>
                  <rect x="62" y="62" width="8" height="8" fill="#000"/>
                  <rect x="74" y="74" width="8" height="8" fill="#000"/>
                </svg>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.12em' }}>
                {customer.qrToken.length === 9
                  ? `${customer.qrToken.slice(0, 3)}-${customer.qrToken.slice(3, 6)}-${customer.qrToken.slice(6, 9)}`.toUpperCase()
                  : customer.qrToken.toUpperCase()}
              </p>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              اعرض هذا الرمز للكاشير لجمع أو استبدال النقاط
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────

export default function MyPlacesPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<PlaceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [jwtToken, setJwtToken] = useState<string | null>(null);

  // Modals
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceCard | null>(null);
  const [unlockedCustomer, setUnlockedCustomer] = useState<UnlockedPlace | null>(null);

  // PIN entry state
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [applyToAll, setApplyToAll] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Forgot PIN state
  const [forgotStep, setForgotStep] = useState<'send' | 'verify'>('send');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Link phone state
  const [linkPhone, setLinkPhone] = useState('');
  const [linkBusiness, setLinkBusiness] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState('');
  const [allBusinesses, setAllBusinesses] = useState<Array<{ id: string; name: string }>>([]);

  // Profile & Delete Account state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
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
        throw new Error(data.error || 'فشل حذف الحساب');
      }
      await supabase.auth.signOut();
      clearClientRoleCookie();
      router.push('/');
    } catch (err: any) {
      setDeleteError(err.message || 'حدث خطأ أثناء محاولة حذف الحساب');
    } finally {
      setIsDeleting(false);
    }
  };

  // Auth guard: strictly for Customers (no staff roles)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setClientRoleCookie('customer');
      setUserEmail(session.user.email || '');
      setJwtToken(session.access_token);
      loadPlaces(session.access_token);
      loadBusinesses();
    });
  }, [router]);

  const loadPlaces = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customer/my-places', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlaces(data.places || []);
      } else {
        setError('فشل تحميل الاماكن');
      }
    } catch {
      setError('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  const loadBusinesses = async () => {
    try {
      const res = await fetch('/api/super-admin/businesses');
      if (res.ok) {
        const data = await res.json();
        setAllBusinesses((data.businesses || []).map((b: any) => ({ id: b.id, name: b.name })));
      }
    } catch { /* non-critical */ }
  };

  const refreshPlaces = useCallback(async () => {
    const token = await getToken();
    if (token) await loadPlaces(token);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearClientRoleCookie();
    router.push('/login');
  };

  // ─── Open modal ───
  const openModal = (place: PlaceCard, type: ModalType) => {
    setSelectedPlace(place);
    setActiveModal(type);
    setPin('');
    setConfirmPin('');
    setPinStep('enter');
    setApplyToAll(false);
    setPinError('');
    setForgotStep('send');
    setOtp('');
    setNewPin('');
    setForgotError('');
    setLinkPhone('');
    setLinkBusiness('');
    setLinkError('');
    setLinkSuccess('');
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedPlace(null);
  };

  // ─── Verify PIN ───
  const handleVerifyPin = async (overridePin?: string) => {
    if (!selectedPlace) return;
    const pinToUse = overridePin ?? pin;
    const pinVal = validatePin(pinToUse);
    if (!pinVal.isValid) {
      setPinError(pinVal.errorMessage || 'الرمز السري (PIN) يجب أن يكون 4 أرقام بالضبط');
      return;
    }
    setPinLoading(true);
    setPinError('');
    try {
      const data = await apiCall('/api/customer/places/verify-pin', {
        linkId: selectedPlace.linkId,
        pin: pinToUse,
      });

      if (data.success) {
        setUnlockedCustomer(data.customer);
        closeModal();
        const targetQrToken = data.customer?.qrToken || (selectedPlace as any)?.qrToken;
        if (targetQrToken) {
          router.push(`/card/${targetQrToken}`);
          return;
        }
        await refreshPlaces();
      } else if (data.error === 'LOCKED') {
        setPinError('الوصول مقفول مؤقتاً. يرجى المحاولة لاحقاً.');
        await refreshPlaces();
      } else if (data.error === 'WRONG_PIN') {
        const remaining = data.remainingAttempts ?? '?';
        setPinError(`الرمز السري غلط. ${remaining} محاولات متبقية.`);
      } else {
        setPinError(data.message || 'حدث خطأ. يرجى المحاولة مرة أخرى.');
      }
    } catch {
      setPinError('حدث خطأ. يرجى المحاولة مرة أخرى.');
    } finally {
      setPinLoading(false);
    }
  };

  // ─── Set PIN ───
  const handleSetPin = async (overrideVal?: string) => {
    if (!selectedPlace) return;
    if (pinStep === 'enter') {
      const pinToUse = overrideVal ?? pin;
      const pinVal = validatePin(pinToUse);
      if (!pinVal.isValid) {
        setPinError(pinVal.errorMessage || 'الرمز السري (PIN) يجب أن يكون 4 أرقام بالضبط');
        return;
      }
      setPin(pinToUse);
      setPinStep('confirm');
      setConfirmPin('');
      return;
    }

    // confirm step
    const confirmToUse = overrideVal ?? confirmPin;
    if (pin !== confirmToUse) {
      setPinError('الرمزان السريان غير متطابقان. يرجى المحاولة مرة أخرى.');
      setConfirmPin('');
      return;
    }

    setPinLoading(true);
    setPinError('');
    try {
      const data = await apiCall('/api/customer/places/set-pin', {
        linkId: selectedPlace.linkId,
        pin,
        applyToAllPlaces: applyToAll,
      });

      if (data.success) {
        closeModal();
        const targetQrToken = data.customer?.qrToken || (selectedPlace as any)?.qrToken;
        if (targetQrToken) {
          router.push(`/card/${targetQrToken}`);
          return;
        }
        await refreshPlaces();
      } else {
        setPinError('فشل تعيين الرمز السري. يرجى المحاولة مرة أخرى.');
      }
    } catch {
      setPinError('حدث خطأ. يرجى المحاولة مرة أخرى.');
    } finally {
      setPinLoading(false);
    }
  };

  // ─── Forgot PIN ───
  const handleForgotPin = async () => {
    if (!selectedPlace) return;
    setForgotLoading(true);
    setForgotError('');

    if (forgotStep === 'send') {
      try {
        const data = await apiCall('/api/customer/places/forgot-pin', {
          action: 'send_otp',
          linkId: selectedPlace.linkId,
        });
        if (data.success) {
          setForgotStep('verify');
        } else if (data.error === 'TOO_MANY_REQUESTS') {
          setForgotError('عدد كبير من الطلبات. يرجى الانتظار قبل المحاولة مرة أخرى.');
        } else {
          setForgotError('فشل إرسال الرمز. يرجى المحاولة مرة أخرى.');
        }
      } catch {
        setForgotError('حدث خطأ. يرجى المحاولة مرة أخرى.');
      } finally {
        setForgotLoading(false);
      }
    } else {
      // verify step
      if (!otp || otp.length !== 6 || !newPin || newPin.length !== 4) {
        setForgotError('يرجى ادخال رمز التحقق (6 ارقام) والرمز السري الجديد (4 ارقام).');
        setForgotLoading(false);
        return;
      }
      try {
        const data = await apiCall('/api/customer/places/forgot-pin', {
          action: 'verify_and_reset',
          linkId: selectedPlace.linkId,
          otp,
          newPin,
        });
        if (data.success) {
          closeModal();
          const targetQrToken = data.customer?.qrToken || (selectedPlace as any)?.qrToken;
          if (targetQrToken) {
            router.push(`/card/${targetQrToken}`);
            return;
          }
          await refreshPlaces();
        } else if (data.error === 'INVALID_OTP') {
          setForgotError('رمز التحقق غير صحيح أو منتهي الصلاحية.');
        } else {
          setForgotError('فشل إعادة تعيين الرمز السري.');
        }
      } catch {
        setForgotError('حدث خطأ. يرجى المحاولة مرة أخرى.');
      } finally {
        setForgotLoading(false);
      }
    }
  };

  // ─── Link phone ───
  const handleLinkPhone = async () => {
    if (!linkBusiness) {
      setLinkError('يرجى اختيار المتجر أولاً');
      return;
    }
    const phoneVal = validateEgyptianPhone(linkPhone);
    if (!phoneVal.isValid) {
      setLinkError(phoneVal.errorMessage || 'رقم هاتف غير صالح');
      return;
    }
    setLinkLoading(true);
    setLinkError('');
    setLinkSuccess('');
    try {
      const data = await apiCall('/api/customer/places/link-phone', {
        businessId: linkBusiness,
        phoneNumber: phoneVal.cleanPhone,
      });
      if (data.success) {
        setLinkSuccess('تم ربط المكان بحسابك بنجاح.');
        await refreshPlaces();
      } else if (data.error === 'NOT_FOUND') {
        setLinkError('لم يتم العثور على عميل بهذا الرقم في المتجر المختار.');
      } else if (data.error === 'ALREADY_LINKED') {
        setLinkError('هذا المكان مرتبط بحسابك بالفعل.');
      } else {
        setLinkError('فشل ربط المكان. يرجى المحاولة مرة أخرى.');
      }
    } catch {
      setLinkError('حدث خطأ. يرجى المحاولة مرة أخرى.');
    } finally {
      setLinkLoading(false);
    }
  };

  // ─── Keyboard PIN entry ───
  const handlePinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, target: string, setter: (v: string) => void) => {
    if (e.key === 'Backspace') {
      setter(target.slice(0, -1));
    } else if (/^\d$/.test(e.key) && target.length < 4) {
      setter(target + e.key);
    }
  };

  // ─── Render ───

  if (unlockedCustomer && selectedPlace) {
    return (
      <>
        <style>{mpStyles}</style>
        <div className="mp-root">
          <UnlockedView
            place={selectedPlace}
            customer={unlockedCustomer}
            onBack={() => {
              setUnlockedCustomer(null);
              setSelectedPlace(null);
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{mpStyles}</style>

      <div className="mp-root">
        {/* Header */}
        <header className="mp-header">
          <div className="mp-header-brand">
            <span className="mp-header-logo">★</span>
            <span className="mp-header-title">اماكني</span>
          </div>
          <div className="mp-header-right">
            <button
              className="mp-profile-btn"
              onClick={() => {
                setShowProfileModal(true);
                setShowDeleteConfirm(false);
                setDeleteError('');
              }}
              id="customer-profile-btn"
              title="الملف الشخصي"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <User style={{ width: '17px', height: '17px' }} />
            </button>
            <button
              className="mp-link-btn"
              onClick={() => openModal({ linkId: '', customerId: '', businessId: '', businessName: '', subdomain: '', logoUrl: null, primaryColor: '#6C63FF', secondaryColor: '#4ECDC4', hasPIN: false, isLocked: false, lockedUntil: null, failedAttempts: 0 }, 'link-phone')}
              id="open-link-phone-btn"
            >
              + ربط مكان
            </button>
            <button className="mp-logout-btn" onClick={handleLogout} id="mp-logout-btn">
              خروج
            </button>
          </div>
        </header>

        <main className="mp-main">
          <div className="mp-welcome">
            <h1 className="mp-welcome-title">اماكني</h1>
            <p className="mp-welcome-sub">
              {userEmail && <span style={{ color: 'rgba(255,255,255,0.5)' }}>{userEmail}</span>}
            </p>
            <p className="mp-welcome-hint">اضغط على مكان للوصول لنقاطك ومكافاتك</p>
          </div>

          {loading ? (
            <div className="mp-loading">
              <div className="mp-spinner" />
              <p>جاري التحميل...</p>
            </div>
          ) : error ? (
            <div className="mp-error">{error}</div>
          ) : places.length === 0 ? (
            <div className="mp-empty">
              <div className="mp-empty-icon">🏪</div>
              <h3>لا توجد اماكن مرتبطة بحسابك</h3>
              <p>قم بزيارة أي متجر واطلب من الكاشير تسجيلك في Pointat.</p>
              <button
                className="mp-link-phone-cta"
                onClick={() => openModal({ linkId: '', customerId: '', businessId: '', businessName: '', subdomain: '', logoUrl: null, primaryColor: '#6C63FF', secondaryColor: '#4ECDC4', hasPIN: false, isLocked: false, lockedUntil: null, failedAttempts: 0 }, 'link-phone')}
                id="empty-link-phone-btn"
              >
                ربط مكان عبر التليفون
              </button>
            </div>
          ) : (
            <div className="mp-grid">
              {places.map(place => (
                <PlaceCardUI key={place.linkId} place={place} onAction={openModal} />
              ))}
            </div>
          )}
        </main>

        {/* ──── MODALS ──── */}

        {/* ──── CUSTOMER PROFILE MODAL WITH EDIT & OTP ──── */}
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => {
            setShowProfileModal(false);
            setShowDeleteConfirm(false);
          }}
          jwtToken={jwtToken}
          initialData={{
            email: userEmail,
            role: 'customer',
          }}
          onProfileUpdated={(updated) => {
            if (updated.email) setUserEmail(updated.email);
            if (jwtToken) loadPlaces(jwtToken);
          }}
          extraInfo={
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>الأماكن والبطاقات المرتبطة</span>
              <strong style={{ fontSize: '13px', color: '#4ECDC4' }}>{places.length} متجر / فرع مسجل</strong>
            </div>
          }
          dangerZone={
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#f87171', display: 'block', marginBottom: '8px' }}>
                منطقة الخطر
              </span>

              {deleteError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '12px', padding: '10px', fontSize: '12px', marginBottom: '14px' }}>
                  {deleteError}
                </div>
              )}

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  id="trigger-delete-customer-btn"
                  style={{
                    width: '100%',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171',
                    padding: '12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Trash size={16} weight="light" />
                  <span>حذف حسابي بالكامل</span>
                </button>
              ) : (
                <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '14px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-error-text)', marginBottom: '8px' }}>
                    <Warning size={18} weight="light" style={{ flexShrink: 0 }} />
                    <strong style={{ fontSize: '13px' }}>تأكيد حذف الحساب نهائياً</strong>
                  </div>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: '14px' }}>
                    هل أنت متأكد من حذف حسابك المركزي نهائياً؟ سيتم مسح كافة بطاقاتك ونقاطك وروابط متاجرك ولا يمكن التراجع عن هذه الخطوة.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                      id="confirm-delete-customer-btn"
                      style={{
                        flex: 1,
                        background: '#ef4444',
                        border: 'none',
                        color: '#fff',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      {isDeleting ? 'جاري الحذف...' : 'نعم، احذف الحساب'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      إلغاء وتراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Overlay */}
        {activeModal && (
          <div className="mp-overlay" onClick={closeModal}>
            <div
              className="mp-modal"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              {/* Verify PIN modal */}
              {activeModal === 'verify-pin' && selectedPlace && (
                <>
                  <h2 className="mp-modal-title">ادخل الرمز السري</h2>
                  <p className="mp-modal-sub">ادخل الرمز السري المكون من 4 ارقام للوصول الى نقاطك في <strong>{selectedPlace.businessName}</strong></p>

                  <PinDots value={pin} />

                  <input
                    id="pin-verify-input"
                    className="mp-pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={e => {
                      const v = normalizeDigits(e.target.value).slice(0, 4);
                      setPin(v);
                      // Auto-submit when 4 digits entered
                      if (v.length === 4 && !pinLoading) {
                        handleVerifyPin(v);
                      }
                    }}
                    placeholder="• • • •"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter' && pin.length === 4 && !pinLoading) {
                        handleVerifyPin();
                      }
                    }}
                  />

                  {pinError && <div className="mp-modal-error">{pinError}</div>}

                  <div className="mp-modal-actions">
                    <button
                      id="pin-verify-submit"
                      className="mp-modal-btn"
                      onClick={() => handleVerifyPin()}
                      disabled={pin.length !== 4 || pinLoading}
                    >
                      {pinLoading ? 'جاري التحقق...' : 'تحقق'}
                    </button>
                    <button className="mp-modal-btn-ghost" onClick={closeModal}>الغاء</button>
                  </div>

                  <button
                    className="mp-forgot-link"
                    onClick={() => {
                      setPin('');
                      setPinError('');
                      setActiveModal('forgot-pin');
                      setForgotStep('send');
                    }}
                    id="open-forgot-pin"
                  >
                    نسيت الرمز السري؟
                  </button>
                </>
              )}

              {/* Set PIN modal */}
              {activeModal === 'set-pin' && selectedPlace && (
                <>
                  <h2 className="mp-modal-title">
                    {pinStep === 'enter' ? 'تعيين الرمز السري' : 'تاكيد الرمز السري'}
                  </h2>
                  <p className="mp-modal-sub">
                    {pinStep === 'enter'
                      ? `انشئ رمز سري مكون من 4 ارقام لتامين دخولك في ${selectedPlace.businessName}`
                      : 'ادخل نفس الرمز السري مرة أخرى للتاكيد'
                    }
                  </p>

                  <PinDots value={pinStep === 'enter' ? pin : confirmPin} />

                  <input
                    id={pinStep === 'enter' ? 'pin-set-input' : 'pin-confirm-input'}
                    className="mp-pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinStep === 'enter' ? pin : confirmPin}
                    onChange={e => {
                      const v = normalizeDigits(e.target.value).slice(0, 4);
                      if (pinStep === 'enter') {
                        setPin(v);
                        if (v.length === 4 && !pinLoading) {
                          handleSetPin(v);
                        }
                      } else {
                        setConfirmPin(v);
                        if (v.length === 4 && !pinLoading) {
                          handleSetPin(v);
                        }
                      }
                    }}
                    placeholder="• • • •"
                    autoFocus
                  />

                  {pinStep === 'enter' && (
                    <label className="mp-check-label">
                      <input
                        type="checkbox"
                        checked={applyToAll}
                        onChange={e => setApplyToAll(e.target.checked)}
                        id="apply-to-all-checkbox"
                      />
                      <span>استخدم نفس الرمز السري لكل اماكني</span>
                    </label>
                  )}

                  {pinError && <div className="mp-modal-error">{pinError}</div>}

                  <div className="mp-modal-actions">
                    <button
                      id="pin-set-submit"
                      className="mp-modal-btn"
                      onClick={() => handleSetPin()}
                      disabled={(pinStep === 'enter' ? pin.length !== 4 : confirmPin.length !== 4) || pinLoading}
                    >
                      {pinLoading
                        ? 'جاري الحفظ...'
                        : pinStep === 'enter'
                        ? 'التالي'
                        : 'تعيين الرمز السري'
                      }
                    </button>
                    <button
                      className="mp-modal-btn-ghost"
                      onClick={() => {
                        if (pinStep === 'confirm') {
                          setPinStep('enter');
                          setConfirmPin('');
                          setPinError('');
                        } else {
                          closeModal();
                        }
                      }}
                    >
                      {pinStep === 'confirm' ? 'رجوع' : 'الغاء'}
                    </button>
                  </div>
                </>
              )}

              {/* Forgot PIN modal */}
              {activeModal === 'forgot-pin' && selectedPlace && (
                <>
                  <h2 className="mp-modal-title">استعادة الرمز السري</h2>
                  <p className="mp-modal-sub">
                    {forgotStep === 'send'
                      ? `سنرسل رمز مكون من 6 ارقام على بريدك الالكتروني لاستعادة الرمز السري في ${selectedPlace.businessName}`
                      : 'ادخل رمز التحقق الذي وصلك على بريدك والرمز السري الجديد'
                    }
                  </p>

                  {forgotStep === 'verify' && (
                    <>
                      <div className="mp-modal-field">
                        <label className="mp-modal-label">رمز التحقق (6 ارقام)</label>
                        <input
                          id="forgot-otp-input"
                          className="mp-modal-input"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={e => setOtp(normalizeDigits(e.target.value).slice(0, 6))}
                          placeholder="000000"
                          dir="ltr"
                        />
                      </div>
                      <div className="mp-modal-field">
                        <label className="mp-modal-label">الرمز السري الجديد (4 ارقام)</label>
                        <input
                          id="forgot-newpin-input"
                          className="mp-modal-input"
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={newPin}
                          onChange={e => setNewPin(normalizeDigits(e.target.value).slice(0, 4))}
                          placeholder="• • • •"
                        />
                      </div>
                    </>
                  )}

                  {forgotError && <div className="mp-modal-error">{forgotError}</div>}

                  <div className="mp-modal-actions">
                    <button
                      id="forgot-pin-submit"
                      className="mp-modal-btn"
                      onClick={handleForgotPin}
                      disabled={forgotLoading || (forgotStep === 'verify' && (otp.length !== 6 || newPin.length !== 4))}
                    >
                      {forgotLoading
                        ? 'جاري...'
                        : forgotStep === 'send'
                        ? 'ارسال الرمز'
                        : 'تحقق واعادة التعيين'
                      }
                    </button>
                    <button className="mp-modal-btn-ghost" onClick={closeModal}>الغاء</button>
                  </div>
                </>
              )}

              {/* Link Phone modal */}
              {activeModal === 'link-phone' && (
                <>
                  <h2 className="mp-modal-title">ربط مكان عبر التليفون</h2>
                  <p className="mp-modal-sub">ادخل رقم تليفونك لربط مكان أنشأه الكاشير بحسابك</p>

                  {linkSuccess ? (
                    <div className="mp-modal-success">{linkSuccess}</div>
                  ) : (
                    <>
                      <div className="mp-modal-field">
                        <label className="mp-modal-label">اختر المتجر</label>
                        <select
                          id="link-phone-business"
                          className="mp-modal-input"
                          value={linkBusiness}
                          onChange={e => setLinkBusiness(e.target.value)}
                        >
                          <option value="">-- اختر المتجر --</option>
                          {allBusinesses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mp-modal-field">
                        <label className="mp-modal-label">رقم التليفون</label>
                        <input
                          id="link-phone-input"
                          className="mp-modal-input"
                          type="tel"
                          inputMode="numeric"
                          maxLength={11}
                          value={linkPhone}
                          onChange={e => setLinkPhone(normalizeDigits(e.target.value).slice(0, 11))}
                          placeholder="01XXXXXXXXX"
                          dir="ltr"
                        />
                        {linkPhone.trim() !== '' && !validateEgyptianPhone(linkPhone).isValid && (
                          <p style={{ color: '#ff6b6b', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                            {validateEgyptianPhone(linkPhone).errorMessage}
                          </p>
                        )}
                      </div>

                      {linkError && <div className="mp-modal-error">{linkError}</div>}

                      <div className="mp-modal-actions">
                        <button
                          id="link-phone-submit"
                          className="mp-modal-btn"
                          onClick={handleLinkPhone}
                          disabled={linkLoading || !linkPhone || linkPhone.length !== 11 || !linkBusiness}
                        >
                          {linkLoading ? 'جاري الربط...' : 'ربط المكان'}
                        </button>
                        <button className="mp-modal-btn-ghost" onClick={closeModal}>الغاء</button>
                      </div>
                    </>
                  )}
                  {linkSuccess && (
                    <button className="mp-modal-btn" onClick={closeModal} style={{ width: '100%', marginTop: '1rem' }}>
                      اغلاق
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────
// Styles
// ──────────────────────────────────────────

const mpStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .mp-root {
    min-height: 100vh;
    background: var(--page-bg-gradient);
    font-family: 'Inter', sans-serif;
    direction: rtl;
    color: var(--color-text);
    position: relative;
    overflow-x: hidden;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* Header */
  .mp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: var(--color-header-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 0.5px solid var(--color-separator);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .mp-header-brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .mp-header-logo {
    width: 36px;
    height: 36px;
    background: var(--color-accent);
    color: var(--color-accent-text);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 800;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .mp-header-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .mp-header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .mp-link-btn {
    padding: 0.5rem 1rem;
    background: var(--color-accent);
    border: none;
    border-radius: 12px;
    color: var(--color-accent-text);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .mp-link-btn:hover { opacity: 0.9; transform: translateY(-1px); }

  .mp-logout-btn {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .mp-logout-btn:hover { border-color: var(--color-text); color: var(--color-text); }

  /* Main */
  .mp-main { padding: 2rem 1.5rem; max-width: 900px; margin: 0 auto; }

  .mp-welcome { margin-bottom: 2rem; }
  .mp-welcome-title { font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem; color: var(--color-text); }
  .mp-welcome-hint { color: var(--color-text-muted); font-size: 0.9rem; margin-top: 0.5rem; }

  /* Grid */
  .mp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  /* Place card */
  .mp-card {
    background: var(--color-card-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    padding: 1.5rem;
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    animation: cardIn 0.4s ease-out;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .mp-card:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,0,0,0.08); border-color: var(--color-border); }

  .mp-card-shine {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: var(--color-accent);
    border-radius: 20px 20px 0 0;
  }

  .mp-card-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .mp-card-logo {
    width: 48px;
    height: 48px;
    background: var(--color-accent);
    color: var(--color-accent-text);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .mp-card-info { flex: 1; }
  .mp-card-name { font-size: 1rem; font-weight: 700; margin-bottom: 0.25rem; color: var(--color-text); }
  .mp-card-status { font-size: 0.8rem; font-weight: 500; }

  .mp-card-lock {
    font-size: 1.25rem;
    opacity: 0.8;
    transition: all 0.3s;
  }
  .mp-card-lock.locked { animation: shake 0.5s ease; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  .mp-card-lockinfo {
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    border-radius: 12px;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: var(--color-error-text);
    margin-bottom: 1rem;
    text-align: center;
  }

  .mp-card-actions { display: flex; flex-direction: column; gap: 0.5rem; }

  .mp-card-btn {
    width: 100%;
    padding: 0.75rem;
    background: var(--color-accent);
    border: none;
    border-radius: 12px;
    color: var(--color-accent-text);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .mp-card-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
  .mp-card-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .mp-card-btn-ghost {
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .mp-card-btn-ghost:hover { border-color: var(--color-text); color: var(--color-text); }

  /* Loading / Error / Empty */
  .mp-loading, .mp-error, .mp-empty {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--color-text-muted);
  }
  .mp-error { color: var(--color-error-text); }
  .mp-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(125,125,125,0.2);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .mp-empty-icon { font-size: 3rem; margin-bottom: 1rem; }
  .mp-empty h3 { font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--color-text); }

  .mp-link-phone-cta {
    margin-top: 1.5rem;
    padding: 0.75rem 2rem;
    background: var(--color-accent);
    border: none;
    border-radius: 14px;
    color: var(--color-accent-text);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .mp-link-phone-cta:hover { opacity: 0.9; transform: translateY(-2px); }

  /* Overlay & Modal */
  .mp-overlay {
    position: fixed;
    inset: 0;
    background: var(--color-overlay-bg);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .mp-modal {
    background: var(--color-card-bg);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    padding: 2rem;
    width: 100%;
    max-width: 380px;
    color: var(--color-text);
    animation: modalIn 0.3s ease-out;
    position: relative;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  }
  @keyframes modalIn {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .mp-modal-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; text-align: center; color: var(--color-text); }
  .mp-modal-sub { color: var(--color-text-muted); font-size: 0.875rem; text-align: center; margin-bottom: 1.25rem; line-height: 1.5; }

  .mp-modal-field { margin-bottom: 1rem; }
  .mp-modal-label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--color-text); opacity: 0.8; }

  .mp-modal-input, .mp-pin-input {
    width: 100%;
    padding: 0.875rem 1rem;
    background: var(--color-input-bg);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text);
    font-size: 1rem;
    font-family: inherit;
    outline: none;
    transition: all 0.2s;
  }
  .mp-pin-input {
    font-size: 1.5rem;
    text-align: center;
    letter-spacing: 0.5rem;
    direction: ltr;
  }
  .mp-modal-input:focus, .mp-pin-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(0,196,140,0.15);
  }

  .mp-check-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0.75rem 0;
  }
  .mp-check-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-accent);
    cursor: pointer;
  }

  .mp-modal-error {
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    border-radius: 12px;
    padding: 0.625rem 0.875rem;
    color: var(--color-error-text);
    font-size: 0.85rem;
    text-align: center;
    margin: 0.75rem 0;
  }

  .mp-modal-success {
    background: var(--color-success-bg);
    border: 1px solid var(--color-success-border);
    border-radius: 12px;
    padding: 0.75rem;
    color: var(--color-success-text);
    font-size: 0.9rem;
    text-align: center;
    margin: 0.75rem 0;
  }

  .mp-modal-actions { display: flex; flex-direction: column; gap: 0.625rem; margin-top: 1.25rem; }

  .mp-modal-btn {
    width: 100%;
    padding: 0.875rem;
    background: var(--color-accent);
    border: none;
    border-radius: 14px;
    color: var(--color-accent-text);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .mp-modal-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
  .mp-modal-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .mp-modal-btn-ghost {
    width: 100%;
    padding: 0.75rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .mp-modal-btn-ghost:hover { border-color: var(--color-text); color: var(--color-text); }

  .mp-forgot-link {
    display: block;
    width: 100%;
    margin-top: 0.75rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    cursor: pointer;
    text-align: center;
    transition: opacity 0.2s;
    font-family: inherit;
  }
  .mp-forgot-link:hover { opacity: 0.8; }

  .mp-modal-field { margin-bottom: 1rem; }
  .mp-modal-label { display: block; font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.4rem; }
  .mp-modal-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--color-input-bg);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    color: var(--color-text);
    font-size: 0.95rem;
    font-family: inherit;
    outline: none;
    transition: all 0.2s;
  }
  .mp-modal-input::placeholder { color: var(--color-text-muted); }
  .mp-modal-input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px rgba(0,196,140,0.15); }
  .mp-modal-input option { background: var(--color-card-solid); color: var(--color-text); }

  /* Unlocked view */
  .mp-unlocked { padding: 2rem 1.5rem; max-width: 500px; margin: 0 auto; }

  .mp-back-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    transition: color 0.2s;
    font-family: inherit;
  }
  .mp-back-btn:hover { color: var(--color-text); }

  .mp-unlocked-card {
    background: var(--color-card-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    overflow: hidden;
    animation: cardIn 0.4s ease-out;
  }

  .mp-unlocked-header {
    padding: 2rem;
    text-align: center;
  }

  .mp-unlocked-logo {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(125,125,125,0.12);
    margin: 0 auto;
    overflow: hidden;
  }

  .mp-unlocked-body { padding: 2rem; }

  .mp-points-display {
    text-align: center;
    padding: 1.5rem;
    background: var(--color-input-bg);
    border-radius: 16px;
    margin-bottom: 1.5rem;
  }

  .mp-points-number {
    font-size: 3rem;
    font-weight: 800;
    color: var(--color-accent);
  }

  .mp-qr-container { text-align: center; }

  .mp-qr-box {
    background: var(--color-input-bg);
    border-radius: 16px;
    padding: 1.5rem;
    display: inline-block;
  }
`;
