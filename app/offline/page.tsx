'use client';

import React from 'react';
import { WifiSlash, CircleNotch } from '@phosphor-icons/react';
import { useLocale } from '@/components/LocaleProvider';

export default function OfflinePage() {
  const { isRtl } = useLocale();

  return (
    <main 
      className="page-bg min-h-screen flex items-center justify-center p-6"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div 
        className="w-full max-w-sm p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-center space-y-5"
      >
        {/* Icon */}
        <div 
          className="w-12 h-12 mx-auto rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-red-500"
        >
          <WifiSlash weight="light" className="w-6 h-6" />
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h1 className="text-xl font-light tracking-tight text-[var(--color-text)]">
            {isRtl ? 'لا يوجد اتصال بالإنترنت' : 'No Internet Connection'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {isRtl
              ? 'أنت تتصفح في وضع عدم الاتصال حالياً. تطبيق Pointat يحتفظ ببطاقاتك، وستتم مزامنة أي بيانات جديدة فور عودة الاتصال.'
              : 'You are currently offline. Pointat saves your local data and will automatically sync once your connection is restored.'}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-10 px-5 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
          >
            <CircleNotch weight="light" className="w-4 h-4" />
            <span>{isRtl ? 'إعادة المحاولة' : 'Try Again'}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
