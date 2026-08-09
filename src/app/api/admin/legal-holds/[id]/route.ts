/**
 * Smart EDMS — Admin legal hold detail
 * GET    /api/admin/legal-holds/:id
 * PATCH  /api/admin/legal-holds/:id   { documentIds[] to add }
 * DELETE /api/admin/legal-holds/:id   release hold (clears legalHold flag on documents)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.LEGAL_HOLD_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const hold = await db.legalHold.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: {
        documents: {
          include: {
            document: { select: { id: true, title: true, state: true, classification: { select: { code: true, name: true, color: true } } } },
          },
        },
      },
    });
    if (!hold) throw ApiError.notFound('not_found', 'Legal hold not found');
    return NextResponse.json({ legalHold: hold });
  },
);

const patchSchema = z.object({
  addDocumentIds: z.array(z.string()).default([]),
  releaseReason: z.string().optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.LEGAL_HOLD_MANAGE,
    audit: { eventType: 'admin.legalhold.update', action: 'update', resourceType: 'legal-hold', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const hold = await db.legalHold.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!hold) throw ApiError.notFound('not_found', 'Legal hold not found');
    if (hold.releasedAt) throw ApiError.badRequest('already_released', 'Hold has been released');

    for (const docId of body.addDocumentIds) {
      const doc = await db.document.findFirst({ where: { id: docId, tenantId: ctx.tenantId } });
      if (!doc) continue;
      await db.legalHoldDocument.upsert({
        where: { legalHoldId_documentId: { legalHoldId: hold.id, documentId: doc.id } },
        update: {},
        create: { tenantId: ctx.tenantId, legalHoldId: hold.id, documentId: doc.id, addedBy: ctx.userId },
      });
      if (!doc.legalHold) {
        await db.document.update({
          where: { id: doc.id },
          data: {
            legalHold: true,
            legalHoldReason: hold.name,
            legalHoldSetBy: ctx.userId,
            legalHoldSetAt: new Date(),
          },
        });
      }
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.legalhold.update',
      action: 'update',
      resourceType: 'legal-hold',
      resourceId: hold.id,
      resourceName: hold.name,
      result: 'allow',
      metadata: { addedDocumentCount: body.addDocumentIds.length },
    });

    return NextResponse.json({ ok: true });
  },
);

export const DELETE = createApiHandler(
  {
    requiredPermission: PERMISSIONS.LEGAL_HOLD_RELEASE,
    audit: { eventType: 'admin.legalhold.release', action: 'delete', resourceType: 'legal-hold', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const reason = req.nextUrl.searchParams.get('reason') || 'Released by admin';
    const hold = await db.legalHold.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!hold) throw ApiError.notFound('not_found', 'Legal hold not found');
    if (hold.releasedAt) throw ApiError.badRequest('already_released', 'Hold already released');

    await db.$transaction(async (tx) => {
      await tx.legalHold.update({
        where: { id: hold.id },
        data: { releasedAt: new Date(), releasedBy: ctx.userId, releaseReason: reason },
      });

      // Find docs still on this hold; check if they're on other active holds
      const holdDocs = await tx.legalHoldDocument.findMany({
        where: { legalHoldId: hold.id },
        select: { documentId: true },
      });
      for (const hd of holdDocs) {
        const otherActiveHolds = await tx.legalHoldDocument.count({
          where: {
            documentId: hd.documentId,
            legalHold: { releasedAt: null, tenantId: ctx.tenantId },
            legalHoldId: { not: hold.id },
          },
        });
        if (otherActiveHolds === 0) {
          await tx.document.update({
            where: { id: hd.documentId },
            data: {
              legalHold: false,
              legalHoldReason: null,
              legalHoldSetBy: null,
              legalHoldSetAt: null,
            },
          });
        }
      }
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.legalhold.release',
      action: 'delete',
      resourceType: 'legal-hold',
      resourceId: hold.id,
      resourceName: hold.name,
      result: 'allow',
      reason,
      metadata: { caseRef: hold.caseRef },
    });

    return NextResponse.json({ ok: true });
  },
);
