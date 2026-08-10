/**
 * Smart EDMS — SSRF guard tests
 */

import { describe, it, expect } from 'vitest';
import { isBlockedHost, isAllowedOutboundUrl } from '@/lib/security/ssrf-guard';

describe('SSRF Guard', () => {
  it('blocks localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('0.0.0.0')).toBe(true);
    expect(isBlockedHost('::1')).toBe(true);
  });

  it('blocks private IP ranges', () => {
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('10.255.255.255')).toBe(true);
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('172.31.255.255')).toBe(true);
    expect(isBlockedHost('192.168.1.1')).toBe(true);
    expect(isBlockedHost('169.254.169.254')).toBe(true);
  });

  it('allows public IPs', () => {
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('1.1.1.1')).toBe(false);
    expect(isBlockedHost('example.com')).toBe(false);
  });

  it('blocks cloud metadata endpoints', () => {
    expect(isBlockedHost('metadata.google.internal')).toBe(true);
  });

  it('blocks non-HTTP protocols', () => {
    expect(isAllowedOutboundUrl('ftp://example.com/file').allowed).toBe(false);
    expect(isAllowedOutboundUrl('file:///etc/passwd').allowed).toBe(false);
    expect(isAllowedOutboundUrl('javascript:alert(1)').allowed).toBe(false);
  });

  it('allows valid HTTPS URLs', () => {
    expect(isAllowedOutboundUrl('https://hooks.slack.com/services/123').allowed).toBe(true);
    expect(isAllowedOutboundUrl('https://api.sendgrid.com/v3/mail/send').allowed).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedOutboundUrl('not a url').allowed).toBe(false);
    expect(isAllowedOutboundUrl('').allowed).toBe(false);
  });

  it('blocks IP ranges in URL form', () => {
    expect(isAllowedOutboundUrl('http://10.0.0.1/steal').allowed).toBe(false);
    expect(isAllowedOutboundUrl('http://192.168.1.1/admin').allowed).toBe(false);
    expect(isAllowedOutboundUrl('http://169.254.169.254/latest/meta-data').allowed).toBe(false);
  });
});
