'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
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
  const lang = useSyncExternalStore(
    subscribeLanguage,
    readLanguage,
    () => 'en' as Lang,
  );
  const setLang = useCallback((next: Lang) => {
    fallbackLanguage = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore unavailable storage */
    }
    window.dispatchEvent(new Event('ledgerflow-language'));
  }, []);

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

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

let fallbackLanguage: Lang = 'en';
function readLanguage(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : fallbackLanguage;
  } catch {
    return fallbackLanguage;
  }
}
function subscribeLanguage(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener('ledgerflow-language', notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener('ledgerflow-language', notify);
  };
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context)
    throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
