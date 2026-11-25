'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  formatMessage,
  getDictionary,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  type Dictionary,
  type Locale,
} from '@/lib/i18n';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Dictionary;
  format: (template: string, params?: Record<string, string | number | null | undefined>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function persistLocalePreference(locale: Locale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  }
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
}

export function LanguageProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale(initialLocale));

  const setLocale = useCallback((next: Locale) => {
    const resolved = resolveLocale(next);
    setLocaleState(resolved);
    persistLocalePreference(resolved);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    return {
      locale,
      setLocale,
      t: getDictionary(locale),
      format: formatMessage,
    };
  }, [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const fallbackValue: LanguageContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: getDictionary(DEFAULT_LOCALE),
  format: formatMessage,
};

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  return ctx ?? fallbackValue;
}
