/**
 * Smart EDMS — Public share view
 *
 * GET /api/shares/:token               verify share + return document metadata
 * POST /api/shares/:token/view         { password? } → returns signed URL + records view
 *
 * No authentication required — the token IS the credential.
 * Enforces: expiry, view count, password, watermark.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { getFileStorage } from '@/lib/storage/file-storage';
import { ApiError } from '@/lib/api/handler';
import argon2 from 'argon2';
import { z } from 'zod';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await db.share.findUnique({
    where: { token },
    include: {
      document: {
        include: { classification: true, owner: { select: { name: true } } },
      },
    },
  });
  if (!share) return NextResponse.json({ error: { code: 'not_found', message: 'Share not found' } }, { status: 404 });
  if (share.revokedAt) return NextResponse.json({ error: { code: 'revoked', message: 'Share has been revoked' } }, { status: 410 });
  if (share.expiresAt && share.expiresAt < new Date())
    return NextResponse.json({ error: { code: 'expired', message: 'Share has expired' } }, { status: 410 });
  if (share.maxViews && share.viewCount >= share.maxViews)
    return NextResponse.json({ error: { code: 'max_views', message: 'Maximum views reached' } }, { status: 410 });
  if (share.document.deletedAt)
    return NextResponse.json({ error: { code: 'document_deleted', message: 'Document no longer available' } }, { status: 410 });

  return NextResponse.json({
    share: {
      token: share.token,
      mode: share.mode,
      hasPassword: !!share.passwordHash,
      expiresAt: share.expiresAt,
      watermark: share.watermark,
      viewCount: share.viewCount,
      maxViews: share.maxViews,
      document: {
        id: share.document.id,
        title: share.document.title,
        description: share.document.description,
        classification: share.document.classification
          ? {
              code: share.document.classification.code,
              name: share.document.classification.name,
              color: share.document.classification.color,
            }
          : null,
        ownerName: share.document.owner?.name ?? null,
      },
    },
  });
}

const viewSchema = z.object({
  password: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = viewSchema.parse(await req.json().catch(() => ({})));

  const share = await db.share.findUnique({
    where: { token },
    include: {
      document: { include: { classification: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
    },
  });
  if (!share) return NextResponse.json({ error: { code: 'not_found', message: 'Share not found' } }, { status: 404 });
  if (share.revokedAt) return NextResponse.json({ error: { code: 'revoked', message: 'Share revoked' } }, { status: 410 });
  if (share.expiresAt && share.expiresAt < new Date())
    return NextResponse.json({ error: { code: 'expired', message: 'Share expired' } }, { status: 410 });
  if (share.maxViews && share.viewCount >= share.maxViews)
    return NextResponse.json({ error: { code: 'max_views', message: 'Maximum views reached' } }, { status: 410 });

  if (share.passwordHash) {
    if (!body.password) return NextResponse.json({ error: { code: 'password_required', message: 'Password required' } }, { status: 401 });
    try {
      const ok = await argon2.verify(share.passwordHash, body.password);
      if (!ok) return NextResponse.json({ error: { code: 'invalid_password', message: 'Invalid password' } }, { status: 403 });
    } catch {
      return NextResponse.json({ error: { code: 'invalid_password', message: 'Invalid password' } }, { status: 403 });
    }
  }

  const version = share.document.versions[0];
  if (!version) return NextResponse.json({ error: { code: 'no_version', message: 'No file available' } }, { status: 404 });

  const storage = getFileStorage();
  const mode = share.mode === 'download' ? 'attachment' : 'inline';
  const url = await storage.getSignedDownloadUrl(version.storageKey, 60, mode === 'inline' ? undefined : version.fileName);

  await db.share.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  });

  // Audit (tenant-scoped, no actor)
  await recordAuditEvent({
    tenantId: share.tenantId,
    eventType: 'share.view',
    action: 'read',
    resourceType: 'document',
    resourceId: share.document.id,
    resourceName: share.document.title,
    result: 'allow',
    reason: `share:${share.id}`,
    actorEmail: share.recipientEmail ?? 'anonymous',
    actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    actorUserAgent: req.headers.get('user-agent') ?? 'unknown',
    metadata: { shareId: share.id, mode: share.mode, versionNumber: version.versionNumber },
  });

  return NextResponse.json({
    url,
    expiresInSeconds: 60,
    mode: share.mode,
    watermark: share.watermark,
    watermarkText: share.watermark
      ? `${share.recipientEmail ?? 'Anonymous'} • ${new Date().toISOString()} • ${share.token.slice(0, 8)}`
      : null,
    document: {
      id: share.document.id,
      title: share.document.title,
      classification: share.document.classification
        ? {
            code: share.document.classification.code,
            name: share.document.classification.name,
            color: share.document.classification.color,
          }
        : null,
    },
  });
}
