'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Locale, getTranslation } from '@/lib/locale';

interface LocaleContextType {
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isRtl: boolean;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'ar',
  setLocale: () => {},
  t: (key: string) => key,
  isRtl: true,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ar');

  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem('locale') as Locale | null;
      if (savedLocale === 'ar' || savedLocale === 'en') {
        setLocaleState(savedLocale);
        document.documentElement.lang = savedLocale;
        document.documentElement.dir = savedLocale === 'ar' ? 'rtl' : 'ltr';
      }
    } catch (_) {}
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('locale', newLocale);
      document.documentElement.lang = newLocale;
      document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
    } catch (_) {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return getTranslation(locale, key, params);
    },
    [locale]
  );

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        t,
        isRtl: locale === 'ar',
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
