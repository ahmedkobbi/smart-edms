/**
 * Smart EDMS — Complete resumable upload
 * POST /api/upload/complete
 *
 * Assembles all chunks into a single buffer and creates the document
 * (same as a regular upload but with the assembled buffer).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey } from '@/lib/storage/file-storage';
import { validateUploadedFile } from '@/lib/storage/file-validation';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { scanFile } from '@/lib/security/malware-scanner';
import { createDocumentDek, encryptWithDek } from '@/lib/storage/envelope-encryption';
import { indexDocumentText } from '@/lib/documents/text-extraction';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { uploadSessions } from '../init/route';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    audit: { eventType: 'document.create', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const { uploadId } = await req.json();
    if (!uploadId) throw ApiError.badRequest('missing_uploadId', 'uploadId is required');

    const session = uploadSessions.get(uploadId);
    if (!session) {
      throw ApiError.notFound('upload_not_found', 'Upload session not found or expired');
    }

    if (session.tenantId !== ctx.tenantId || session.userId !== ctx.userId) {
      throw ApiError.forbidden('not_authorized', 'Upload session does not belong to this user');
    }

    if (session.receivedChunks !== session.totalChunks) {
      throw ApiError.badRequest('incomplete', `Only ${session.receivedChunks}/${session.totalChunks} chunks received`);
    }

    // Assemble chunks in order
    const chunks: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      const chunk = session.chunks.get(i);
      if (!chunk) throw ApiError.badRequest('missing_chunk', `Chunk ${i} is missing`);
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);

    // Clean up session
    uploadSessions.delete(uploadId);

    // Validate file
    const head = buf.subarray(0, Math.min(buf.length, 8192));
    const validation = validateUploadedFile(session.mimeType, head, buf.length);
    if (!validation.ok) {
      throw ApiError.badRequest('invalid_file', validation.error || 'File validation failed');
    }

    // Malware scan
    const mimeType = validation.detectedMime || session.mimeType;
    const scanResult = await scanFile(ctx.tenantId, 'pending', buf, session.fileName, mimeType);
    if (scanResult.status === 'infected') {
      throw ApiError.badRequest('malware_detected', `File rejected: ${scanResult.threatName}`);
    }

    const checksumSha256 = sha256(buf);
    const checksumSha1 = sha1(buf);

    const storage = getFileStorage();
    const result = await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          title: session.title,
          description: session.description || null,
          documentType: session.documentType,
          classificationId: session.classificationId,
          tags: JSON.stringify(session.tags),
          metadata: JSON.stringify(session.metadata),
          state: 'draft',
          currentVersion: 1,
        },
      });

      const { dek } = await createDocumentDek(ctx.tenantId, doc.id, tx);
      const encrypted = encryptWithDek(dek, buf);

      const versionId = `${doc.id}_v1`;
      const storageKey = buildStorageKey(ctx.tenantId, doc.id, versionId, session.fileName);
      await storage.put(storageKey, Buffer.from(encrypted.ciphertext, 'base64'), mimeType, {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        version: '1',
        uploadedBy: ctx.userId,
        encrypted: 'true',
        iv: encrypted.iv,
      });

      const version = await tx.documentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          versionNumber: 1,
          storageKey,
          fileName: session.fileName,
          mimeType,
          sizeBytes: buf.length,
          checksumSha256,
          checksumSha1,
          uploadedById: ctx.userId,
          changeReason: 'Resumable upload',
          metadata: JSON.stringify({ ...session.metadata, _encIv: encrypted.iv }),
        },
      });

      return { doc, version };
    });

    indexDocumentText(ctx.tenantId, result.doc.id, result.version.id).catch(() => {});

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'document.upload',
      action: 'create',
      resourceType: 'document',
      resourceId: result.doc.id,
      resourceName: result.doc.title,
      result: 'allow',
      metadata: {
        versionId: result.version.id,
        fileName: session.fileName,
        sizeBytes: buf.length,
        mimeType,
        checksumSha256,
        method: 'resumable',
        chunks: session.totalChunks,
      },
    });

    return NextResponse.json({ document: result.doc, version: result.version }, { status: 201 });
  },
);
