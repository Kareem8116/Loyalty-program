'use client';

import React from 'react';
import { WifiSlash, CircleNotch } from '@phosphor-icons/react';
import { useLocale } from '@/components/LocaleProvider';

export default function OfflinePage() {
  const { isRtl } = useLocale();

  return (
    <div 
      className="page-bg min-h-screen flex items-center justify-center p-6"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div 
        className="glass-card w-full max-w-md p-8 rounded-3xl text-center space-y-6 shadow-2xl"
      >
        {/* Icon */}
        <div 
          className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center shadow-lg border-[0.5px]"
          style={{ 
            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
            borderColor: 'rgba(239, 68, 68, 0.25)',
            color: '#EF4444' 
          }}
        >
          <WifiSlash weight="light" className="w-10 h-10" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight">
            {isRtl ? 'لا يوجد اتصال بالإنترنت' : 'No Internet Connection'}
          </h1>
          <p className="text-sm opacity-70 leading-relaxed">
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
            className="ios-btn-primary w-full h-13 px-6 rounded-2xl text-sm font-bold transition-all active:scale-98 flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <CircleNotch weight="light" className="w-4 h-4" />
            <span>{isRtl ? 'إعادة المحاولة' : 'Try Again'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
