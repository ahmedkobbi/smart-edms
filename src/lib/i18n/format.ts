/**
 * Smart EDMS — Locale-aware formatting utilities
 *
 * Provides locale-aware formatting for dates, numbers, relative time,
 * and file sizes. Supports all 5 locales (en, ar, fr, es, de) with
 * proper calendar and numbering system support.
 *
 * Arabic-specific:
 *   - Uses Gregorian calendar by default (Western Arabic-Indic digits optional)
 *   - Proper RTL date formatting
 *   - Arabic month names
 */

import { format, formatDistanceToNow as formatDateDistance } from 'date-fns';
import { ar, fr, es, de, enUS } from 'date-fns/locale';

const LOCALE_MAP: Record<string, Locale> = {
  en: enUS,
  ar: ar,
  fr: fr,
  es: es,
  de: de,
};

type Locale = typeof enUS;

/**
 * Format a date according to locale.
 */
export function formatDate(date: Date | string, locale: string = 'en', formatStr: string = 'PP'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateFnsLocale = LOCALE_MAP[locale] || enUS;
  try {
    return format(d, formatStr, { locale: dateFnsLocale });
  } catch {
    return format(d, formatStr);
  }
}

/**
 * Format relative time (e.g., "2 hours ago") according to locale.
 */
export function formatRelativeTime(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateFnsLocale = LOCALE_MAP[locale] || enUS;
  try {
    return formatDateDistance(d, new Date(), { addSuffix: true, locale: dateFnsLocale });
  } catch {
    return formatDateDistance(d, new Date(), { addSuffix: true });
  }
}

/**
 * Format a number according to locale.
 * Arabic uses Western digits by default (Arabic-Indic optional).
 */
export function formatNumber(value: number, locale: string = 'en'): string {
  const intlLocale = locale === 'ar' ? 'ar-SA' : locale;
  try {
    return new Intl.NumberFormat(intlLocale).format(value);
  } catch {
    return value.toLocaleString();
  }
}

/**
 * Format bytes as human-readable size according to locale.
 */
export function formatBytes(bytes: number, locale: string = 'en', decimals = 1): string {
  if (!bytes || bytes < 0) return '0 B';
  const k = 1024;
  const sizes = locale === 'ar'
    ? ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت']
    : ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));
  return `${formatNumber(value, locale)} ${sizes[i]}`;
}

/**
 * Format a date+time according to locale.
 */
export function formatDateTime(date: Date | string, locale: string = 'en'): string {
  return formatDate(date, locale, 'PPpp');
}

/**
 * Get the text direction for a locale.
 */
export function getTextDirection(locale: string = 'en'): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Get the Intl locale code for a Smart EDMS locale.
 */
export function getIntlLocale(locale: string = 'en'): string {
  const map: Record<string, string> = {
    en: 'en-US',
    ar: 'ar-SA',
    fr: 'fr-FR',
    es: 'es-ES',
    de: 'de-DE',
  };
  return map[locale] || 'en-US';
}

/**
 * Pluralization helper using Intl.PluralRules.
 *
 * Usage:
 *   const pr = getPluralRules('ar');
 *   pr.select(0) // 'zero' in Arabic
 *   pr.select(1) // 'one' in Arabic
 *   pr.select(2) // 'two' in Arabic
 *   pr.select(5) // 'few' in Arabic (Arabic has 6 plural forms)
 */
export function getPluralRules(locale: string = 'en'): Intl.PluralRules {
  try {
    return new Intl.PluralRules(getIntlLocale(locale));
  } catch {
    return new Intl.PluralRules('en-US');
  }
}

/**
 * Select the correct plural form for a count and locale.
 * Returns one of: 'zero', 'one', 'two', 'few', 'many', 'other'
 */
export function getPluralForm(count: number, locale: string = 'en'): string {
  return getPluralRules(locale).select(count);
}
