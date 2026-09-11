'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/components/LocaleProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Handshake,
  Plus,
  Check,
  X,
  RefreshCw,
  ArrowLeft,
  Clock,
  ShieldCheck,
  AlertCircle,
  Building2,
} from 'lucide-react';

interface Partnership {
  id: string;
  status: 'pending' | 'active' | 'rejected';
  terms: string | null;
  initiated_by: string;
  is_initiator: boolean;
  partner_name: string;
  partner_subdomain: string;
  partner_business_id: string;
  created_at: string;
  updated_at: string;
}

export default function PartnershipsPage() {
  const router = useRouter();
  const { t, isRtl } = useLocale();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New partnership form
  const [showForm, setShowForm] = useState(false);
  const [targetSubdomain, setTargetSubdomain] = useState('');
  const [terms, setTerms] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || jwtToken || ''}`,
    };
  }, [jwtToken]);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/admin/login');
        return;
      }
      setJwtToken(session.access_token);

      const storedBizId = localStorage.getItem('admin_business_id');
      const storedRole = localStorage.getItem('admin_role');
      if (!storedBizId) {
        router.push('/admin/login');
        return;
      }
      if (storedRole !== 'owner' && storedRole !== 'super_admin') {
        router.push('/admin');
        return;
      }
      setBusinessId(storedBizId);
      setIsAuthed(true);
    });
  }, [router]);

  const loadPartnerships = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/partnerships?businessId=${businessId}`, { headers });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load partnerships');
      setPartnerships(data.partnerships || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, getAuthHeaders]);

  useEffect(() => {
    if (isAuthed && businessId) loadPartnerships();
  }, [isAuthed, businessId, loadPartnerships]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSubdomain.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/partnerships', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_subdomain: targetSubdomain.trim().toLowerCase(),
          terms: terms.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setFeedback({ type: 'success', text: isRtl ? 'تم إرسال طلب الشراكة بنجاح' : 'Partnership request sent successfully' });
      setTargetSubdomain('');
      setTerms('');
      setShowForm(false);
      await loadPartnerships();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (partnershipId: string, action: 'accept' | 'reject') => {
    setActingId(partnershipId);
    setFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setFeedback({
        type: 'success',
        text: action === 'accept'
          ? (isRtl ? 'تم قبول الشراكة ✓' : 'Partnership accepted ✓')
          : (isRtl ? 'تم رفض الشراكة' : 'Partnership rejected'),
      });
      await loadPartnerships();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActingId(null);
    }
  };

  const statusBadge = (p: Partnership) => {
    if (p.status === 'active') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '9999px' }}>
        <ShieldCheck style={{ width: 10, height: 10 }} /> {isRtl ? 'نشطة' : 'Active'}
      </span>
    );
    if (p.status === 'pending') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '9999px' }}>
        <Clock style={{ width: 10, height: 10 }} /> {isRtl ? 'قيد الانتظار' : 'Pending'}
      </span>
    );
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: '9999px' }}>
        <X style={{ width: 10, height: 10 }} /> {isRtl ? 'مرفوضة' : 'Rejected'}
      </span>
    );
  };

  if (!isAuthed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'Inter, sans-serif',
        padding: '1rem',
      }}
    >
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '600px', margin: '0 auto', paddingBottom: '1.5rem' }}>
        <button
          onClick={() => router.push('/admin')}
          id="back-to-admin-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid var(--color-border)',
            background: 'var(--color-card-bg)', color: 'var(--color-text)', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          {isRtl ? 'رجوع' : 'Back'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Handshake style={{ width: 22, height: 22, color: 'var(--color-accent)' }} />
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {isRtl ? 'الشراكات' : 'Partnerships'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={loadPartnerships}
              id="refresh-partnerships-btn"
              style={{
                padding: '0.5rem', borderRadius: '9999px',
                border: '1px solid var(--color-border)', background: 'var(--color-card-bg)',
                cursor: 'pointer', color: 'var(--color-text)',
              }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              id="add-partnership-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '9999px',
                border: 'none', background: 'var(--color-accent)', color: '#fff',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              {isRtl ? 'طلب شراكة' : 'Request'}
            </button>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500,
            background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: feedback.type === 'success' ? '#15803d' : '#dc2626',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {feedback.type === 'success' ? <Check style={{ width: 16, height: 16 }} /> : <AlertCircle style={{ width: 16, height: 16 }} />}
            {feedback.text}
          </div>
        )}

        {/* New Partnership Form */}
        {showForm && (
          <form
            onSubmit={handleSendRequest}
            style={{
              background: 'var(--color-card-bg)', borderRadius: '16px',
              border: '1px solid var(--color-border)', padding: '1.25rem',
              display: 'flex', flexDirection: 'column', gap: '0.75rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>
              {isRtl ? 'إرسال طلب شراكة' : 'Send Partnership Request'}
            </h2>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, display: 'block', marginBottom: '0.35rem' }}>
                {isRtl ? 'الـ Subdomain للمكان الشريك' : 'Partner Business Subdomain'}
              </label>
              <input
                id="partner-subdomain-input"
                type="text"
                value={targetSubdomain}
                onChange={(e) => setTargetSubdomain(e.target.value)}
                placeholder={isRtl ? 'مثال: cafe-nile' : 'e.g. cafe-nile'}
                required
                style={{
                  width: '100%', padding: '0.6rem 0.85rem',
                  borderRadius: '10px', border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                  fontSize: '0.875rem', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, display: 'block', marginBottom: '0.35rem' }}>
                {isRtl ? 'شروط الشراكة (اختياري)' : 'Terms (optional)'}
              </label>
              <textarea
                id="partnership-terms-input"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={2}
                placeholder={isRtl ? 'أي شروط خاصة بالشراكة...' : 'Any specific terms...'}
                style={{
                  width: '100%', padding: '0.6rem 0.85rem',
                  borderRadius: '10px', border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                  fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '9999px',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                id="submit-partnership-btn"
                disabled={isSubmitting}
                style={{
                  padding: '0.5rem 1.2rem', borderRadius: '9999px',
                  border: 'none', background: 'var(--color-accent)', color: '#fff',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? '...' : (isRtl ? 'إرسال' : 'Send')}
              </button>
            </div>
          </form>
        )}

        {/* Partnerships List */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
            <div style={{ width: 24, height: 24, border: '3px solid var(--color-accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', borderRadius: '12px', background: '#fee2e2', color: '#dc2626', fontSize: '0.85rem' }}>
            {error}
          </div>
        ) : partnerships.length === 0 ? (
          <div style={{
            padding: '3rem 1rem', textAlign: 'center',
            background: 'var(--color-card-bg)', borderRadius: '16px',
            border: '1px solid var(--color-border)',
          }}>
            <Building2 style={{ width: 40, height: 40, opacity: 0.25, margin: '0 auto 0.75rem' }} />
            <p style={{ margin: 0, opacity: 0.5, fontSize: '0.9rem' }}>
              {isRtl ? 'لا توجد شراكات حتى الآن' : 'No partnerships yet'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {partnerships.map((p) => (
              <div
                key={p.id}
                style={{
                  background: 'var(--color-card-bg)', borderRadius: '16px',
                  border: '1px solid var(--color-border)', padding: '1rem',
                  display: 'flex', flexDirection: 'column', gap: '0.6rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{p.partner_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.72rem', opacity: 0.55, fontFamily: 'monospace' }}>
                      {p.partner_subdomain}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {statusBadge(p)}
                  </div>
                </div>

                {p.terms && (
                  <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.65, padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
                    {p.terms}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.45 }}>
                    {p.is_initiator
                      ? (isRtl ? '✉️ أنت أرسلت الطلب' : '✉️ You sent this request')
                      : (isRtl ? '📩 أرسل إليك هذا الطلب' : '📩 Received from partner')
                    }
                  </span>

                  {/* Accept/Reject buttons only for receiver on pending requests */}
                  {p.status === 'pending' && !p.is_initiator && (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => handleAction(p.id, 'reject')}
                        id={`reject-partnership-${p.id}`}
                        disabled={actingId === p.id}
                        style={{
                          padding: '0.35rem 0.8rem', borderRadius: '9999px',
                          border: '1px solid #dc2626', background: 'transparent',
                          color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                          opacity: actingId === p.id ? 0.6 : 1,
                        }}
                      >
                        <X style={{ width: 12, height: 12, display: 'inline', marginInlineEnd: '0.2rem' }} />
                        {isRtl ? 'رفض' : 'Reject'}
                      </button>
                      <button
                        onClick={() => handleAction(p.id, 'accept')}
                        id={`accept-partnership-${p.id}`}
                        disabled={actingId === p.id}
                        style={{
                          padding: '0.35rem 0.8rem', borderRadius: '9999px',
                          border: 'none', background: '#16a34a',
                          color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                          opacity: actingId === p.id ? 0.6 : 1,
                        }}
                      >
                        <Check style={{ width: 12, height: 12, display: 'inline', marginInlineEnd: '0.2rem' }} />
                        {isRtl ? 'قبول' : 'Accept'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
