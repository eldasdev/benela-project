"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANGUAGE,
  interpolateTranslation,
  isAppLanguage,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  resolveTranslationValue,
  type AppLanguage,
} from "@/lib/i18n";

type TranslationValues = Record<string, string | number>;

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, values?: TranslationValues, fallback?: string) => string;
  getValue: <T = unknown>(key: string, fallback?: T) => T;
  options: typeof LANGUAGE_OPTIONS;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isAppLanguage(saved)) {
      setLanguageState(saved);
    }
  }, []);

  useEffect(() => {
    const option = LANGUAGE_OPTIONS.find((item) => item.id === language) ?? LANGUAGE_OPTIONS[0];
    document.documentElement.lang = option.htmlLang;
    document.documentElement.setAttribute("data-language", option.id);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, option.id);
  }, [language]);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(isAppLanguage(next) ? next : DEFAULT_LANGUAGE);
  }, []);

  const t = useCallback(
    (key: string, values?: TranslationValues, fallback?: string) => {
      const resolved = resolveTranslationValue(language, key);
      if (typeof resolved === "string") {
        return interpolateTranslation(resolved, values);
      }
      if (typeof resolved === "number" || typeof resolved === "boolean") {
        return String(resolved);
      }
      if (fallback) {
        return interpolateTranslation(fallback, values);
      }
      return key;
    },
    [language],
  );

  const getValue = useCallback(
    ((key: string, fallback?: unknown) => {
      const resolved = resolveTranslationValue(language, key);
      if (resolved === undefined) return fallback;
      return resolved;
    }) as LanguageContextValue["getValue"],
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      getValue,
      options: LANGUAGE_OPTIONS,
    }),
    [getValue, language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }
  return context;
}
