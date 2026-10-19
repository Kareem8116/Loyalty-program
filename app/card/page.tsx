'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CardIndexPage() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState('');
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('pointat_last_token');
      if (savedToken && savedToken.trim().length > 0) {
        router.replace(`/card/${encodeURIComponent(savedToken.trim())}`);
        return;
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsCheckingStorage(false);
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim().replace(/[-\s]/g, '');
    if (!cleanToken) {
      setError('يرجى إدخال رمز البطاقة أو الكود');
      return;
    }
    router.push(`/card/${encodeURIComponent(cleanToken)}`);
  };

  if (isCheckingStorage) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 page-bg">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-signal-blue)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--color-text-muted)] font-mono">جاري تحميل بطاقتك...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 page-bg" dir="rtl">
      <div className="max-w-md w-full p-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] shadow-xl shadow-black/5">
        {/* Brand Icon */}
        <div className="w-14 h-14 mx-auto mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-2xl text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] shadow-inner">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-center mb-2 text-[var(--color-text)]">
          بطاقة الولاء الرقمية
        </h1>
        
        <p className="text-xs text-center text-[var(--color-text-muted)] leading-relaxed mb-6">
          لم يتم العثور على بطاقة محفوظة على هذا الجهاز. أدخل رمز بطاقتك أو الكود المكون من 9 أحرف لعرض رصيدك ومكافآتك.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
              رمز البطاقة أو كود العميل
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="مثال: 7KM-92P-X4R"
              dir="ltr"
              className="w-full px-4 py-3 text-center text-base tracking-widest font-mono rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-signal-blue)] transition-all"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mt-1.5 text-center font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-lg bg-[var(--color-signal-blue)] hover:opacity-95 text-white font-medium text-sm transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <span>فتح البطاقة</span>
            <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[var(--color-border)] flex flex-col gap-3 text-center">
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            💡 نصيحة: يمكنك مسح رمز الـ QR الخاص بك من شاشة الكاشير في المتجر مباشرة لفتح بطاقتك وحفظها تلقائياً.
          </p>

          <Link
            href="/"
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors inline-block"
          >
            ← العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
