/**
 * Smart EDMS — Documents list & create (upload)
 *
 * POST  /api/documents              multipart upload (new document, v1)
 * GET   /api/documents              list documents (paginated, filtered)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError, ApiContext } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage, buildStorageKey } from '@/lib/storage/file-storage';
import { validateUploadedFile } from '@/lib/storage/file-validation';
import { sha256, sha1 } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { scanFile } from '@/lib/security/malware-scanner';
import { createDocumentDek, encryptWithDek } from '@/lib/storage/envelope-encryption';
import { indexDocumentText } from '@/lib/documents/text-extraction';
import { validateMetadata } from '@/lib/documents/metadata-validator';
import { indexDocument as osIndexDocument } from '@/lib/search/opensearch-service';
import { z } from 'zod';

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  classificationId: z.string().optional(),
  state: z.string().optional(),
  tag: z.string().optional(),
  folderId: z.string().optional(),
  sort: z.enum(['createdAt:desc', 'createdAt:asc', 'title:asc', 'title:desc', 'updatedAt:desc']).default('createdAt:desc'),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx: ApiContext) => {
    const params = listQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(params.classificationId ? { classificationId: params.classificationId } : {}),
      ...(params.state ? { state: params.state } : {}),
      ...(params.folderId ? { folderId: params.folderId } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search } },
              { description: { contains: params.search } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      db.document.count({ where }),
      db.document.findMany({
        where,
        include: {
          classification: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { versions: true, shares: true } },
        },
        orderBy: parseSort(params.sort),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
    ]);

    return NextResponse.json({
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize),
    });
  },
);

function parseSort(sort: string): any {
  const [field, dir] = sort.split(':');
  return { [field]: dir };
}

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_CREATE,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: {
      eventType: 'document.create',
      action: 'create',
      resourceType: 'document',
      alwaysAudit: true,
    },
  },
  async (req: NextRequest, ctx: ApiContext) => {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || file?.name || 'Untitled';
    const description = (formData.get('description') as string) || '';
    const documentType = (formData.get('documentType') as string) || 'generic';
    const classificationId = (formData.get('classificationId') as string) || null;
    const folderId = (formData.get('folderId') as string) || null;
    const tagsStr = (formData.get('tags') as string) || '[]';
    const metadataStr = (formData.get('metadata') as string) || '{}';
    const retentionScheduleId = (formData.get('retentionScheduleId') as string) || null;
    const changeReason = (formData.get('changeReason') as string) || 'Initial upload';

    if (!file) throw ApiError.badRequest('missing_file', 'File is required');
    if (file.size > MAX_UPLOAD_SIZE)
      throw ApiError.badRequest('file_too_large', `File exceeds ${MAX_UPLOAD_SIZE} bytes`);

    // Validate classification exists if provided
    if (classificationId) {
      const cls = await db.classification.findFirst({
        where: { id: classificationId, tenantId: ctx.tenantId },
      });
      if (!cls) throw ApiError.badRequest('invalid_classification', 'Classification not found');
    }

    // Validate folder if provided
    if (folderId) {
      const folder = await db.folder.findFirst({ where: { id: folderId, tenantId: ctx.tenantId } });
      if (!folder) throw ApiError.badRequest('invalid_folder', 'Folder not found');
    }

    // Validate retention schedule if provided
    if (retentionScheduleId) {
      const sched = await db.retentionSchedule.findFirst({
        where: { id: retentionScheduleId, tenantId: ctx.tenantId },
      });
      if (!sched) throw ApiError.badRequest('invalid_retention', 'Retention schedule not found');
    }

    let tags: string[] = [];
    let metadata: Record<string, unknown> = {};
    try {
      tags = JSON.parse(tagsStr);
      if (!Array.isArray(tags)) tags = [];
    } catch {}
    try {
      metadata = JSON.parse(metadataStr);
    } catch {}

    // Read file as buffer for validation + hashing
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const head = buf.subarray(0, Math.min(buf.length, 8192));

    const validation = validateUploadedFile(file.type || 'application/octet-stream', head, file.size);
    if (!validation.ok) {
      throw ApiError.badRequest('invalid_file', validation.error || 'File validation failed', {
        detectedMime: validation.detectedMime,
      });
    }

    const checksumSha256 = sha256(buf);
    const checksumSha1 = sha1(buf);

    // Validate required metadata against tenant schemas
    const metadataValidation = await validateMetadata(ctx.tenantId, documentType, metadata);
    if (!metadataValidation.ok) {
      throw ApiError.badRequest('invalid_metadata', 'Metadata validation failed', {
        errors: metadataValidation.errors,
      });
    }

    // Malware scan (synchronous — fast heuristic; ClamAV would be async via queue)
    const mimeType = validation.detectedMime || file.type;
    const scanResult = await scanFile(ctx.tenantId, 'pending', buf, file.name, mimeType);
    if (scanResult.status === 'infected') {
      await recordAuditEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        actorUserAgent: ctx.userAgent,
        correlationId: ctx.correlationId,
        eventType: 'document.malware.blocked',
        action: 'create',
        resourceType: 'document',
        result: 'deny',
        reason: `Malware detected: ${scanResult.threatName}`,
        metadata: {
          fileName: file.name,
          scanner: scanResult.scanner,
          threat: scanResult.threatName,
        },
      });
      throw ApiError.badRequest('malware_detected', `File rejected: ${scanResult.threatName}`, {
        threat: scanResult.threatName,
        scanner: scanResult.scanner,
      });
    }

    // Create document + version in a transaction
    const storage = getFileStorage();
    const result = await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          title,
          description: description || null,
          documentType,
          classificationId,
          folderId,
          tags: JSON.stringify(tags),
          metadata: JSON.stringify(metadata),
          state: 'draft',
          currentVersion: 1,
          retentionScheduleId,
          retentionStartDate: new Date(),
          retentionDisposeAfter: retentionScheduleId
            ? computeDisposeDate(new Date(), 365) // placeholder; updated below
            : null,
        },
      });

      // Compute retention dispose date from schedule
      if (retentionScheduleId) {
        const sched = await tx.retentionSchedule.findUnique({ where: { id: retentionScheduleId } });
        if (sched) {
          const disposeAfter = computeDisposeDate(new Date(), sched.retentionDays);
          await tx.document.update({
            where: { id: doc.id },
            data: { retentionDisposeAfter: disposeAfter },
          });
        }
      }

      // Generate per-document DEK (envelope encryption)
      const { dek } = await createDocumentDek(ctx.tenantId, doc.id, tx);
      const encrypted = encryptWithDek(dek, buf);

      const versionId = `${doc.id}_v1`;
      const storageKey = buildStorageKey(ctx.tenantId, doc.id, versionId, file.name);
      // Store the encrypted buffer; the IV is recorded in the version row
      const encryptedBuf = Buffer.from(encrypted.ciphertext, 'base64');
      await storage.put(storageKey, encryptedBuf, mimeType, {
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
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          checksumSha256,
          checksumSha1,
          uploadedById: ctx.userId,
          changeReason,
          metadata: JSON.stringify({ ...metadata, _encIv: encrypted.iv }),
        },
      });

      return { doc, version };
    });

    // Index text for full-text search + AI (best-effort, non-blocking)
    indexDocumentText(ctx.tenantId, result.doc.id, result.version.id).catch((err) => {
      console.warn('[text-index] failed:', err);
    });

    // Index in OpenSearch for production-grade FTS (best-effort, non-blocking)
    osIndexDocument(ctx.tenantId, result.doc.id).catch(() => {});

    // Audit log
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
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: result.version.mimeType,
        checksumSha256,
        classificationId,
        documentType,
      },
    });

    await fireWebhook(ctx.tenantId, 'document.created', { documentId: result.doc.id, title: result.doc.title, uploadedBy: ctx.userId });

    return NextResponse.json(
      {
        document: await db.document.findUnique({
          where: { id: result.doc.id },
          include: { classification: true, owner: { select: { id: true, name: true, email: true } } },
        }),
        version: result.version,
      },
      { status: 201 },
    );
  },
);

function computeDisposeDate(start: Date, days: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}
