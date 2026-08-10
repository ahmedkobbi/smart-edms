/**
 * Smart EDMS — Duplicate detection
 * GET /api/documents/:id/duplicate-check
 *
 * Checks if any other documents in the tenant have versions with the same
 * SHA-256 checksum (exact duplicate) or similar size + name (possible dup).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const currentVersion = doc.versions[0];
    if (!currentVersion) return NextResponse.json({ duplicates: [], nearDuplicates: [] });

    // Exact duplicate: same SHA-256 in a different document
    const exactDupes = await db.documentVersion.findMany({
      where: {
        tenantId: ctx.tenantId,
        checksumSha256: currentVersion.checksumSha256,
        documentId: { not: doc.id },
      },
      include: {
        document: {
          select: {
            id: true, title: true, state: true,
            classification: { select: { code: true, name: true, color: true } },
            owner: { select: { name: true, email: true } },
          },
        },
      },
    });

    // Near duplicate: same file name + similar size (±10%)
    const sizeMin = Math.floor(currentVersion.sizeBytes * 0.9);
    const sizeMax = Math.ceil(currentVersion.sizeBytes * 1.1);
    const nearDupes = await db.documentVersion.findMany({
      where: {
        tenantId: ctx.tenantId,
        fileName: currentVersion.fileName,
        sizeBytes: { gte: sizeMin, lte: sizeMax },
        documentId: { not: doc.id },
        checksumSha256: { not: currentVersion.checksumSha256 }, // exclude exact dupes
      },
      include: {
        document: {
          select: {
            id: true, title: true, state: true,
            classification: { select: { code: true, name: true, color: true } },
            owner: { select: { name: true, email: true } },
          },
        },
      },
      take: 20,
    });

    return NextResponse.json({
      exactDuplicates: exactDupes.map((v) => ({
        documentId: v.document.id,
        documentTitle: v.document.title,
        versionNumber: v.versionNumber,
        state: v.document.state,
        classification: v.document.classification,
        owner: v.document.owner,
        checksumSha256: v.checksumSha256,
        sizeBytes: v.sizeBytes,
        uploadedAt: v.createdAt,
      })),
      nearDuplicates: nearDupes.map((v) => ({
        documentId: v.document.id,
        documentTitle: v.document.title,
        versionNumber: v.versionNumber,
        fileName: v.fileName,
        sizeBytes: v.sizeBytes,
        sizeDiff: Math.abs(v.sizeBytes - currentVersion.sizeBytes),
        checksumSha256: v.checksumSha256,
        uploadedAt: v.createdAt,
      })),
    });
  },
);
