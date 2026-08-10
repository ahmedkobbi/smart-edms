/**
 * Smart EDMS — Document download
 *
 * GET /api/documents/:id/download?version=N
 *
 * Returns a short-lived signed URL for the file. The signed URL points to
 * /api/storage/resolve which streams the bytes (local adapter) or redirects
 * to a presigned S3 URL (S3 adapter).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { getFileStorage } from '@/lib/storage/file-storage';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_DOWNLOAD,
    audit: { eventType: 'document.download', action: 'download', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { classification: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (!doc.downloadAllowed) {
      throw ApiError.forbidden('download_disabled', 'Download is disabled for this document');
    }

    // HS classification requires admin/security officer
    if (doc.classification?.code === 'HS' &&
        !hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_VIEW)) {
      throw ApiError.forbidden('hs_download_forbidden', 'Highly Sensitive downloads require admin privileges');
    }

    const versionNum = req.nextUrl.searchParams.get('version')
      ? parseInt(req.nextUrl.searchParams.get('version')!, 10)
      : doc.currentVersion;

    const version = await db.documentVersion.findFirst({
      where: { documentId: doc.id, versionNumber: versionNum, tenantId: ctx.tenantId },
    });
    if (!version) throw ApiError.notFound('version_not_found', 'Version not found');

    const storage = getFileStorage();
    const url = await storage.getSignedDownloadUrl(
      version.storageKey,
      60, // 60s
      version.fileName,
    );

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.download',
      action: 'download',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        versionNumber: version.versionNumber,
        fileName: version.fileName,
        sizeBytes: version.sizeBytes,
        checksumSha256: version.checksumSha256,
      },
    });

    return NextResponse.json({ url, expiresInSeconds: 60, fileName: version.fileName });
  },
);
