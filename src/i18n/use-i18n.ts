'use client';

import { useState, useEffect, useCallback } from 'react';

// Cache for loaded translations
const translationCache: Record<string, Record<string, any>> = {};

/**
 * Load a locale's translations (client-side).
 * Caches after first load.
 */
async function loadTranslations(locale: string): Promise<Record<string, any>> {
  if (translationCache[locale]) return translationCache[locale];
  try {
    const res = await fetch(`/api/translations/${locale}`);
    if (res.ok) {
      const data = await res.json();
      translationCache[locale] = data;
      return data;
    }
  } catch {}
  // Fallback: try to load from static files
  try {
    const res = await fetch(`/messages/${locale}.json`);
    if (res.ok) {
      const data = await res.json();
      translationCache[locale] = data;
      return data;
    }
  } catch {}
  return {};
}

/**
 * Get a nested value from an object using dot notation.
 * Example: getNestedValue(obj, 'nav.dashboard') → 'Dashboard'
 */
function getNestedValue(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Lightweight i18n hook for client components.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   <h1>{t('dashboard.title')}</h1>
 *
 * Locale is read from localStorage (set by LanguageSwitcher).
 * Falls back to English if key not found in current locale.
 */
export function useI18n() {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('smart-edms-locale') || 'en';
    }
    return 'en';
  });
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadTranslations(locale).then((data) => {
      if (!cancelled) {
        setTranslations(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [locale]);

  const t = useCallback((key: string, fallback?: string): string => {
    if (loading) return fallback || key;
    const value = getNestedValue(translations, key);
    if (value) return value;
    // Fallback to English
    if (locale !== 'en') {
      const enValue = getNestedValue(translationCache['en'], key);
      if (enValue) return enValue;
    }
    return fallback || key;
  }, [translations, loading, locale]);

  const setLocale = useCallback((newLocale: string) => {
    setLocaleState(newLocale);
    localStorage.setItem('smart-edms-locale', newLocale);
    loadTranslations(newLocale).then((data) => {
      setTranslations(data);
    });
  }, []);

  return { t, locale, setLocale, loading };
}

/**
 * Server-side translation loader (for server components).
 * Reads from the messages/ directory.
 */
export async function getTranslations(locale: string = 'en'): Promise<Record<string, any>> {
  try {
    const data = await import(`../../messages/${locale}.json`);
    return data.default || data;
  } catch {
    try {
      const data = await import(`../../messages/en.json`);
      return data.default || data;
    } catch {
      return {};
    }
  }
}
