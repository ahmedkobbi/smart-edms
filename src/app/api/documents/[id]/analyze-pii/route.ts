/**
 * Smart EDMS — PII detection
 * POST /api/documents/:id/analyze-pii
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { detectPii } from '@/lib/ai/analyzer';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AI_SUGGESTION_REQUEST,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'ai.pii.detect', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const result = await detectPii(ctx.tenantId, params!.id);
    if (result.findings.length === 0) {
      throw ApiError.badRequest('no_pii', 'Document not found or no PII detected');
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'ai.pii.detected',
      action: 'create',
      resourceType: 'document',
      resourceId: params!.id,
      result: 'allow',
      metadata: { totalMatches: result.totalMatches, byType: result.byType, source: result.source },
    });

    return NextResponse.json(result);
  },
);
