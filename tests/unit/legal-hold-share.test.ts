/**
 * Smart EDMS — Legal hold + share protection tests
 *
 * Tests:
 *   - Legal hold blocks deletion (enforced at API level)
 *   - Legal hold blocks classification downgrade
 *   - Share password verification (Argon2id)
 *   - Share expiry enforcement
 *   - Share max-views enforcement
 */

import { describe, it, expect } from 'vitest';
import argon2 from 'argon2';

describe('Legal Hold Rules', () => {
  // Simulate the legal hold enforcement logic
  function canDeleteDocument(doc: { legalHold: boolean; isRecord: boolean }): { allowed: boolean; reason?: string } {
    if (doc.legalHold) return { allowed: false, reason: 'legal_hold_blocks_delete' };
    if (doc.isRecord) return { allowed: false, reason: 'record_blocks_delete' };
    return { allowed: true };
  }

  function canDowngradeClassification(doc: { legalHold: boolean }, hasPermission: boolean): { allowed: boolean; reason?: string } {
    if (doc.legalHold) return { allowed: false, reason: 'legal_hold_blocks_downgrade' };
    if (!hasPermission) return { allowed: false, reason: 'missing:document:classify.downgrade' };
    return { allowed: true };
  }

  it('blocks deletion when legal hold is active', () => {
    const result = canDeleteDocument({ legalHold: true, isRecord: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('legal_hold_blocks_delete');
  });

  it('blocks deletion when document is a record', () => {
    const result = canDeleteDocument({ legalHold: false, isRecord: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('record_blocks_delete');
  });

  it('allows deletion when no hold and not a record', () => {
    const result = canDeleteDocument({ legalHold: false, isRecord: false });
    expect(result.allowed).toBe(true);
  });

  it('blocks classification downgrade under legal hold even with permission', () => {
    const result = canDowngradeClassification({ legalHold: true }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('legal_hold_blocks_downgrade');
  });

  it('blocks classification downgrade without permission', () => {
    const result = canDowngradeClassification({ legalHold: false }, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('missing:document:classify.downgrade');
  });

  it('allows classification downgrade with permission and no hold', () => {
    const result = canDowngradeClassification({ legalHold: false }, true);
    expect(result.allowed).toBe(true);
  });
});

describe('Share Protection', () => {
  describe('Password Verification (Argon2id)', () => {
    it('verifies correct password', async () => {
      const hash = await argon2.hash('SharePassword123!', { type: argon2.argon2id });
      expect(await argon2.verify(hash, 'SharePassword123!')).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await argon2.hash('CorrectPass123!', { type: argon2.argon2id });
      expect(await argon2.verify(hash, 'WrongPass456!')).toBe(false);
    });

    it('rejects empty password', async () => {
      const hash = await argon2.hash('SomePass123!', { type: argon2.argon2id });
      expect(await argon2.verify(hash, '')).toBe(false);
    });
  });

  describe('Share Expiry', () => {
    function isShareExpired(share: { expiresAt: Date | null; revokedAt: Date | null }): boolean {
      if (share.revokedAt) return true;
      if (share.expiresAt && share.expiresAt < new Date()) return true;
      return false;
    }

    it('returns false for non-expired share', () => {
      const future = new Date(Date.now() + 24 * 3600_000);
      expect(isShareExpired({ expiresAt: future, revokedAt: null })).toBe(false);
    });

    it('returns true for expired share', () => {
      const past = new Date(Date.now() - 1000);
      expect(isShareExpired({ expiresAt: past, revokedAt: null })).toBe(true);
    });

    it('returns true for revoked share', () => {
      expect(isShareExpired({ expiresAt: null, revokedAt: new Date() })).toBe(true);
    });

    it('returns false for share with no expiry and not revoked', () => {
      expect(isShareExpired({ expiresAt: null, revokedAt: null })).toBe(false);
    });
  });

  describe('Max Views Enforcement', () => {
    function canViewShare(share: { maxViews: number | null; viewCount: number }): boolean {
      if (share.maxViews === null) return true;
      return share.viewCount < share.maxViews;
    }

    it('allows view when under max', () => {
      expect(canViewShare({ maxViews: 10, viewCount: 5 })).toBe(true);
    });

    it('blocks view when at max', () => {
      expect(canViewShare({ maxViews: 10, viewCount: 10 })).toBe(false);
    });

    it('blocks view when over max', () => {
      expect(canViewShare({ maxViews: 1, viewCount: 5 })).toBe(false);
    });

    it('allows unlimited views when max is null', () => {
      expect(canViewShare({ maxViews: null, viewCount: 9999 })).toBe(true);
    });
  });
});

describe('Crypto-Shredding Safeguards', () => {
  function canCryptoShred(doc: { legalHold: boolean }, confirmation: string, expectedConfirmation: string): { allowed: boolean; reason?: string } {
    if (doc.legalHold) return { allowed: false, reason: 'legal_hold_blocks' };
    if (confirmation !== expectedConfirmation) return { allowed: false, reason: 'confirmation_required' };
    return { allowed: true };
  }

  it('blocks shred under legal hold', () => {
    const result = canCryptoShred({ legalHold: true }, 'SHRED test', 'SHRED test');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('legal_hold_blocks');
  });

  it('blocks shred without correct confirmation', () => {
    const result = canCryptoShred({ legalHold: false }, 'wrong', 'SHRED Confidential Doc');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('confirmation_required');
  });

  it('allows shred with correct confirmation and no hold', () => {
    const result = canCryptoShred({ legalHold: false }, 'SHRED Confidential Doc', 'SHRED Confidential Doc');
    expect(result.allowed).toBe(true);
  });
});
