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
 * Escape HTML in interpolation values (XSS protection).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a value for display (locale-aware numbers + dates).
 */
function formatValue(value: unknown, locale: string): string {
  if (value == null) return '';
  if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
  if (value instanceof Date) return new Intl.DateTimeFormat(locale).format(value);
  return String(value);
}

/**
 * Parse ICU plural branches with brace matching.
 */
function parsePluralBranches(body: string): Record<string, string> {
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    let key = '';
    while (i < body.length && /[a-zA-Z0-9=]/.test(body[i])) { key += body[i]; i++; }
    if (!key) break;
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '{') break;
    i++;
    let depth = 1;
    let content = '';
    while (i < body.length && depth > 0) {
      const ch = body[i];
      if (ch === '{') { depth++; content += ch; }
      else if (ch === '}') { depth--; if (depth > 0) content += ch; }
      else content += ch;
      i++;
    }
    branches[key] = content;
  }
  return branches;
}

/**
 * Apply ICU plural expressions + interpolation to a template string.
 */
function interpolate(template: string, params: Record<string, unknown>, locale: string): string {
  // Handle plural expressions with brace matching
  let result = '';
  let i = 0;
  while (i < template.length) {
    if (template[i] === '{') {
      const m = /^\{(\w+),\s*plural,\s*/.exec(template.slice(i));
      if (m) {
        const name = m[1];
        let j = i + m[0].length;
        let depth = 1;
        let body = '';
        while (j < template.length && depth > 0) {
          const ch = template[j];
          if (ch === '{') { depth++; body += ch; }
          else if (ch === '}') { depth--; if (depth > 0) body += ch; }
          else body += ch;
          j++;
        }
        const value = params[name];
        const num = typeof value === 'number' ? value : parseInt(String(value ?? 0), 10);
        const branches = parsePluralBranches(body);
        const exact = branches[`=${num}`];
        let selected: string;
        if (exact !== undefined) selected = exact;
        else {
          try {
            const category = new Intl.PluralRules(locale).select(num);
            selected = branches[category] ?? branches.other ?? '';
          } catch {
            selected = branches.other ?? '';
          }
        }
        const numFormatted = new Intl.NumberFormat(locale).format(num);
        result += interpolate(selected.replace(/#/g, numFormatted), params, locale);
        i = j;
        continue;
      }
    }
    result += template[i];
    i++;
  }

  // Handle typed formatters {name, number} and {name, date}
  result = result.replace(/\{(\w+),\s*(number|date)\}/g, (_match, name: string, type: string) => {
    const value = params[name];
    if (type === 'number' && typeof value === 'number') {
      return escapeHtml(new Intl.NumberFormat(locale).format(value));
    }
    if (type === 'date' && (value instanceof Date || typeof value === 'string' || typeof value === 'number')) {
      const d = value instanceof Date ? value : new Date(value);
      return escapeHtml(new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d));
    }
    return escapeHtml(formatValue(value, locale));
  });

  // Handle plain {name}
  result = result.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return escapeHtml(formatValue(value, locale));
  });

  return result;
}

/**
 * Lightweight i18n hook for client components.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   <h1>{t('dashboard.title')}</h1>
 *   <p>{t('admin.users.suspendConfirm', { email: 'user@example.com' })}</p>
 *
 * Locale is read from localStorage (set by LanguageSwitcher).
 * Falls back to English if key not found in current locale.
 *
 * Supports ICU MessageFormat interpolation including plurals:
 *   t('emails.failedLogin.text', { count: 5, ip: '1.2.3.4' })
 *   → "5 failed login attempts on your account from IP 1.2.3.4..."
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

  const t = useCallback(
    (key: string, paramsOrFallback?: Record<string, unknown> | string): string => {
      // Support both signatures:
      //   t('key')                         — no params
      //   t('key', 'Fallback text')        — fallback string
      //   t('key', { name: 'value' })      — interpolation params
      const fallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : undefined;
      const params = (paramsOrFallback && typeof paramsOrFallback === 'object') ? paramsOrFallback : {};

      let template: string | undefined;
      if (!loading) template = getNestedValue(translations, key);
      if (!template && locale !== 'en') template = getNestedValue(translationCache['en'], key);

      if (!template) {
        return fallback || key;
      }

      // If no params, return the raw template (no interpolation needed)
      if (Object.keys(params).length === 0) return template;

      return interpolate(template, params, locale);
    },
    [translations, loading, locale],
  );

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
