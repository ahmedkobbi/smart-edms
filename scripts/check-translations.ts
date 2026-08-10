#!/usr/bin/env bun
/**
 * Smart EDMS — Translation completeness checker
 *
 * Verifies that all translation keys exist across all locale files.
 * Fails CI if any keys are missing.
 *
 * Run: bun run scripts/check-translations.ts
 * CI: npm run check:translations
 */

import { promises as fs } from 'fs';
import path from 'path';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');
const REQUIRED_LOCALES = ['en', 'ar', 'fr', 'es', 'de'];

interface CheckResult {
  locale: string;
  missing: string[];
  extra: string[];
  totalKeys: number;
}

function flattenKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

async function loadLocale(locale: string): Promise<any> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  console.log('🌐 Smart EDMS — Translation Completeness Check\n');

  const locales: Record<string, any> = {};
  for (const locale of REQUIRED_LOCALES) {
    try {
      locales[locale] = await loadLocale(locale);
    } catch (err) {
      console.error(`❌ Failed to load ${locale}.json: ${err}`);
      process.exit(1);
    }
  }

  // Use English as the reference (all keys must exist in English first)
  const referenceKeys = new Set(flattenKeys(locales.en));
  console.log(`📋 Reference (en): ${referenceKeys.size} keys\n`);

  const results: CheckResult[] = [];
  let hasErrors = false;

  for (const locale of REQUIRED_LOCALES) {
    const localeKeys = new Set(flattenKeys(locales[locale]));
    const missing = [...referenceKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !referenceKeys.has(k));

    results.push({
      locale,
      missing,
      extra,
      totalKeys: localeKeys.size,
    });

    if (missing.length > 0) {
      hasErrors = true;
    }
  }

  // Print results
  for (const result of results) {
    const status = result.missing.length === 0 ? '✅' : '❌';
    console.log(`${status} ${result.locale}: ${result.totalKeys} keys`);
    if (result.missing.length > 0) {
      console.log(`   Missing (${result.missing.length}):`);
      for (const key of result.missing) {
        console.log(`     - ${key}`);
      }
    }
    if (result.extra.length > 0) {
      console.log(`   Extra (${result.extra.length}):`);
      for (const key of result.extra.slice(0, 5)) {
        console.log(`     - ${key}`);
      }
      if (result.extra.length > 5) {
        console.log(`     ... and ${result.extra.length - 5} more`);
      }
    }
  }

  console.log('');
  if (hasErrors) {
    console.error('❌ Translation check FAILED — missing keys detected.');
    console.error('   Add missing keys to locale files or remove unused keys from English.');
    process.exit(1);
  } else {
    console.log('✅ All translations are complete.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
