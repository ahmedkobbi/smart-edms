/**
 * Smart EDMS — Audit chain integrity verification
 * GET /api/audit/verify
 *
 * Walks the per-tenant audit chain and reports any broken hash links.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { verifyAuditChain } from '@/lib/audit/audit-service';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AUDIT_VERIFY_INTEGRITY,
    // SECURITY FIX (M-ADM-1): Rate-limit chain verification. Each call walks
    // up to `limit` audit rows, recomputes SHA-256 for each, and holds them
    // in memory — without a cap, a compromised auditor account could OOM
    // the worker by spamming `?limit=99999999`.
    rateLimit: { max: 2, windowMs: 60_000 },
    audit: { eventType: 'audit.verify', action: 'read', resourceType: 'audit', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const limitParam = req.nextUrl.searchParams.get('limit');
    // SECURITY FIX (M-ADM-1): Cap limit at 50 000 — previously accepted any
    // integer (including 100M+), which let an attacker load every audit row
    // + hash them on each request. The cap bounds CPU + memory per request.
    const MAX_VERIFY_LIMIT = 50_000;
    const requested = limitParam ? parseInt(limitParam, 10) : 10_000;
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_VERIFY_LIMIT)
      : 10_000;

    const result = await verifyAuditChain(ctx.tenantId, { limit });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'audit.verify.result',
      action: 'read',
      resourceType: 'audit',
      result: result.ok ? 'allow' : 'error',
      metadata: {
        verifiedCount: result.verifiedCount,
        ok: result.ok,
        brokenAt: result.brokenAt ?? null,
      },
    });

    return NextResponse.json(result);
  },
);
