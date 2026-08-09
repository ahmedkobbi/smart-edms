/**
 * Smart EDMS — Metadata extraction suggestions
 * POST /api/documents/:id/extract-metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { extractMetadataSuggestions } from '@/lib/ai/analyzer';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AI_SUGGESTION_REQUEST,
    rateLimit: { max: 10, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx, params) => {
    const result = await extractMetadataSuggestions(ctx.tenantId, params!.id);

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'ai.metadata.suggested',
      action: 'create',
      resourceType: 'document',
      resourceId: params!.id,
      result: 'allow',
      metadata: { fields: Object.keys(result.suggestions), source: result.source },
    });

    return NextResponse.json(result);
  },
);
