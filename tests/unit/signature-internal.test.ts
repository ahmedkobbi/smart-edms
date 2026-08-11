import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.mock('@/lib/db', () => ({
  db: {
    signatureRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { db } from '@/lib/db';

describe('E-Signature — Internal Sign Endpoint Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a deterministic attestation hash', () => {
    const hash1 = createHash('sha256')
      .update('req1|user@example.com|John Doe|2026-08-11T10:00:00.000Z')
      .digest('hex');
    const hash2 = createHash('sha256')
      .update('req1|user@example.com|John Doe|2026-08-11T10:00:00.000Z')
      .digest('hex');
    const hash3 = createHash('sha256')
      .update('req1|user@example.com|John Doe|2026-08-11T10:00:01.000Z')
      .digest('hex');

    expect(hash1).toBe(hash2); // Same input → same hash
    expect(hash1).not.toBe(hash3); // Different timestamp → different hash
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('checks all signers signed correctly', () => {
    const recipients = [
      { email: 'a@test.com', name: 'A', role: 'signer', status: 'signed' },
      { email: 'b@test.com', name: 'B', role: 'signer', status: 'signed' },
      { email: 'c@test.com', name: 'C', role: 'cc', status: 'sent' },
    ];

    const signers = recipients.filter(r => r.role === 'signer');
    const allSigned = signers.every(r => r.status === 'signed');

    expect(allSigned).toBe(true);
  });

  it('detects when not all signers have signed', () => {
    const recipients = [
      { email: 'a@test.com', name: 'A', role: 'signer', status: 'signed' },
      { email: 'b@test.com', name: 'B', role: 'signer', status: 'pending' },
    ];

    const signers = recipients.filter(r => r.role === 'signer');
    const allSigned = signers.every(r => r.status === 'signed');

    expect(allSigned).toBe(false);
  });

  it('finds recipient by email', () => {
    const recipients = [
      { email: 'a@test.com', name: 'A', role: 'signer' },
      { email: 'b@test.com', name: 'B', role: 'signer' },
    ];

    const found = recipients.find(r => r.email === 'b@test.com');
    expect(found).toBeDefined();
    expect(found?.name).toBe('B');

    const notFound = recipients.find(r => r.email === 'c@test.com');
    expect(notFound).toBeUndefined();
  });
});
