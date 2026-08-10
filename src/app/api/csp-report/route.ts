/**
 * Smart EDMS — CSP violation reporting endpoint
 * POST /api/csp-report
 *
 * SECURITY FIX (L-INFRA-4): Accepts CSP violation reports from browsers
 * (Content-Security-Policy `report-uri` / `report-to` directives) and
 * forwards them to the structured logger so security teams have visibility
 * into blocked XSS attempts, unauthorized plugin loads, and inline script
 * attempts. Without this endpoint, CSP violations in production browsers
 * are silently dropped.
 *
 * The endpoint is unauthenticated (CSP reports are sent by the browser
 * automatically without credentials) and accepts `application/csp-report`
 * or `application/reports+json` (the Report-To API format).
 *
 * Rate-limited per IP to prevent report-flooding DoS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/config/logger';
import { authRateLimiter } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  // Rate-limit: 30 reports/min/IP — high enough to capture real violations,
  // low enough to prevent flooding.
  const rl = await authRateLimiter.check(`csp-report:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let reports: any[] = [];

    if (contentType.includes('application/reports+json')) {
      // Report-To API format: array of reports
      const body = await req.json();
      reports = Array.isArray(body) ? body : [body];
    } else {
      // Legacy report-uri format: { 'csp-report': { ... } }
      const body = await req.json();
      if (body?.['csp-report']) {
        reports = [{ 'csp-report': body['csp-report'] }];
      }
    }

    for (const report of reports.slice(0, 10)) {
      const csp = report['csp-report'] || report.body || report;
      logger.warn('csp.violation', {
        'document-uri': csp['document-uri']?.slice(0, 200),
        'violated-directive': csp['violated-directive'],
        'effective-directive': csp['effective-directive'],
        'blocked-uri': csp['blocked-uri']?.slice(0, 200),
        'source-file': csp['source-file']?.slice(0, 200),
        'line-number': csp['line-number'],
        'column-number': csp['column-number'],
        'disposition': csp['disposition'], // "enforce" or "report"
        ip,
      });
    }
  } catch {
    // Malformed report — drop silently (browser may be misbehaving)
  }

  // 204 No Content — browser doesn't need a response body
  return new NextResponse(null, { status: 204 });
}

// OPTIONS for CORS preflight (in case CSP reports are sent cross-origin)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
