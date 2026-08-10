/**
 * Smart EDMS — Internationalization configuration
 *
 * Supports: English (en), French (fr), Arabic (ar), Spanish (es), German (de)
 *
 * Usage:
 *   import { useTranslations } from 'next-intl';
 *   const t = useTranslations('common');
 *   <p>{t('welcome')}</p>
 *
 * Locale is determined by:
 *   1. URL path (/en/dashboard, /fr/dashboard)
 *   2. User preference (stored in user profile)
 *   3. Browser Accept-Language header
 *   4. Default: 'en'
 */

export const locales = ['en', 'fr', 'ar', 'es', 'de'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
  es: 'Español',
  de: 'Deutsch',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
  ar: '🇸🇦',
  es: '🇪🇸',
  de: '🇩🇪',
};

export const localeDirections: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  fr: 'ltr',
  ar: 'rtl',
  es: 'ltr',
  de: 'ltr',
};

/**
 * Get the display name for a locale
 */
export function getLocaleName(locale: string): string {
  return localeNames[locale as Locale] || locale;
}

/**
 * Get the text direction for a locale
 */
export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  return localeDirections[locale as Locale] || 'ltr';
}

/**
 * Check if a string is a valid locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
