import { describe, it, expect, beforeEach, vi } from 'vitest';

// We test the pure functions from the security audit framework
// DB-dependent functions are mocked

vi.mock('@/lib/db', () => ({
  db: {
    securityAudit: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    securityAuditFinding: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    securityScanResult: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  COMPLIANCE_CONTROLS,
  verifyHashChain,
} from '@/lib/security/audit-framework';

describe('Security Audit Framework', () => {
  describe('COMPLIANCE_CONTROLS', () => {
    it('contains all 6 frameworks', () => {
      expect(Object.keys(COMPLIANCE_CONTROLS)).toEqual(
        expect.arrayContaining(['iso27001', 'soc2', 'gdpr', 'hipaa', 'dod501502', 'internal'])
      );
    });

    it('ISO 27001 has at least 15 controls', () => {
      expect(COMPLIANCE_CONTROLS.iso27001.length).toBeGreaterThanOrEqual(15);
    });

    it('SOC 2 has at least 15 controls', () => {
      expect(COMPLIANCE_CONTROLS.soc2.length).toBeGreaterThanOrEqual(15);
    });

    it('GDPR has at least 15 controls', () => {
      expect(COMPLIANCE_CONTROLS.gdpr.length).toBeGreaterThanOrEqual(15);
    });

    it('HIPAA has at least 10 controls', () => {
      expect(COMPLIANCE_CONTROLS.hipaa.length).toBeGreaterThanOrEqual(10);
    });

    it('DoD 5015.02 has at least 10 requirements', () => {
      expect(COMPLIANCE_CONTROLS.dod501502.length).toBeGreaterThanOrEqual(10);
    });

    it('each control has id, title, description, and category', () => {
      for (const framework of Object.keys(COMPLIANCE_CONTROLS) as Array<keyof typeof COMPLIANCE_CONTROLS>) {
        for (const control of COMPLIANCE_CONTROLS[framework]) {
          expect(control.id).toBeTruthy();
          expect(control.title).toBeTruthy();
          expect(control.description).toBeTruthy();
          expect(control.category).toBeTruthy();
        }
      }
    });

    it('DoD 5015.02 includes core requirements C2.1 through C2.9', () => {
      const ids = COMPLIANCE_CONTROLS.dod501502.map(c => c.id);
      for (let i = 1; i <= 9; i++) {
        expect(ids).toContain(`C2.${i}`);
      }
    });

    it('DoD 5015.02 includes optional requirements C3.1 through C3.6', () => {
      const ids = COMPLIANCE_CONTROLS.dod501502.map(c => c.id);
      for (let i = 1; i <= 6; i++) {
        expect(ids).toContain(`C3.${i}`);
      }
    });
  });

  describe('verifyHashChain', () => {
    it('returns true for a valid chain', () => {
      const events = [
        { id: '1', sequenceNum: 1, eventHash: 'hash1', prevHash: '' },
        { id: '2', sequenceNum: 2, eventHash: 'hash2', prevHash: 'hash1' },
        { id: '3', sequenceNum: 3, eventHash: 'hash3', prevHash: 'hash2' },
      ];
      expect(verifyHashChain(events)).toBe(true);
    });

    it('returns false for a broken chain (tampered prevHash)', () => {
      const events = [
        { id: '1', sequenceNum: 1, eventHash: 'hash1', prevHash: '' },
        { id: '2', sequenceNum: 2, eventHash: 'hash2', prevHash: 'WRONG' },
        { id: '3', sequenceNum: 3, eventHash: 'hash3', prevHash: 'hash2' },
      ];
      expect(verifyHashChain(events)).toBe(false);
    });

    it('returns true for a single event (no chain to verify)', () => {
      const events = [{ id: '1', sequenceNum: 1, eventHash: 'hash1', prevHash: '' }];
      expect(verifyHashChain(events)).toBe(true);
    });

    it('returns true for empty array', () => {
      expect(verifyHashChain([])).toBe(true);
    });

    it('returns false when prevHash is null', () => {
      const events = [
        { id: '1', sequenceNum: 1, eventHash: 'hash1', prevHash: '' },
        { id: '2', sequenceNum: 2, eventHash: 'hash2', prevHash: null },
      ];
      expect(verifyHashChain(events as any)).toBe(false);
    });
  });
});
