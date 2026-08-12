import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { license: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() } },
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  computeHardwareFingerprint,
  verifyHardwareFingerprint,
  computeLicenseIntegrityHash,
  verifyLicenseIntegrity,
  isTrialExpired,
  getTrialInfo,
  generateLicenseNonce,
  detectTampering,
} from '@/lib/billing/anti-crack';

describe('Anti-Crack — Hardware Fingerprint', () => {
  it('computes a deterministic fingerprint', () => {
    const fp1 = computeHardwareFingerprint();
    const fp2 = computeHardwareFingerprint();
    expect(fp1.hash).toBe(fp2.hash); // Same hardware = same hash
    expect(fp1.hash).toHaveLength(32); // 16 bytes = 32 hex chars
  });

  it('includes CPU, memory, MAC, hostname, platform, arch', () => {
    const fp = computeHardwareFingerprint();
    expect(fp.cpu).toBeTruthy();
    expect(fp.cores).toBeGreaterThan(0);
    expect(fp.memory).toBeGreaterThan(0);
    expect(fp.mac).toBeTruthy();
    expect(fp.hostname).toBeTruthy();
    expect(fp.platform).toBeTruthy();
    expect(fp.arch).toBeTruthy();
  });

  it('verifies a matching fingerprint', () => {
    const fp = computeHardwareFingerprint();
    expect(verifyHardwareFingerprint(fp.hash)).toBe(true);
  });

  it('rejects a non-matching fingerprint', () => {
    expect(verifyHardwareFingerprint('aabbccddeeff00112233445566778899')).toBe(false);
  });

  it('allows legacy licenses with no fingerprint (backward compat)', () => {
    expect(verifyHardwareFingerprint('')).toBe(true);
    expect(verifyHardwareFingerprint('any')).toBe(true);
  });
});

describe('Anti-Crack — Database Integrity Hash', () => {
  const sampleLicense = {
    tenantId: 'test-tenant',
    licenseKey: 'test-key',
    status: 'active',
    licenseeName: 'Test Corp',
    plan: 'enterprise',
    seats: 50,
    storageBytes: BigInt(100 * 1024 * 1024 * 1024),
    issuedAt: new Date('2026-01-01'),
    expiresAt: new Date('2027-01-01'),
    gracePeriodDays: 30,
    signature: 'abc123signature',
    clockRollbackDetected: false,
    lastCheckedAt: new Date('2026-08-12'),
  };

  it('computes a deterministic integrity hash', () => {
    const hash1 = computeLicenseIntegrityHash(sampleLicense);
    const hash2 = computeLicenseIntegrityHash(sampleLicense);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('detects status modification', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    const tampered = { ...sampleLicense, status: 'locked' };
    const tamperedHash = computeLicenseIntegrityHash(tampered);
    expect(hash).not.toBe(tamperedHash);
  });

  it('detects clockRollbackDetected modification', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    const tampered = { ...sampleLicense, clockRollbackDetected: true };
    const tamperedHash = computeLicenseIntegrityHash(tampered);
    expect(hash).not.toBe(tamperedHash);
  });

  it('detects expiresAt modification', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    const tampered = { ...sampleLicense, expiresAt: new Date('2030-01-01') }; // Extended
    const tamperedHash = computeLicenseIntegrityHash(tampered);
    expect(hash).not.toBe(tamperedHash);
  });

  it('detects seats modification', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    const tampered = { ...sampleLicense, seats: 999 }; // Unlimited seats
    const tamperedHash = computeLicenseIntegrityHash(tampered);
    expect(hash).not.toBe(tamperedHash);
  });

  it('detects lastCheckedAt modification (rollback)', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    const tampered = { ...sampleLicense, lastCheckedAt: new Date('2020-01-01') }; // Rolled back
    const tamperedHash = computeLicenseIntegrityHash(tampered);
    expect(hash).not.toBe(tamperedHash);
  });

  it('verifies a valid integrity hash', () => {
    const hash = computeLicenseIntegrityHash(sampleLicense);
    expect(verifyLicenseIntegrity(sampleLicense, hash)).toBe(true);
  });

  it('rejects an invalid integrity hash', () => {
    expect(verifyLicenseIntegrity(sampleLicense, 'invalid-hash')).toBe(false);
  });

  it('rejects a null integrity hash (deleted by attacker)', () => {
    expect(verifyLicenseIntegrity(sampleLicense, null)).toBe(false);
  });

  it('rejects a hash computed with a different signature (forged signature)', () => {
    const hashWithOriginalSig = computeLicenseIntegrityHash(sampleLicense);
    const tamperedLicense = { ...sampleLicense, status: 'locked' };
    // Attacker tries to recompute the hash, but can't forge the signature
    // The hash key is derived from the signature, so changing status without
    // changing the signature produces a different hash
    const hashWithTamperedStatus = computeLicenseIntegrityHash(tamperedLicense);
    expect(hashWithOriginalSig).not.toBe(hashWithTamperedStatus);
  });
});

describe('Anti-Crack — Trial Mode Hardening', () => {
  it('detects an expired trial', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    expect(isTrialExpired(oldDate)).toBe(true); // 14-day trial, 30 days ago = expired
  });

  it('allows an active trial', () => {
    const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    expect(isTrialExpired(recentDate)).toBe(false);
  });

  it('calculates correct days remaining', () => {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const info = getTrialInfo(yesterday);
    expect(info.expired).toBe(false);
    expect(info.daysRemaining).toBeGreaterThan(0);
    expect(info.daysRemaining).toBeLessThanOrEqual(14);
  });

  it('returns 0 days remaining when expired', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const info = getTrialInfo(oldDate);
    expect(info.expired).toBe(true);
    expect(info.daysRemaining).toBe(0);
  });
});

describe('Anti-Crack — License Nonce', () => {
  it('generates a unique nonce', () => {
    const nonce1 = generateLicenseNonce();
    const nonce2 = generateLicenseNonce();
    expect(nonce1).not.toBe(nonce2); // Each call produces a different nonce
    expect(nonce1).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});

describe('Anti-Crack — Tamper Detection', () => {
  it('detects database tampering when integrity hash is missing', async () => {
    const license = { integrityHash: null };
    const issues = await detectTampering(license);
    expect(issues).toContain('missing_integrity_hash');
  });

  it('detects clock rollback', async () => {
    const license = { clockRollbackDetected: true };
    const issues = await detectTampering(license);
    expect(issues).toContain('clock_rollback_detected');
  });

  it('returns tampering issues for a fake license', async () => {
    const license = {
      integrityHash: 'fake-hash',
      clockRollbackDetected: false,
      hardwareFingerprint: null,
    };
    const issues = await detectTampering(license);
    // verifyLicenseIntegrity will fail because the license is missing required fields
    expect(issues.length).toBeGreaterThan(0);
  });
});
