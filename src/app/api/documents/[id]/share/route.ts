/**
 * Smart EDMS — Share management for a document
 *
 * GET   /api/documents/:id/share   list shares for this document
 * POST  /api/documents/:id/share   create a new share link
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { hashPassword, randomToken, timingSafeEqualStr } from '@/lib/auth/crypto';
import { z } from 'zod';

const createSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientUserId: z.string().optional(),
  mode: z.enum(['view', 'download', 'review']).default('view'),
  password: z.string().min(8).optional(),
  expiresAt: z.string().datetime().optional(),
  maxViews: z.number().int().min(1).max(1000).optional(),
  watermark: z.boolean().default(true),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SHARE_VIEW },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const shares = await db.share.findMany({
      where: { documentId: doc.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      shares: shares.map((s) => ({
        ...s,
        passwordHash: undefined,
        hasPassword: !!s.passwordHash,
      })),
    });
  },
);

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.SHARE_CREATE,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: { eventType: 'share.create', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = createSchema.parse(await req.json());
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { classification: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (!doc.shareAllowed) {
      throw ApiError.forbidden('sharing_disabled', 'Sharing is disabled for this document');
    }
    if (doc.classification?.code === 'RESTRICTED' || doc.classification?.code === 'HS') {
      throw ApiError.forbidden('sharing_blocked_by_classification', 'External sharing is blocked for this classification');
    }

    const token = randomToken(32);
    const passwordHash = body.password ? await hashPassword(body.password) : null;

    const share = await db.share.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        createdBy: ctx.userId,
        token,
        recipientEmail: body.recipientEmail ?? null,
        recipientUserId: body.recipientUserId ?? null,
        mode: body.mode,
        passwordHash,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxViews: body.maxViews ?? null,
        viewCount: 0,
        watermark: body.watermark,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'share.create',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        shareId: share.id,
        recipientEmail: body.recipientEmail,
        mode: body.mode,
        expiresAt: body.expiresAt,
        hasPassword: !!body.password,
        watermark: body.watermark,
      },
    });

    return NextResponse.json(
      {
        share: {
          ...share,
          passwordHash: undefined,
          hasPassword: !!passwordHash,
          url: `/shared/${token}`,
        },
      },
      { status: 201 },
    );
  },
);

export async function verifySharePassword(share: { passwordHash: string | null }, password?: string): Promise<boolean> {
  if (!share.passwordHash) return true;
  if (!password) return false;
  return timingSafeEqualStr(await hashPassword(password), share.passwordHash) || (await verifyPasswordCompat(share.passwordHash, password));
}

async function verifyPasswordCompat(hash: string, plain: string): Promise<boolean> {
  try {
    const argon2 = (await import('argon2')).default;
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
