import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    signatureRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    signatureEnvelope: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/security/ssrf-safe-fetch', () => ({
  ssrfSafeFetch: vi.fn(),
}));

import {
  isDocuSignConfigured,
  isAdobeSignConfigured,
  getDefaultProvider,
  verifyDocusignWebhookSignature,
} from '@/lib/signatures/signature-service';

describe('E-Signature Service', () => {
  describe('Provider configuration', () => {
    it('isDocuSignConfigured returns false when env vars are missing', () => {
      const orig = { ...process.env };
      delete process.env.DOCUSIGN_INTEGRATION_KEY;
      delete process.env.DOCUSIGN_USER_ID;
      delete process.env.DOCUSIGN_ACCOUNT_BASE_URL;
      delete process.env.DOCUSIGN_PRIVATE_KEY;
      expect(isDocuSignConfigured()).toBe(false);
      process.env = orig;
    });

    it('isDocuSignConfigured returns true when all env vars are set', () => {
      const orig = { ...process.env };
      process.env.DOCUSIGN_INTEGRATION_KEY = 'test-key';
      process.env.DOCUSIGN_USER_ID = 'test-user';
      process.env.DOCUSIGN_ACCOUNT_BASE_URL = 'https://demo.docusign.net';
      process.env.DOCUSIGN_PRIVATE_KEY = 'test-private-key';
      expect(isDocuSignConfigured()).toBe(true);
      process.env = orig;
    });

    it('isAdobeSignConfigured returns false when env vars are missing', () => {
      const orig = { ...process.env };
      delete process.env.ADOBE_SIGN_CLIENT_ID;
      delete process.env.ADOBE_SIGN_CLIENT_SECRET;
      delete process.env.ADOBE_SIGN_API_BASE;
      expect(isAdobeSignConfigured()).toBe(false);
      process.env = orig;
    });

    it('isAdobeSignConfigured returns true when all env vars are set', () => {
      const orig = { ...process.env };
      process.env.ADOBE_SIGN_CLIENT_ID = 'test-id';
      process.env.ADOBE_SIGN_CLIENT_SECRET = 'test-secret';
      process.env.ADOBE_SIGN_API_BASE = 'https://api.na1.adobesign.com';
      expect(isAdobeSignConfigured()).toBe(true);
      process.env = orig;
    });

    it('getDefaultProvider returns "docusign" when DocuSign is configured', () => {
      const orig = { ...process.env };
      process.env.DOCUSIGN_INTEGRATION_KEY = 'test-key';
      process.env.DOCUSIGN_USER_ID = 'test-user';
      process.env.DOCUSIGN_ACCOUNT_BASE_URL = 'https://demo.docusign.net';
      process.env.DOCUSIGN_PRIVATE_KEY = 'test-private-key';
      delete process.env.ADOBE_SIGN_CLIENT_ID;
      expect(getDefaultProvider()).toBe('docusign');
      process.env = orig;
    });

    it('getDefaultProvider returns "adobe_sign" when only Adobe Sign is configured', () => {
      const orig = { ...process.env };
      delete process.env.DOCUSIGN_INTEGRATION_KEY;
      process.env.ADOBE_SIGN_CLIENT_ID = 'test-id';
      process.env.ADOBE_SIGN_CLIENT_SECRET = 'test-secret';
      process.env.ADOBE_SIGN_API_BASE = 'https://api.na1.adobesign.com';
      expect(getDefaultProvider()).toBe('adobe_sign');
      process.env = orig;
    });

    it('getDefaultProvider returns "internal" when neither is configured', () => {
      const orig = { ...process.env };
      delete process.env.DOCUSIGN_INTEGRATION_KEY;
      delete process.env.ADOBE_SIGN_CLIENT_ID;
      expect(getDefaultProvider()).toBe('internal');
      process.env = orig;
    });
  });

  describe('Webhook signature verification', () => {
    it('returns false when DOCUSIGN_WEBHOOK_SECRET is not configured', () => {
      const orig = { ...process.env };
      delete process.env.DOCUSIGN_WEBHOOK_SECRET;
      expect(verifyDocusignWebhookSignature('payload', 'signature')).toBe(false);
      process.env = orig;
    });

    it('returns false for a wrong signature', () => {
      const orig = { ...process.env };
      process.env.DOCUSIGN_WEBHOOK_SECRET = 'test-secret';
      expect(verifyDocusignWebhookSignature('payload', 'wrong-signature')).toBe(false);
      process.env = orig;
    });

    it('returns false for empty signature header', () => {
      const orig = { ...process.env };
      process.env.DOCUSIGN_WEBHOOK_SECRET = 'test-secret';
      expect(verifyDocusignWebhookSignature('payload', '')).toBe(false);
      process.env = orig;
    });
  });
});
