/**
 * Smart EDMS — Summarize document
 * POST /api/documents/:id/summarize
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { summarizeDocument } from '@/lib/ai/analyzer';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AI_SUGGESTION_REQUEST,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'ai.summarize', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    // SECURITY FIX (M-DOC-21): Ownership check. See analyze-pii/route.ts.
    const { canReadDocument } = await import('@/lib/documents/access-control');
    const canRead = await canReadDocument(ctx.userId, ctx.tenantId, params!.id, ctx.session.user.permissions);
    if (!canRead) {
      throw ApiError.notFound('document_not_found', 'Document not found');
    }

    const result = await summarizeDocument(ctx.tenantId, params!.id);

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'ai.summary.created',
      action: 'create',
      resourceType: 'document',
      resourceId: params!.id,
      result: 'allow',
      metadata: { source: result.source, summaryLength: result.summary.length, keyPointCount: result.keyPoints.length },
    });

    return NextResponse.json(result);
  },
);
