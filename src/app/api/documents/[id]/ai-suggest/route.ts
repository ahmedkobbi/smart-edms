/**
 * Smart EDMS — Document AI classification suggestion
 *
 * POST /api/documents/:id/ai-suggest   request AI classification suggestion
 *
 * The suggestion is stored on the document and requires a separate human
 * approval (PATCH /api/documents/:id/classify with approvedSuggestion=true).
 *
 * Heuristic fallback: scans filename + metadata for keywords.
 * If AI_API_KEY is set, calls z-ai-web-dev-sdk for richer suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { suggestClassification } from '@/lib/ai/classifier';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AI_SUGGESTION_REQUEST,
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: { eventType: 'ai.suggestion.request', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        classification: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const classifications = await db.classification.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { level: 'asc' },
    });

    const suggestion = await suggestClassification({
      tenantId: ctx.tenantId,
      documentId: doc.id,
      title: doc.title,
      description: doc.description,
      documentType: doc.documentType,
      tags: JSON.parse(doc.tags || '[]'),
      metadata: JSON.parse(doc.metadata || '{}'),
      fileName: doc.versions[0]?.fileName ?? '',
      mimeType: doc.versions[0]?.mimeType ?? '',
      classifications,
    });

    const updated = await db.document.update({
      where: { id: doc.id },
      data: {
        aiClassificationSuggested: suggestion.code,
        aiClassificationReason: suggestion.reason,
        aiSuggestionState: 'pending',
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'ai.suggestion.created',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        suggested: suggestion.code,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        source: suggestion.source,
      },
    });

    return NextResponse.json({
      suggestion: {
        code: suggestion.code,
        name: suggestion.name,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        source: suggestion.source,
        requiresHumanApproval: true,
      },
      document: updated,
    });
  },
);
