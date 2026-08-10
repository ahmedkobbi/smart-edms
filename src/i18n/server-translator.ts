/**
 * Smart EDMS — Server-side i18n translator
 *
 * A production-grade translator that loads message bundles from /messages/{locale}.json
 * and interpolates ICU-style placeholders: {name}, {count, plural, one {...} other {...}},
 * {count, number}, etc.
 *
 * Used by:
 *   - Email templates (src/lib/notifications/email.ts)
 *   - Notification templates (src/lib/notifications/notify.ts)
 *   - Any server-side code that needs localized strings outside of a React render
 *     context (cron jobs, webhooks, background tasks).
 *
 * Design goals:
 *   1. Zero React/next-intl dependency — usable from any server context.
 *   2. Memoized bundle loading (one read per locale per process).
 *   3. ICU MessageFormat-style interpolation with HTML-safe escaping by default
 *      (callers can opt out via `t.raw(...)` for trusted HTML content).
 *   4. Pluralization using CLDR rules for the 5 supported locales.
 *   5. Fallback to English when a key is missing in the target locale.
 *   6. Fallback to the key itself when missing from both target and English
 *      (logged at warn level to surface incomplete translations in CI).
 *
 * Usage:
 *   import { getTranslator } from '@/lib/i18n/server-translator';
 *   const t = await getTranslator('fr');
 *   t('emails.invitation.subject', { tenantName: 'Acme Corp' });
 *   // → "Invitation à Acme Corp sur Smart EDMS"
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/config/logger';
import { locales, defaultLocale, isValidLocale, getLocaleDirection, type Locale } from './config';

// ---------------------------------------------------------------------------
//  Bundle cache
// ---------------------------------------------------------------------------

const BUNDLES_DIR = path.join(process.cwd(), 'messages');
const bundleCache = new Map<Locale, Record<string, unknown>>();
const loadingPromises = new Map<Locale, Promise<Record<string, unknown>>>();

async function loadBundle(locale: Locale): Promise<Record<string, unknown>> {
  const cached = bundleCache.get(locale);
  if (cached) return cached;

  // Deduplicate concurrent loads
  const inflight = loadingPromises.get(locale);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const raw = await fs.readFile(path.join(BUNDLES_DIR, `${locale}.json`), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      bundleCache.set(locale, parsed);
      return parsed;
    } catch (err) {
      logger.warn('i18n.bundle_load_failed', { locale, error: (err as Error).message });
      // Fall back to empty bundle — resolver will then cascade to defaultLocale
      const empty: Record<string, unknown> = {};
      bundleCache.set(locale, empty);
      return empty;
    }
  })();
  loadingPromises.set(locale, promise);
  return promise;
}

// ---------------------------------------------------------------------------
//  Path resolution — dotted keys with nested objects
// ---------------------------------------------------------------------------

function resolvePath(bundle: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let current: unknown = bundle;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
//  ICU MessageFormat-style interpolation
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters in user-supplied interpolation values.
 * Trusted HTML content (already-localized template fragments) is NOT escaped
 * — callers opt into raw interpolation via `t.raw()`.
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
 * Coerce an interpolation value to a display string.
 * Numbers use locale-aware formatting via Intl.NumberFormat.
 * Dates use locale-aware formatting via Intl.DateTimeFormat.
 */
function formatValue(value: unknown, locale: Locale, type?: string): string {
  if (value == null) return '';
  if (type === 'number' && typeof value === 'number') {
    return new Intl.NumberFormat(locale).format(value);
  }
  if (type === 'date' && (value instanceof Date || typeof value === 'string' || typeof value === 'number')) {
    const d = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat(locale).format(value);
  }
  if (value instanceof Date) {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  }
  return String(value);
}

/**
 * Pluralize using CLDR rules via Intl.PluralRules.
 * Supports the form: {count, plural, one {...} few {...} many {...} other {...}}
 * Also supports `=0`, `=1` explicit matches.
 */
function applyPlural(
  template: string,
  params: Record<string, unknown>,
  locale: Locale,
): string {
  // Match {name, plural, ...}
  return template.replace(/\{(\w+),\s*plural,\s*([^}]+)\}/g, (match, name: string, body: string) => {
    const value = params[name];
    const num = typeof value === 'number' ? value : parseInt(String(value ?? 0), 10);
    const branches = parsePluralBranches(body);
    // Check explicit =N matches first
    const exact = branches[`=${num}`];
    if (exact !== undefined) return interpolate(exact, params, locale, /*raw*/ false);
    // Fall back to CLDR category
    const category = new Intl.PluralRules(locale).select(num);
    const selected = branches[category] ?? branches.other ?? '';
    return interpolate(selected, params, locale, /*raw*/ false);
  });
}

/**
 * Parse the body of a plural expression into a map of category → template.
 * Body shape: "one {...} few {...} many {...} other {...}"
 * Values may contain nested { } (e.g. {count, number}).
 */
function parsePluralBranches(body: string): Record<string, string> {
  const branches: Record<string, string> = {};
  // Tokenize: keyword then { ... balanced ... }
  const re = /(\w+|=0|=1|=2)\s*\{/g;
  let match: RegExpExecArray | null;
  let start = 0;
  const keys: { key: string; start: number; end: number }[] = [];
  while ((match = re.exec(body)) !== null) {
    const key = match[1];
    const contentStart = match.index + match[0].length;
    // Find the matching closing brace, accounting for nesting
    let depth = 1;
    let i = contentStart;
    while (i < body.length && depth > 0) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') depth--;
      if (depth > 0) i++;
    }
    keys.push({ key, start: contentStart, end: i });
    re.lastIndex = i + 1;
    start = i + 1;
  }
  for (const k of keys) {
    branches[k.key] = body.slice(k.start, k.end);
  }
  return branches;
}

