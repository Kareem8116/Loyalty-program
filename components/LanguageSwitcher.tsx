'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
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
      className="h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold transition-transform active:scale-95 hover:opacity-80 shadow-xs cursor-pointer"
      style={{
        backgroundColor: 'var(--color-card-bg)',
        color: 'var(--color-accent)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Languages className="w-4 h-4 shrink-0" />
      <span className="font-semibold select-none">{locale === 'ar' ? 'EN' : 'عربي'}</span>
    </button>
  );
}
