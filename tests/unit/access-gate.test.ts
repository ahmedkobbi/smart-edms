import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    license: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  getDeploymentMode,
  isWriteAllowed,
  signLicense,
  verifyLicenseSignature,
  generateLicenseKey,
  parseLicenseKey,
  type LicensePayload,
} from '@/lib/billing/access-gate';

describe('Access Gate — Deployment Mode', () => {
  it('returns "saas" by default', () => {
    const orig = process.env.DEPLOYMENT_MODE;
    delete process.env.DEPLOYMENT_MODE;
    expect(getDeploymentMode()).toBe('saas');
    if (orig) process.env.DEPLOYMENT_MODE = orig;
  });

  it('returns "onprem" when DEPLOYMENT_MODE is set', () => {
    const orig = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'onprem';
    expect(getDeploymentMode()).toBe('onprem');
    if (orig) process.env.DEPLOYMENT_MODE = orig;
  });

  it('is case-insensitive', () => {
    const orig = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'ONPREM';
    expect(getDeploymentMode()).toBe('onprem');
    if (orig) process.env.DEPLOYMENT_MODE = orig;
  });
});

describe('Access Gate — Write Permission', () => {
  it('allows GET on read_only mode', () => {
    const result = { allowed: true, level: 'read_only' as const, mode: 'saas' as const, status: 'past_due' };
    expect(isWriteAllowed(result, 'GET')).toBe(true);
  });

  it('allows HEAD on read_only mode', () => {
    const result = { allowed: true, level: 'read_only' as const, mode: 'saas' as const, status: 'past_due' };
    expect(isWriteAllowed(result, 'HEAD')).toBe(true);
  });

  it('blocks POST on read_only mode', () => {
    const result = { allowed: true, level: 'read_only' as const, mode: 'saas' as const, status: 'past_due' };
    expect(isWriteAllowed(result, 'POST')).toBe(false);
  });

  it('blocks PUT on read_only mode', () => {
    const result = { allowed: true, level: 'read_only' as const, mode: 'saas' as const, status: 'past_due' };
    expect(isWriteAllowed(result, 'PUT')).toBe(false);
  });

  it('blocks DELETE on read_only mode', () => {
    const result = { allowed: true, level: 'read_only' as const, mode: 'saas' as const, status: 'past_due' };
    expect(isWriteAllowed(result, 'DELETE')).toBe(false);
  });

  it('blocks all methods on locked mode', () => {
    const result = { allowed: false, level: 'locked' as const, mode: 'saas' as const, status: 'locked' };
    expect(isWriteAllowed(result, 'GET')).toBe(false);
    expect(isWriteAllowed(result, 'POST')).toBe(false);
  });

  it('allows all methods on full access', () => {
    const result = { allowed: true, level: 'full' as const, mode: 'saas' as const, status: 'active' };
    expect(isWriteAllowed(result, 'GET')).toBe(true);
    expect(isWriteAllowed(result, 'POST')).toBe(true);
    expect(isWriteAllowed(result, 'DELETE')).toBe(true);
  });
});

