import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localLabel, localName, type Lang } from '@ledgr/shared';
import { ar } from './ar';

export type { Lang };
const KEY = 'ledgr:lang';

export interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  /** Translate a UI string. Keys are the English text; `{x}` placeholders are filled from params. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Localised name of a configurable record (category, payment method, partner, project). */
  name: (obj: { name: string; nameAr?: string | null } | null | undefined) => string;
  /** Localised label of a custom field definition. */
  label: (def: { label: string; labelAr?: string | null }) => string;
  /** Locale tag for Intl formatting in the current language (Latin digits kept). */
  intlLocale: (projectLocale: string) => string;
}

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ar' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'en';
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

const Ctx = createContext<I18n | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(read);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      setLang,
      t: (key, params) => interpolate(lang === 'ar' ? (ar[key] ?? key) : key, params),
      name: (obj) => localName(obj, lang),
      label: (def) => localLabel(def, lang),
      intlLocale: (projectLocale) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : projectLocale),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside LangProvider');
  return ctx;
}

/** Shorthand: `const t = useT();` */
export function useT(): I18n['t'] {
  return useI18n().t;
}
