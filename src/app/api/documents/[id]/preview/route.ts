/**
 * Smart EDMS — In-browser document preview
 * GET /api/documents/:id/preview
 *
 * Returns a signed URL for inline viewing (Content-Disposition: inline).
 * For HS/Restricted classifications, the URL contains a watermark flag
 * which the storage resolver applies as an overlay.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { getFileStorage } from '@/lib/storage/file-storage';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_PREVIEW,
    audit: { eventType: 'document.preview', action: 'read', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { classification: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (!doc.previewAllowed) {
      throw ApiError.forbidden('preview_disabled', 'Preview is disabled for this document');
    }

    const version = doc.versions[0];
    if (!version) throw ApiError.notFound('no_version', 'No version available');

    const storage = getFileStorage();
    const url = await storage.getSignedDownloadUrl(version.storageKey, 60);

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.previewed',
      action: 'read',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        versionNumber: version.versionNumber,
        classification: doc.classification?.code ?? null,
        watermark: doc.watermarkEnabled,
      },
    });

    return NextResponse.json({
      url,
      expiresInSeconds: 60,
      fileName: version.fileName,
      mimeType: version.mimeType,
      watermark: doc.watermarkEnabled,
      watermarkText: doc.watermarkEnabled
        ? `${ctx.session.user.email} • ${new Date().toISOString()} • ${doc.id.slice(-8)}`
        : null,
      noDownload: !doc.downloadAllowed,
      classification: doc.classification
        ? { code: doc.classification.code, name: doc.classification.name, color: doc.classification.color }
        : null,
    });
  },
);
