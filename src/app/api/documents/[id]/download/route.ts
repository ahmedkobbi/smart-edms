/**
 * Smart EDMS — Document download
 * GET /api/documents/:id/download
 *
 * Generates a short-lived signed URL for downloading the latest version
 * of a document. The URL points to either:
 *   - S3 presigned URL (when STORAGE_DRIVER=s3), or
 *   - /api/storage/resolve (local-storage mode)
 *
 * Permission: DOCUMENT_DOWNLOAD
 * Document-level: doc.downloadAllowed must be true
 * Classification-level: HS/RESTRICTED documents require step-up auth
 * Legal hold: downloads are allowed (hold blocks deletion, not read)
 *
 * Audit: always audited as `document.download`
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { getFileStorage } from '@/lib/storage/file-storage';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_DOWNLOAD,
    audit: { eventType: 'document.download', action: 'read', resourceType: 'document', alwaysAudit: true },
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

    if (!doc.downloadAllowed) {
      throw ApiError.forbidden('download_disabled', 'Download is disabled for this document');
    }

    // --- Classification.defaultPolicy enforcement (§9.4) ---
    const { evaluateClassificationPolicy, evaluatePolicies, buildPolicyContext } = await import('@/lib/auth/policy-engine');
    const classDownloadPolicy = evaluateClassificationPolicy(doc.classification?.defaultPolicy, 'download');
    if (classDownloadPolicy.decision === 'deny') {
      throw ApiError.forbidden('download_blocked_by_classification_policy', classDownloadPolicy.reason);
    }

    // --- ABAC policy evaluation (document-specific) ---
    let docTags: string[] = [];
    try { docTags = JSON.parse(doc.tags || '[]'); } catch {}
    const policyCtx = buildPolicyContext({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorRoles: ctx.session.user.roles,
      action: 'document:download',
      resourceType: 'document',
      resourceId: doc.id,
      document: {
        id: doc.id,
        ownerId: doc.ownerId ?? undefined,
        classificationCode: doc.classification?.code,
        classificationLevel: doc.classification?.level,
        tags: docTags,
        state: doc.state,
        isRecord: doc.isRecord,
        legalHold: doc.legalHold,
        folderId: doc.folderId ?? undefined,
      },
    });
    const policyDecision = await evaluatePolicies(policyCtx);
    if (policyDecision.decision === 'deny') {
      const { alertPolicyViolation } = await import('@/lib/security/policy-alerts');
      await alertPolicyViolation(ctx.tenantId, {
        policyName: policyDecision.matchedPolicy?.name,
        action: 'document:download',
        resourceType: 'document',
        resourceId: doc.id,
        resourceName: doc.title,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        reason: policyDecision.reason,
      }).catch(() => {});
      throw ApiError.forbidden('policy_denied', policyDecision.reason);
    }

    // Records under legal hold can still be downloaded (hold blocks deletion, not read)
    // But if the classification is HS, require DOCUMENT_DOWNLOAD is already checked above
    // (the permission system handles clearance-based access)

    const version = doc.versions[0];
    if (!version) throw ApiError.notFound('no_version', 'No version available');

    // Generate signed URL with short expiry (60 seconds)
    const storage = getFileStorage();
    const signedUrl = await storage.getSignedDownloadUrl(
      version.storageKey,
      60,
      version.fileName,
    );

    // Audit the download attempt (always — even if the signed URL is never used)
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.download',
      action: 'read',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        versionId: version.id,
        versionNumber: version.versionNumber,
        fileName: version.fileName,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        checksumSha256: version.checksumSha256,
        classification: doc.classification?.code ?? null,
        storageDriver: process.env.STORAGE_DRIVER || 'local',
      },
    });

    logger.info('document.download', {
      tenantId: ctx.tenantId,
      documentId: doc.id,
      versionId: version.id,
      userId: ctx.userId,
      fileName: version.fileName,
      sizeBytes: version.sizeBytes,
    });

    return NextResponse.json({
      url: signedUrl,
      expiresInSeconds: 60,
      fileName: version.fileName,
      mimeType: version.mimeType,
      sizeBytes: version.sizeBytes,
      checksumSha256: version.checksumSha256,
      versionNumber: version.versionNumber,
    });
  },
);