/**
 * Core interpolation: replace {name} with params[name], applying plural/number/date
 * formatting when the param includes a type specifier.
 *
 * @param raw If true, interpolation values are inserted as-is (use only for
 *            trusted HTML content). If false, values are HTML-escaped.
 */
function interpolate(
  template: string,
  params: Record<string, unknown>,
  locale: Locale,
  raw: boolean,
): string {
  // First: handle plural expressions
  let out = applyPlural(template, params, locale);

  // Then: handle typed formatters {name, number} and {name, date}
  out = out.replace(/\{(\w+),\s*(number|date)\}/g, (match, name: string, type: string) => {
    const value = params[name];
    return raw ? formatValue(value, locale, type) : escapeHtml(formatValue(value, locale, type));
  });

  // Finally: handle plain {name}
  out = out.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    const formatted = formatValue(value, locale);
    return raw ? formatted : escapeHtml(formatted);
  });

  return out;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export interface Translator {
  /**
   * Translate a key with parameters. HTML-escapes interpolation values.
   * For trusted HTML fragments in the template itself (e.g. <strong>), use t.raw().
   */
  (keyPath: string, params?: Record<string, unknown>): string;
  /**
   * Translate without HTML-escaping. Use ONLY for templates that contain
   * trusted HTML markup (e.g. localized email bodies with <strong> tags).
   * User-supplied values are still escaped.
   */
  raw(keyPath: string, params?: Record<string, unknown>): string;
  /** The locale this translator is bound to. */
  locale: Locale;
  /** The text direction ('ltr' or 'rtl'). */
  direction: 'ltr' | 'rtl';
}

/**
 * Get a translator for a specific locale.
 *
 * The translator reads from the cached message bundle. If a key is missing
 * from the target locale, it falls back to English; if also missing from
 * English, it returns the key itself (logged at warn level).
 *
 * @param locale BCP-47 tag (en, fr, ar, es, de). Invalid values fall back to 'en'.
 */
export async function getTranslator(localeInput: string | undefined | null): Promise<Translator> {
  const locale: Locale = isValidLocale(localeInput as Locale) ? (localeInput as Locale) : defaultLocale;
  const bundle = await loadBundle(locale);
  const fallbackBundle = locale === defaultLocale ? null : await loadBundle(defaultLocale);
  const direction = getLocaleDirection(locale);

  const missingKeyCache = new Set<string>();

  function resolve(keyPath: string): string | undefined {
    const fromPrimary = resolvePath(bundle, keyPath);
    if (typeof fromPrimary === 'string') return fromPrimary;
    if (fallbackBundle) {
      const fromFallback = resolvePath(fallbackBundle, keyPath);
      if (typeof fromFallback === 'string') return fromFallback;
    }
    return undefined;
  }

  function translate(keyPath: string, params: Record<string, unknown> | undefined, raw: boolean): string {
    let template = resolve(keyPath);
    if (template === undefined) {
      // Log missing key once per translator instance
      if (!missingKeyCache.has(keyPath)) {
        missingKeyCache.add(keyPath);
        logger.warn('i18n.missing_key', { key: keyPath, locale });
      }
      // Return the key itself as a last resort (better than empty)
      template = keyPath;
    }
    // Always run interpolation — missing params are replaced with empty string
    // so the recipient never sees a literal "{name}" placeholder.
    return interpolate(template, params ?? {}, locale, raw);
  }

  const fn = ((keyPath: string, params?: Record<string, unknown>) =>
    translate(keyPath, params, /*raw*/ false)) as Translator;
  fn.raw = (keyPath: string, params?: Record<string, unknown>) =>
    translate(keyPath, params, /*raw*/ true);
  fn.locale = locale;
  fn.direction = direction;
  return fn;
}

/**
 * Resolve a user's preferred locale from the DB.
 * Falls back to 'en' on any error.
 *
 * Cached for the lifetime of the request to avoid duplicate queries.
 */
import { db } from '@/lib/db';

const userLocaleCache = new Map<string, { locale: string; ts: number }>();
const USER_LOCALE_TTL_MS = 60_000; // 1 minute — balances freshness with DB load

export async function getUserLocale(userId: string): Promise<Locale> {
  // Check cache
  const cached = userLocaleCache.get(userId);
  if (cached && Date.now() - cached.ts < USER_LOCALE_TTL_MS) {
    return isValidLocale(cached.locale as Locale) ? (cached.locale as Locale) : defaultLocale;
  }

  try {
    const pref = await db.userLocalePreference.findUnique({
      where: { userId },
      select: { locale: true },
    });
    const locale = pref?.locale && isValidLocale(pref.locale as Locale)
      ? (pref.locale as Locale)
      : defaultLocale;
    userLocaleCache.set(userId, { locale, ts: Date.now() });
    return locale;
  } catch (err) {
    logger.debug('i18n.user_locale_lookup_failed', { userId, error: (err as Error).message });
    return defaultLocale;
  }
}

/**
 * Invalidate the cached locale for a user (call when their preference changes).
 */
export function invalidateUserLocale(userId: string): void {
  userLocaleCache.delete(userId);
}

/**
 * Preload all locale bundles at startup (optional — first request will
 * otherwise lazy-load on demand).
 */
export async function preloadAllBundles(): Promise<void> {
  await Promise.all(locales.map((l) => loadBundle(l)));
}

/**
 * List of supported locales (re-exported for convenience).
 */
export { locales, defaultLocale, isValidLocale, getLocaleDirection };
export type { Locale };
