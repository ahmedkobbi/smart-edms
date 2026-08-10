/**
 * Smart EDMS — SSRF-safe outbound fetch with DNS pinning
 *
 * SECURITY FIX (L-INFRA-7): The previous SSRF guard (`isSafeOutboundUrl`)
 * resolved DNS to verify the IP was not private, but the actual `fetch()`
 * used the original URL with the hostname. Between the DNS check and the
 * fetch, an attacker controlling the authoritative DNS server could
 * re-bind the hostname to 127.0.0.1 (DNS rebinding) — the fetch would
 * then connect to the internal service.
 *
 * This module provides `ssrfSafeFetch()` which:
 *
 *   1. Resolves the hostname ONCE via `dns.lookup`.
 *   2. Verifies the resolved IP is not in a private/blocked range
 *      (reusing the existing `isBlockedHost` check).
 *   3. Uses undici's `Agent` with a custom `connect.lookup` function that
 *      returns the PINNED IP — so even if DNS is re-bound between the
 *      check and the actual TCP connect, the connection still goes to the
 *      verified IP.
 *   4. For HTTPS URLs, the TLS Server Name Indication (SNI) + cert
 *      verification use the ORIGINAL hostname (via `servername` in
 *      `connect` options), so certificate validation still works.
 *
 * This eliminates the DNS-rebinding TOCTOU window entirely.
 *
 * Usage:
 *   import { ssrfSafeFetch } from '@/lib/security/ssrf-safe-fetch';
 *   const res = await ssrfSafeFetch(url, { method: 'POST', ... });
 *
 * For webhook delivery and SSO callbacks, this replaces the bare `fetch()`
 * call so the SSRF guard is enforced AT the network layer, not just at
 * the URL inspection layer.
 */

import { Agent, fetch, type Dispatcher, type Response as UndiciResponse } from 'undici';
import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';
import { isBlockedHost } from './ssrf-guard';
import { logger } from '@/lib/config/logger';

const lookup = promisify(dns.lookup);

// Cache of agents per (protocol, hostname) so we don't create a new TLS
// context for every request. Agents are reused for the lifetime of the
// process. The connect.lookup function inside each agent pins to the IP
// that was verified at agent-creation time. If the IP needs to change
// (e.g. legitimate DNS rotation), the agent is invalidated and recreated
// — see the `refreshPinnedAgent` helper below.
interface PinnedAgent {
  agent: Dispatcher;
  ip: string;
  hostname: string;
  createdAt: number;
}

const agentCache = new Map<string, PinnedAgent>();
const AGENT_TTL_MS = 5 * 60 * 1000; // re-resolve DNS every 5 min to pick up legitimate rotation

/**
 * Resolve + verify + pin a hostname to a single IP. Returns an undici
 * Dispatcher that will only ever connect to that IP.
 */
async function getPinnedAgent(url: URL): Promise<{ agent: Dispatcher; ip: string }> {
  const hostname = url.hostname;
  const protocol = url.protocol;
  const cacheKey = `${protocol}//${hostname}`;

  const cached = agentCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.createdAt < AGENT_TTL_MS) {
    return { agent: cached.agent, ip: cached.ip };
  }

  // Resolve DNS (returns first A/AAAA record)
  let resolvedIp: string;
  try {
    const result = await lookup(hostname);
    resolvedIp = result.address;
  } catch (err) {
    logger.warn('ssrf_safe_fetch.dns_failed', { hostname, error: (err as Error).message });
    throw new SsrfError(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
  }

  // Verify the resolved IP is not in a blocked range
  if (isBlockedHost(resolvedIp)) {
    logger.warn('ssrf_safe_fetch.blocked_ip', { hostname, ip: resolvedIp });
    throw new SsrfError(`Resolved IP ${resolvedIp} is in a blocked range (private/reserved)`);
  }

  // Build a custom lookup function that ALWAYS returns the pinned IP,
  // regardless of what DNS returns at connect time. This is the key
  // defense against DNS rebinding: even if an attacker re-binds the
  // hostname to 127.0.0.1 between the check and the connect, undici
  // calls our lookup function which returns the verified IP.
  const pinnedLookup = (
    _hostname: string,
    _options: dns.LookupOneOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    const family = net.isIPv4(resolvedIp) ? 4 : 6;
    callback(null, resolvedIp, family);
  };

  // For HTTPS, set `servername` so SNI + cert validation use the original
  // hostname (not the IP). This preserves TLS security.
  const isTls = protocol === 'https:';
  const agent = new Agent({
    connect: {
      lookup: pinnedLookup as any,
      ...(isTls ? { servername: hostname } : {}),
      // Timeout the connect phase so a hung target doesn't tie up the agent.
      timeout: 10_000,
    },
    // Allow keep-alive for performance
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });

  const entry: PinnedAgent = { agent, ip: resolvedIp, hostname, createdAt: now };
  agentCache.set(cacheKey, entry);
  logger.debug('ssrf_safe_fetch.pinned', { hostname, ip: resolvedIp, tls: isTls });
  return { agent, ip: resolvedIp };
}

/**
 * Custom Error class so callers can distinguish SSRF rejections from
 * network errors.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * SSRF-safe fetch. Mirrors the global `fetch` API but enforces DNS
 * pinning — the hostname is resolved ONCE, the IP is verified against
 * the blocked-host list, and the actual TCP/TLS connection is forced
 * to that IP via a custom undici Agent.
 *
 * @param url The URL to fetch. Must be http: or https:.
 * @param init Standard fetch init options. The `dispatcher` option is
 *            overridden internally — caller cannot bypass the pinned agent.
 * @throws {SsrfError} if the URL is invalid, DNS resolution fails, or the
 *                     resolved IP is in a blocked range.
 */
export async function ssrfSafeFetch(
  url: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<UndiciResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SsrfError(`Protocol ${parsed.protocol} not allowed (only http/https)`);
  }

  // Quick string-level host check first (catches `localhost` without a DNS round-trip)
  if (isBlockedHost(parsed.hostname)) {
    throw new SsrfError(`Host ${parsed.hostname} is blocked (private/reserved)`);
  }

  // Get a pinned agent (resolves DNS + verifies IP + creates Agent)
  const { agent, ip } = await getPinnedAgent(parsed);

  logger.debug('ssrf_safe_fetch.request', {
    hostname: parsed.hostname,
    pinnedIp: ip,
    path: parsed.pathname,
    method: init?.method || 'GET',
  });

  // Use undici's fetch with the pinned dispatcher. We pass through the
  // caller's init options (method, headers, body, signal) unchanged.
  try {
    return await fetch(url, {
      ...(init as any),
      method: init?.method,
      headers: init?.headers as any,
      body: init?.body as any,
      signal: init?.signal,
      // undici-specific option — overrides the global dispatcher with our
      // pinned agent. The cast bypasses the standard RequestInit type
      // which doesn't include `dispatcher`.
      dispatcher: agent,
    } as any);
  } catch (err) {
    // If the connection fails, invalidate the cached agent so the next
    // call re-resolves DNS (the pinned IP may have gone stale).
    const cacheKey = `${parsed.protocol}//${parsed.hostname}`;
    agentCache.delete(cacheKey);
    throw err;
  }
}

/**
 * Invalidate the cached pinned agent for a hostname. Useful when the
 * caller knows the IP has legitimately changed (e.g. after a webhook
 * URL update). The next `ssrfSafeFetch` call will re-resolve + re-pin.
 */
export function refreshPinnedAgent(hostname: string): void {
  for (const key of agentCache.keys()) {
    if (key.endsWith(`//${hostname}`)) {
      agentCache.delete(key);
    }
  }
}
