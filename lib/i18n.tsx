'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations, type Lang } from './translations';

export type { Lang };

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'ledgerflow-lang';

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'km';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLang(stored)) setLangState(stored);
    } catch {
      /* ignore unavailable storage */
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore unavailable storage */
    }
  };

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      let template = translations[lang][key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          template = template.replaceAll(`{${name}}`, String(value));
        }
      }
      return template;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