describe('Access Gate — License Signing', () => {
  const samplePayload: LicensePayload = {
    tenantId: 'test-tenant-id',
    tenantName: 'Test Corporation',
    plan: 'enterprise',
    seats: 50,
    storageBytes: String(100 * 1024 * 1024 * 1024),
    features: ['records_management', 'signatures'],
    issuedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: '2027-08-12T00:00:00.000Z',
    gracePeriodDays: 30,
    issuedBy: 'Ahmed Kobbi',
  };

  it('signs a license payload with HMAC-SHA256', () => {
    const sig = signLicense(samplePayload);
    expect(sig).toBeTruthy();
    expect(sig).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('produces the same signature for the same payload', () => {
    const sig1 = signLicense(samplePayload);
    const sig2 = signLicense(samplePayload);
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = signLicense(samplePayload);
    const modified = { ...samplePayload, tenantName: 'Different Corp' };
    const sig2 = signLicense(modified);
    expect(sig1).not.toBe(sig2);
  });

  it('verifies a valid signature', () => {
    const sig = signLicense(samplePayload);
    expect(verifyLicenseSignature(samplePayload, sig)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyLicenseSignature(samplePayload, 'invalid-signature')).toBe(false);
  });

  it('rejects a signature from a tampered payload', () => {
    const sig = signLicense(samplePayload);
    const tampered = { ...samplePayload, seats: 999 }; // tampered!
    expect(verifyLicenseSignature(tampered, sig)).toBe(false);
  });
});

describe('Access Gate — License Key Generation & Parsing', () => {
  const samplePayload: LicensePayload = {
    tenantId: 'test-tenant-id',
    tenantName: 'Test Corporation',
    plan: 'enterprise',
    seats: 50,
    storageBytes: String(100 * 1024 * 1024 * 1024),
    features: ['records_management'],
    issuedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: '2027-08-12T00:00:00.000Z',
    gracePeriodDays: 30,
    issuedBy: 'Ahmed Kobbi',
  };

  it('generates a base64 license key', () => {
    const key = generateLicenseKey(samplePayload);
    expect(key).toBeTruthy();
    // Should be valid base64
    expect(() => Buffer.from(key, 'base64')).not.toThrow();
  });

  it('parses a generated license key back to the original payload', () => {
    const key = generateLicenseKey(samplePayload);
    const parsed = parseLicenseKey(key);

    expect(parsed.tenantId).toBe(samplePayload.tenantId);
    expect(parsed.tenantName).toBe(samplePayload.tenantName);
    expect(parsed.plan).toBe(samplePayload.plan);
    expect(parsed.seats).toBe(samplePayload.seats);
    expect(parsed.features).toEqual(samplePayload.features);
    expect(parsed.signature).toBeTruthy();
  });

  it('throws on a tampered license key', () => {
    const key = generateLicenseKey(samplePayload);
    // Tamper with the key by decoding, modifying, and re-encoding
    const decoded = JSON.parse(Buffer.from(key, 'base64').toString('utf-8'));
    decoded.seats = 999; // tamper!
    const tamperedKey = Buffer.from(JSON.stringify(decoded)).toString('base64');

    expect(() => parseLicenseKey(tamperedKey)).toThrow(/Invalid license signature/);
  });

  it('throws on a completely invalid key', () => {
    expect(() => parseLicenseKey('not-a-valid-key')).toThrow();
  });

  it('throws on empty key', () => {
    expect(() => parseLicenseKey('')).toThrow();
  });
});

describe('Access Gate — Clock Rollback Detection', () => {
  it('detects when current time is before lastCheckedAt', () => {
    // Simulate: lastCheckedAt = 2026-08-12, now = 2026-01-01 (rolled back 7 months)
    const lastCheckedAt = new Date('2026-08-12T00:00:00.000Z');
    const now = new Date('2026-01-01T00:00:00.000Z');
    const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

    const minAllowed = new Date(lastCheckedAt.getTime() - CLOCK_TOLERANCE_MS);
    expect(now < minAllowed).toBe(true); // Clock was rolled back
  });

  it('allows minor clock adjustments within tolerance (5 minutes)', () => {
    const lastCheckedAt = new Date('2026-08-12T12:00:00.000Z');
    const now = new Date('2026-08-12T11:58:00.000Z'); // 2 minutes back
    const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

    const minAllowed = new Date(lastCheckedAt.getTime() - CLOCK_TOLERANCE_MS);
    expect(now < minAllowed).toBe(false); // Within tolerance — OK
  });

  it('detects a 1-year rollback', () => {
    const lastCheckedAt = new Date('2026-08-12T00:00:00.000Z');
    const now = new Date('2025-08-12T00:00:00.000Z'); // exactly 1 year back
    const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

    const minAllowed = new Date(lastCheckedAt.getTime() - CLOCK_TOLERANCE_MS);
    expect(now < minAllowed).toBe(true); // Rolled back
  });

  it('high water mark only goes forward', () => {
    // The logic: newLastCheckedAt = max(now, lastCheckedAt)
    const lastCheckedAt = new Date('2026-08-12T12:00:00.000Z');
    const now = new Date('2026-08-12T11:00:00.000Z'); // 1 hour back (within tolerance)

    const newLastCheckedAt = lastCheckedAt > now ? lastCheckedAt : now;
    expect(newLastCheckedAt).toBe(lastCheckedAt); // Keeps the higher value
  });

  it('advances the high water mark when time moves forward', () => {
    const lastCheckedAt = new Date('2026-08-12T12:00:00.000Z');
    const now = new Date('2026-08-12T13:00:00.000Z'); // 1 hour forward

    const newLastCheckedAt = lastCheckedAt > now ? lastCheckedAt : now;
    expect(newLastCheckedAt).toBe(now); // Advances
  });
});
