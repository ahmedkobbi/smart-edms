/**
 * Smart EDMS — SSRF protection
 *
 * Blocks requests to private/reserved IP ranges and cloud metadata endpoints.
 */

import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const lookup = promisify(dns.lookup);

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]',
  'metadata.google.internal',
];

const PRIVATE_RANGES = [
  /^10\./,           // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,     // 192.168.0.0/16
  /^169\.254\./,     // 169.254.0.0/16 (link-local + cloud metadata)
  /^fc00:/,          // IPv6 unique local
  /^fe80:/,          // IPv6 link-local
  /^::1$/,            // IPv6 loopback
  /^::ffff:10\./,    // IPv4-mapped IPv6 private
  /^::ffff:127\./,
  /^::ffff:169\.254\./,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::ffff:192\.168\./,
];

export function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.includes(lower)) return true;
  if (PRIVATE_RANGES.some((r) => r.test(lower))) return true;
  // Check for IP addresses in private ranges
  if (net.isIP(lower)) {
    if (PRIVATE_RANGES.some((r) => r.test(lower))) return true;
  }
  return false;
}

export function isAllowedOutboundUrl(urlStr: string): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { allowed: false, reason: `Protocol ${parsed.protocol} not allowed` };
    }
    if (isBlockedHost(parsed.hostname)) {
      return { allowed: false, reason: `Host ${parsed.hostname} is blocked (private/reserved)` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }
}

export async function isSafeOutboundUrl(urlStr: string): Promise<{ allowed: boolean; reason?: string }> {
  const basic = isAllowedOutboundUrl(urlStr);
  if (!basic.allowed) return basic;

  // DNS resolution check: resolve hostname and verify IP is not private
  try {
    const parsed = new URL(urlStr);
    if (net.isIP(parsed.hostname)) return { allowed: true }; // Already checked above

    const { address } = await lookup(parsed.hostname);
    if (isBlockedHost(address)) {
      return { allowed: false, reason: `DNS resolves to blocked IP ${address}` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'DNS resolution failed' };
  }
}
