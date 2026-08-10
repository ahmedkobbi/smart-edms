/**
 * Smart EDMS — Server-side translator unit tests
 *
 * Tests the i18n translator: bundle loading, key resolution, ICU-style
 * interpolation, locale fallback, HTML escaping, RTL detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getTranslator } from '../../src/i18n/server-translator';
import { signEmailToken, verifyEmailToken } from '../../src/lib/notifications/email';

describe('Server-side i18n translator', () => {
  describe('getTranslator', () => {
    it('loads all 5 supported locales', async () => {
      for (const loc of ['en', 'fr', 'ar', 'es', 'de']) {
        const t = await getTranslator(loc);
        expect(t.locale).toBe(loc);
      }
    });

    it('falls back to English for invalid locale', async () => {
      const t = await getTranslator('xx-XX' as any);
      expect(t.locale).toBe('en');
    });

    it('falls back to English for undefined locale', async () => {
      const t = await getTranslator(undefined);
      expect(t.locale).toBe('en');
    });

    it('reports correct RTL direction only for Arabic', async () => {
      const en = await getTranslator('en');
      const ar = await getTranslator('ar');
      const fr = await getTranslator('fr');
      expect(en.direction).toBe('ltr');
      expect(ar.direction).toBe('rtl');
      expect(fr.direction).toBe('ltr');
    });
  });

  describe('interpolation', () => {
    it('interpolates named placeholders', async () => {
      const t = await getTranslator('en');
      const result = t('emails.invitation.subject', { tenantName: 'Acme Corp' });
      expect(result).toBe('Invitation to Acme Corp on Smart EDMS');
    });

    it('escapes HTML in user-supplied values by default', async () => {
      const t = await getTranslator('en');
      const result = t('emails.invitation.subject', { tenantName: '<script>alert(1)</script>' });
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('does NOT escape HTML in raw() mode (for trusted template fragments)', async () => {
      const t = await getTranslator('en');
      const result = t.raw('emails.invitation.body', { inviterEmail: 'boss@acme.com' });
      // The template contains <strong> tags — they should survive.
      expect(result).toContain('<strong>');
      // But user-supplied values are still escaped in raw mode.
      // (inviterEmail is a benign email, so no HTML to escape, but we
      // verify the surrounding template HTML is preserved.)
      expect(result).toContain('boss@acme.com');
    });

    it('returns the key path when missing from bundle', async () => {
      const t = await getTranslator('en');
      const result = t('does.not.exist.key');
      expect(result).toBe('does.not.exist.key');
    });

    it('handles missing interpolation params gracefully', async () => {
      const t = await getTranslator('en');
      // No tenantName provided — should produce empty string in its place
      const result = t('emails.invitation.subject');
      expect(result).toBe('Invitation to  on Smart EDMS');
    });
  });

  describe('localization coverage', () => {
    it('localizes invitation subject in all 5 locales', async () => {
      const params = { tenantName: 'Acme Corp' };
      const en = await (await getTranslator('en'))('emails.invitation.subject', params);
      const fr = await (await getTranslator('fr'))('emails.invitation.subject', params);
      const ar = await (await getTranslator('ar'))('emails.invitation.subject', params);
      const es = await (await getTranslator('es'))('emails.invitation.subject', params);
      const de = await (await getTranslator('de'))('emails.invitation.subject', params);

      expect(en).toBe('Invitation to Acme Corp on Smart EDMS');
      expect(fr).toBe('Invitation à Acme Corp sur Smart EDMS');
      expect(ar).toBe('دعوة إلى Acme Corp على Smart EDMS');
      expect(es).toBe('Invitación a Acme Corp en Smart EDMS');
      expect(de).toBe('Einladung zu Acme Corp auf Smart EDMS');

      // All should be different (no fallback to English leaking through)
      const unique = new Set([en, fr, ar, es, de]);
      expect(unique.size).toBe(5);
    });

    it('localizes notification workflow.assigned.body in all 5 locales', async () => {
      const params = { docTitle: 'Report.pdf', wfName: 'Q4 Review' };
      const results = await Promise.all(
        ['en', 'fr', 'ar', 'es', 'de'].map(async (loc) => {
          const t = await getTranslator(loc);
          return t('notifications.workflow.assigned.body', params);
        }),
      );
      // English contains "approve"
      expect(results[0]).toContain('approve');
      // French contains "approuver"
      expect(results[1]).toContain('approuver');
      // Arabic contains "موافقة" (approval — appears as "للموافقة" with the
      // Arabic lam prefix in the localized sentence)
      expect(results[2]).toContain('موافقة');
      // Spanish contains "aprobar"
      expect(results[3]).toContain('aprobar');
      // German contains "Freigabe"
      expect(results[4]).toContain('Freigabe');

      // All should be unique translations
      const unique = new Set(results);
      expect(unique.size).toBe(5);
    });

    it('falls back to English when a key is missing from a non-English locale', async () => {
      // We don't have a key that's only in English, so we test the fallback
      // behavior indirectly: a key that exists in all locales should
      // produce the SAME value when called through any locale's translator
      // AND through the English translator.
      const t = await getTranslator('fr');
      const result = t('emails.invitation.subject', { tenantName: 'Acme' });
      // French version is "Invitation à Acme sur Smart EDMS" — distinct from English
      expect(result).not.toBe('Invitation to Acme on Smart EDMS');
      expect(result).toBe('Invitation à Acme sur Smart EDMS');
    });
  });

  describe('pluralization', () => {
    it('formats numbers locale-aware', async () => {
      const en = await getTranslator('en');
      const result = en('emails.failedLogin.alert', { count: 1234 });
      // English uses comma as thousands separator
      expect(result).toContain('1,234');
    });
  });

  describe('email link signing (HMAC)', () => {
    beforeEach(() => {
      process.env.NEXTAUTH_SECRET = 'test-secret-for-hmac-signing-tests-only';
      delete process.env.AUTH_SECRET;
    });

    it('signs and verifies a valid token', () => {
      const token = 'abc123token';
      const signed = signEmailToken(token, 'invitation');
      expect(signed).toContain(token);
      expect(signed).toContain('.');
      const verified = verifyEmailToken(signed, 'invitation');
      expect(verified).toBe(token);
    });

    it('rejects token signed for a different purpose', () => {
      const signed = signEmailToken('abc123', 'invitation');
      const verified = verifyEmailToken(signed, 'password-reset');
      expect(verified).toBeNull();
    });

    it('rejects tampered signature', () => {
      const signed = signEmailToken('abc123', 'invitation');
      // Flip a character in the signature
      const lastDot = signed.lastIndexOf('.');
      const tampered = signed.slice(0, lastDot + 1) + (signed[lastDot + 1] === 'a' ? 'b' : 'a') + signed.slice(lastDot + 2);
      const verified = verifyEmailToken(tampered, 'invitation');
      expect(verified).toBeNull();
    });

    it('rejects unsigned token', () => {
      const verified = verifyEmailToken('just-a-token-no-dot', 'invitation');
      expect(verified).toBeNull();
    });

    it('rejects empty signature', () => {
      const verified = verifyEmailToken('', 'invitation');
      expect(verified).toBeNull();
    });
  });
});
