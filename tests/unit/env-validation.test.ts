/**
 * Smart EDMS — Environment validation tests
 */

import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/lib/config/env';

describe('Environment Validation', () => {
  it('returns errors for missing required vars', () => {
    // Save and clear env
    const saved = { ...process.env };
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
    delete process.env.SMART_EDMS_KEK;

    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.name === 'DATABASE_URL')).toBe(true);
    expect(result.errors.some((e) => e.name === 'NEXTAUTH_SECRET')).toBe(true);
    expect(result.errors.some((e) => e.name === 'NEXTAUTH_URL')).toBe(true);
    expect(result.errors.some((e) => e.name === 'SMART_EDMS_KEK')).toBe(true);

    // Restore
    process.env = saved;
  });

  it('passes with all required vars set', () => {
    const saved = { ...process.env };
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'a-very-long-secret-key-min-16-chars';
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    process.env.SMART_EDMS_KEK = 'a'.repeat(64); // 32 bytes hex

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);

    process.env = saved;
  });

  it('validates DATABASE_URL format', () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'invalid-url';

    const result = validateEnv();
    expect(result.errors.some((e) => e.name === 'DATABASE_URL')).toBe(true);

    process.env.DATABASE_URL = saved;
  });

  it('validates SMART_EDMS_KEK is 32 bytes', () => {
    const saved = process.env.SMART_EDMS_KEK;
    process.env.SMART_EDMS_KEK = 'too-short';

    const result = validateEnv();
    expect(result.errors.some((e) => e.name === 'SMART_EDMS_KEK')).toBe(true);

    process.env.SMART_EDMS_KEK = saved;
  });

  it('warns about local storage in production', () => {
    const saved = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'a-very-long-secret-key-min-16-chars';
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    process.env.SMART_EDMS_KEK = 'a'.repeat(64);
    process.env.STORAGE_DRIVER = 'local';

    const result = validateEnv();
    expect(result.warnings.some((w) => w.name === 'STORAGE_DRIVER')).toBe(true);

    process.env = saved;
  });
});
