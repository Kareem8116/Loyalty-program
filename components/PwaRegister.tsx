'use client';

import React, { useEffect, useState } from 'react';
import { Download, X, Share, PlusSquare, Sparkles, Check } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaRegister() {
  const { isRtl } = useLocale();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered successfully:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }

    // 2. Check if already running in standalone mode (installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 3. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isAppleIos);

    // Check if user dismissed prompt recently (within 24 hours)
    const dismissedAt = localStorage.getItem('pwa_install_dismissed');
    if (dismissedAt) {
      const hoursSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        return;
      }
    }

    // 4. Android / Chromium / Desktop Install Prompt Event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 5. Detect when installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.removeItem('pwa_install_dismissed');
    });

    // On iOS, if not standalone and not dismissed, show prompt after 3 seconds
    if (isAppleIos && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('[PWA] Error during prompt():', err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIosGuide(false);
    try {
      localStorage.setItem('pwa_install_dismissed', Date.now().toString());
    } catch (_) {}
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-4 inset-x-4 sm:bottom-6 sm:end-6 sm:inset-x-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div 
        className="p-4 sm:p-5 rounded-3xl border shadow-2xl backdrop-blur-xl relative flex flex-col gap-3"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          borderColor: 'rgba(99, 102, 241, 0.35)',
          color: '#F8FAFC',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 25px rgba(99, 102, 241, 0.2)'
        }}
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="absolute top-3 end-3 w-8 h-8 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Main Content */}
        <div className="flex items-center gap-3.5 pe-6">
          <div 
            className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border"
            style={{ 
              background: 'linear-gradient(135deg, #4F46E5, #9333EA)',
              borderColor: 'rgba(255, 255, 255, 0.2)' 
            }}
          >
            <Download className="w-6 h-6 text-white" />
          </div>

          <div className="min-w-0">
            <h4 className="text-sm font-extrabold flex items-center gap-1.5">
              <span>{isRtl ? 'تثبيت تطبيق Pointat' : 'Install Pointat App'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                PWA
              </span>
            </h4>
            <p className="text-xs opacity-75 mt-0.5 leading-snug">
              {isRtl
                ? 'ثبّت التطبيق على شاشة هاتفك الرئيسية لفتحه مباشرة وبدون متصفح.'
                : 'Install Pointat to your home screen for quick standalone access.'}
            </p>
          </div>
        </div>

        {/* iOS Step-by-Step Guide Modal/Tooltip */}
        {showIosGuide && (
          <div className="p-3.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-xs space-y-2 animate-in fade-in duration-200">
            <p className="font-bold text-indigo-300">
              {isRtl ? 'طريقة التثبيت على أجهزة iPhone / iPad:' : 'How to install on iPhone / iPad:'}
            </p>
            <div className="space-y-1.5 opacity-90">
              <div className="flex items-center gap-2">
                <Share className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  {isRtl ? '1. اضغط على زر المشاركة (Share) في أسفل المتصفح' : '1. Tap the Share button at the bottom'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PlusSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  {isRtl ? '2. مرر للأسفل واختر "إضافة إلى الصفحة الرئيسية"' : '2. Scroll down and tap "Add to Home Screen"'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 h-11 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: '#4F46E5',
              color: '#FFFFFF',
            }}
          >
            <Download className="w-4 h-4" />
            <span>
              {isIos 
                ? (isRtl ? 'عرض خطوات التثبيت' : 'View Install Guide')
                : (isRtl ? 'تثبيت الآن' : 'Install App')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="h-11 px-4 rounded-xl text-xs font-semibold border opacity-80 hover:opacity-100 transition-colors cursor-pointer"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.15)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
          >
            {isRtl ? 'لاحقاً' : 'Later'}
          </button>
        </div>
      </div>
    </div>
  );
}
