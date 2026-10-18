'use client';

import { useEffect, useState } from 'react';
import { Translate } from '@phosphor-icons/react';
import { useLocale } from './LocaleProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleLanguage = () => {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    setLocale(nextLocale);
  };

  if (!mounted) {
    return (
      <div
        className="h-9 px-3 rounded-[8px] flex items-center justify-center opacity-0"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={toggleLanguage}
      id="language-switcher-btn"
      type="button"
      aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={locale === 'ar' ? 'English' : 'العربية'}
      className="h-9 px-3 rounded-[8px] flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.05em] transition-all active:scale-95 hover:border-[var(--color-signal-blue)] cursor-pointer"
      style={{
        backgroundColor: 'var(--color-card-bg)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Translate size={16} weight="light" className="shrink-0" />
      <span className="font-mono font-medium select-none">{locale === 'ar' ? 'EN' : 'عربي'}</span>
    </button>
  );
}
