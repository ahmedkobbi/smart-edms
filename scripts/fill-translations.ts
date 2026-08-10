#!/usr/bin/env bun
/**
 * Fill missing translation keys from English as fallback.
 * Use this to achieve locale parity, then manually translate the filled values.
 */
import { promises as fs } from 'fs';
import path from 'path';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');
const REQUIRED_LOCALES = ['fr', 'es', 'de'];

function flattenKeys(obj: any, prefix = ''): Map<string, any> {
  const keys = new Map<string, any>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = flattenKeys(value, fullKey);
      nested.forEach((v, k) => keys.set(k, v));
    } else {
      keys.set(fullKey, value);
    }
  }
  return keys;
}

function setNestedKey(obj: any, key: string, value: any) {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

async function main() {
  const enContent = JSON.parse(await fs.readFile(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
  const enKeys = flattenKeys(enContent);

  for (const locale of REQUIRED_LOCALES) {
    const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const localeKeys = flattenKeys(content);
    let added = 0;

    for (const [key, value] of enKeys) {
      if (!localeKeys.has(key)) {
        setNestedKey(content, key, value);
        added++;
      }
    }

    await fs.writeFile(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
    console.log(`✅ ${locale}: filled ${added} missing keys`);
  }
}

main().catch(console.error);
