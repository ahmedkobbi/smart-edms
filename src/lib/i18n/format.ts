/**
 * Smart EDMS — Locale-aware formatting utilities
 *
 * Provides locale-aware formatting for dates, numbers, relative time,
 * and file sizes. Supports all 5 locales (en, ar, fr, es, de) with
 * proper calendar and numbering system support.
 *
 * Timezone support:
 *   All date formatting functions accept an optional `timezone` parameter
 *   (IANA timezone name, e.g. 'Africa/Algiers', 'Asia/Riyadh', 'UTC').
 *   When provided, dates are rendered in the user's preferred timezone
 *   using Intl.DateTimeFormat's `timeZone` option. This is critical for
 *   retention/disposition dates that must display in the user's local
 *   time, not server time.
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
 * Format a date according to locale + calendar + timezone preferences.
 *
 * @param date The date to format
 * @param locale BCP-47 locale code (en, ar, fr, es, de)
 * @param formatStr date-fns format string (default 'PP' = localized date)
 * @param calendar 'gregory' (default) or 'islamic-umalqura'
 * @param timezone IANA timezone name (e.g. 'UTC', 'Africa/Algiers', 'Asia/Riyadh').
 *                 When provided, the date is rendered in that timezone.
 */
export function formatDate(
  date: Date | string,
  locale: string = 'en',
  formatStr: string = 'PP',
  calendar?: string,
  timezone?: string,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Islamic calendar support via Intl.DateTimeFormat
  if (calendar === 'islamic-umalqura' || calendar === 'islamic') {
    try {
      const intlLocale = locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : `${getIntlLocale(locale)}-u-ca-islamic-umalqura`;
      return new Intl.DateTimeFormat(intlLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(d);
    } catch {
      // Fallback to Gregorian
    }
  }

  // If a timezone is specified, use Intl.DateTimeFormat (date-fns doesn't
  // natively support timezones). We build a format that matches the
  // requested date-fns format string as closely as possible.
  if (timezone) {
    try {
      const opts: Intl.DateTimeFormatOptions = {
        ...(formatStr.includes('y') || formatStr.includes('yyyy') ? { year: 'numeric' } : {}),
        ...(formatStr.includes('M') ? { month: formatStr.includes('MMMM') ? 'long' : formatStr.includes('MMM') ? 'short' : '2-digit' } : {}),
        ...(formatStr.includes('d') ? { day: formatStr.includes('dd') ? '2-digit' : 'numeric' } : {}),
        ...(formatStr.includes('H') || formatStr.includes('h') ? {
          hour: formatStr.includes('HH') ? '2-digit' : 'numeric',
          minute: '2-digit',
        } : {}),
        timeZone: timezone,
      };
      return new Intl.DateTimeFormat(getIntlLocale(locale), opts).format(d);
    } catch {
      // Invalid timezone — fall through to date-fns
    }
  }

  const dateFnsLocale = LOCALE_MAP[locale] || enUS;
  try {
    return format(d, formatStr, { locale: dateFnsLocale });
  } catch {
    return format(d, formatStr);
  }
}

/**
 * Format relative time (e.g., "2 hours ago") according to locale.
 *
 * Note: Relative time is always computed in UTC because "2 hours ago"
 * is the same regardless of timezone (it's a duration, not a point in time).
 */
export function formatRelativeTime(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateFnsLocale = LOCALE_MAP[locale] || enUS;
  try {
    return formatDateDistance(d, { addSuffix: true, locale: dateFnsLocale });
  } catch {
    return formatDateDistance(d, { addSuffix: true });
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
 * Format a date+time according to locale + timezone.
 */
export function formatDateTime(date: Date | string, locale: string = 'en', timezone?: string): string {
  if (timezone) {
    return formatDate(date, locale, 'yyyy-MM-dd HH:mm', undefined, timezone);
  }
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

/**
 * List of common IANA timezones for the locale settings dropdown.
 * Grouped by region for easy selection.
 */
export const COMMON_TIMEZONES: { value: string; label: string; region: string }[] = [
  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', region: 'Universal' },
  // Africa
  { value: 'Africa/Algiers', label: 'Algiers', region: 'Africa' },
  { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa' },
  { value: 'Africa/Casablanca', label: 'Casablanca', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'Lagos', region: 'Africa' },
  { value: 'Africa/Nairobi', label: 'Nairobi', region: 'Africa' },
  { value: 'Africa/Tunis', label: 'Tunis', region: 'Africa' },
  // Asia
  { value: 'Asia/Riyadh', label: 'Riyadh', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia' },
  { value: 'Asia/Qatar', label: 'Doha', region: 'Asia' },
  { value: 'Asia/Kuwait', label: 'Kuwait', region: 'Asia' },
  { value: 'Asia/Bahrain', label: 'Manama', region: 'Asia' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem', region: 'Asia' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'Shanghai', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'Mumbai', region: 'Asia' },
  // Europe
  { value: 'Europe/London', label: 'London', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'Brussels', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Istanbul', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
  // Americas
  { value: 'America/New_York', label: 'New York', region: 'Americas' },
  { value: 'America/Chicago', label: 'Chicago', region: 'Americas' },
  { value: 'America/Denver', label: 'Denver', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', region: 'Americas' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'Americas' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', region: 'Americas' },
  // Pacific
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Pacific' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Pacific' },
];
