import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createI18n, I18nContext } from './context';
import { detectLocale, isLocale, type Locale } from './locale';
import { MESSAGES } from './messages';

const LOCALE_STORAGE_KEY = 'midi-trainer:locale';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // stockage inaccessible : on se rabat sur la langue du navigateur
  }
  return detectLocale(navigator.languages ?? [navigator.language]);
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = MESSAGES[locale].appTitle;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // préférence non conservée, sans conséquence
    }
  }, [locale]);

  const value = useMemo(() => createI18n(locale, setLocale), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
