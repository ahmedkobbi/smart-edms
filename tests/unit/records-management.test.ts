import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    recordCategory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    recordFolder: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    vitalRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    dispositionAuthority: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    dispositionRecord: {
      create: vi.fn(),
    },
    document: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { DOD_REQUIREMENTS } from '@/lib/records/records-management';

describe('DoD 5015.02 Records Management', () => {
  describe('DOD_REQUIREMENTS', () => {
    it('contains all core requirements C2.1 through C2.9', () => {
      for (let i = 1; i <= 9; i++) {
        expect(DOD_REQUIREMENTS).toHaveProperty(`C2.${i}`);
      }
    });

    it('contains all optional requirements C3.1 through C3.6', () => {
      for (let i = 1; i <= 6; i++) {
        expect(DOD_REQUIREMENTS).toHaveProperty(`C3.${i}`);
      }
    });

    it('all requirements are marked as implemented', () => {
      for (const [id, req] of Object.entries(DOD_REQUIREMENTS)) {
        expect(req.implemented).toBe(true);
        expect(req.evidence).toBeTruthy();
        expect(req.title).toBeTruthy();
        expect(req.description).toBeTruthy();
      }
    });

    it('C2.1 is Records Management Application', () => {
      expect(DOD_REQUIREMENTS['C2.1'].title).toBe('Records Management Application');
    });

    it('C2.7 is Vital Records', () => {
      expect(DOD_REQUIREMENTS['C2.7'].title).toBe('Vital Records');
    });

    it('C2.8 is Legal Hold', () => {
      expect(DOD_REQUIREMENTS['C2.8'].title).toBe('Legal Hold');
    });

    it('C2.9 is Audit Trail', () => {
      expect(DOD_REQUIREMENTS['C2.9'].title).toBe('Audit Trail');
    });

    it('C3.1 is Folder and File Plan Management', () => {
      expect(DOD_REQUIREMENTS['C3.1'].title).toBe('Folder and File Plan Management');
    });

    it('C3.3 is Records Disposition', () => {
      expect(DOD_REQUIREMENTS['C3.3'].title).toBe('Records Disposition');
    });

    it('C3.5 is Records Version Control', () => {
      expect(DOD_REQUIREMENTS['C3.5'].title).toBe('Records Version Control');
    });

    it('C3.6 is Records Redaction', () => {
      expect(DOD_REQUIREMENTS['C3.6'].title).toBe('Records Redaction');
    });

    it('C2.7 evidence mentions VitalRecord model', () => {
      expect(DOD_REQUIREMENTS['C2.7'].evidence).toContain('VitalRecord');
    });

    it('C2.8 evidence mentions LegalHold model', () => {
      expect(DOD_REQUIREMENTS['C2.8'].evidence).toContain('LegalHold');
    });

    it('C2.9 evidence mentions hash chain', () => {
      expect(DOD_REQUIREMENTS['C2.9'].evidence.toLowerCase()).toContain('hash');
    });

    it('C3.3 evidence mentions DispositionRecord model', () => {
      expect(DOD_REQUIREMENTS['C3.3'].evidence).toContain('DispositionRecord');
    });

    it('C3.5 evidence mentions DocumentVersion model', () => {
      expect(DOD_REQUIREMENTS['C3.5'].evidence).toContain('DocumentVersion');
    });

    it('C3.6 evidence mentions Redaction model', () => {
      expect(DOD_REQUIREMENTS['C3.6'].evidence).toContain('Redaction');
    });

    it('has exactly 15 requirements total (9 core + 6 optional)', () => {
      expect(Object.keys(DOD_REQUIREMENTS)).toHaveLength(15);
    });
  });
});
