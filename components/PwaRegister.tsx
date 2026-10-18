'use client';

import React, { useEffect, useState } from 'react';
import { DownloadSimple, X, ShareNetwork, PlusSquare, Sparkle, Check } from '@phosphor-icons/react';
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
        className="p-4 sm:p-5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] relative flex flex-col gap-3"
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="absolute top-3 end-3 w-7 h-7 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
        >
          <X weight="light" className="w-3.5 h-3.5" />
        </button>

        {/* Main Content */}
        <div className="flex items-center gap-3.5 pe-6">
          <div 
            className="w-10 h-10 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center shrink-0 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
          >
            <DownloadSimple weight="light" className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <h4 className="text-sm font-light flex items-center gap-1.5">
              <span>{isRtl ? 'تثبيت تطبيق Pointat' : 'Install Pointat App'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-[2px] font-mono tracking-wider uppercase border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]">
                PWA
              </span>
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-snug">
              {isRtl
                ? 'ثبّت التطبيق على شاشة هاتفك الرئيسية لفتحه مباشرة وبدون متصفح.'
                : 'Install Pointat to your home screen for quick standalone access.'}
            </p>
          </div>
        </div>

        {/* iOS Step-by-Step Guide Modal/Tooltip */}
        {showIosGuide && (
          <div className="p-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-xs space-y-2 animate-in fade-in duration-200">
            <p className="font-mono text-xs font-semibold text-[var(--color-text)]">
              {isRtl ? 'طريقة التثبيت على أجهزة iPhone / iPad:' : 'How to install on iPhone / iPad:'}
            </p>
            <div className="space-y-1.5 text-[var(--color-text-muted)]">
              <div className="flex items-center gap-2">
                <ShareNetwork weight="light" className="w-4 h-4 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] shrink-0" />
                <span>
                  {isRtl ? '1. اضغط على زر المشاركة (Share) في أسفل المتصفح' : '1. Tap the Share button at the bottom'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PlusSquare weight="light" className="w-4 h-4 text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)] shrink-0" />
                <span>
                  {isRtl ? '2. مرر للأسفل واختر "إضافة إلى الصفحة الرئيسية"' : '2. Scroll down and tap "Add to Home Screen"'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1 font-mono">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 h-9 px-3 rounded-[8px] text-xs font-semibold uppercase tracking-wider text-white bg-[var(--color-accent)] hover:opacity-95 transition-opacity active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <DownloadSimple weight="light" className="w-4 h-4" />
            <span>
              {isIos 
                ? (isRtl ? 'عرض خطوات التثبيت' : 'View Install Guide')
                : (isRtl ? 'تثبيت الآن' : 'Install App')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="h-9 px-3 rounded-[8px] text-xs font-semibold uppercase tracking-wider border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] hover:opacity-100 transition-colors cursor-pointer"
          >
            {isRtl ? 'لاحقاً' : 'Later'}
          </button>
        </div>
      </div>
    </div>
  );
}
