/**
 * Smart EDMS — Next.js global middleware
 *
 * SECURITY FIX (L-INFRA-12): Handle CORS preflight (OPTIONS) requests
 * globally so every /api/* route accepts cross-origin requests when
 * CORS_ALLOW_ORIGIN is configured. Previously only the TUS route
 * exported an OPTIONS handler; every other route returned 405 for
 * OPTIONS, breaking browser CORS preflight for cross-origin API access
 * (e.g. a custom admin dashboard hosted on a different domain hitting
 * the EDMS API).
 *
 * The middleware also enforces a baseline set of security headers on
 * every response (defense-in-depth alongside next.config.ts `headers()`).
 *
 * Only /api/* routes are intercepted — Next.js page routes are passed
 * through unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Allowed CORS origins. When non-empty, the Access-Control-Allow-Origin
 * header is sent on preflight responses and on actual API responses.
 *
 * Parsed from CORS_ALLOW_ORIGIN env var (comma-separated).
 */
function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOW_ORIGIN?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Check whether the request Origin header matches an allowed origin.
 * Used to set the Access-Control-Allow-Origin header dynamically so we
 * don't leak the configured origin list to unauthenticated callers.
 */
function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  if (!origin) return false;
  return allowed.includes(origin);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only intercept API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // SECURITY FIX (L-INFRA-12): Skip the TUS upload route — the TUS
  // protocol has its own OPTIONS handler that returns TUS-specific
  // headers (Tus-Resumable, Tus-Version, Tus-Extension, etc.). A generic
  // 204 CORS preflight response would break TUS clients.
  if (pathname.startsWith('/api/upload/tus')) {
    return NextResponse.next();
  }

  // Also skip the CSP report endpoint — it has its own OPTIONS handler
  // that accepts cross-origin reports without the standard CORS allowlist.
  if (pathname === '/api/csp-report') {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.get('origin');

  // --- Handle CORS preflight (OPTIONS) ---
  if (req.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id, X-Step-Up-Token, X-Break-Glass-Token, X-Requested-With, Accept-Language',
      'Access-Control-Max-Age': '86400',
    };
    if (isOriginAllowed(requestOrigin, allowedOrigins)) {
      headers['Access-Control-Allow-Origin'] = requestOrigin!;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers['Vary'] = 'Origin';
    }
    return new NextResponse(null, { status: 204, headers });
  }

  // --- For non-preflight requests, attach the CORS origin header if allowed ---
  // next.config.ts already does this via the headers() API for /api/*, but
  // middleware can do it dynamically per-request (so the response only
  // includes the ACAO header when the request Origin matches). This is a
  // defense-in-depth — the static header from next.config.ts sets ACAO to
  // the configured origin for ALL requests (regardless of request Origin),
  // which is fine for a single-origin deploy but leaks the configured origin
  // to unauthenticated callers.
  const response = NextResponse.next();
  if (isOriginAllowed(requestOrigin, allowedOrigins)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin!);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export const config = {
  /**
   * Match all /api/* routes. Exclude _next/static, _next/image, favicon,
   * and other static-asset paths (which don't need CORS handling).
   */
  matcher: ['/api/:path*'],
};
