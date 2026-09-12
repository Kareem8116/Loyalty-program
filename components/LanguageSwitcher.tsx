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
        className="h-10 px-3 rounded-full flex items-center justify-center opacity-0"
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
      className="h-10 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-transform active:scale-95 hover:opacity-80 shadow-xs cursor-pointer border"
      style={{
        backgroundColor: 'var(--color-input-bg)',
        color: 'var(--color-text)',
        borderColor: 'var(--color-border)',
      }}
    >
      <Translate size={18} weight="light" className="shrink-0" />
      <span className="font-semibold select-none">{locale === 'ar' ? 'EN' : 'عربي'}</span>
    </button>
  );
}
