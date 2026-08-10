/**
 * Smart EDMS — Admin legal holds
 * GET  /api/admin/legal-holds
 * POST /api/admin/legal-holds   { name, reason, caseRef?, documentIds[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.LEGAL_HOLD_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.legalHold.findMany({
      where: { tenantId: ctx.tenantId, releasedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  reason: z.string().min(1).max(1000),
  caseRef: z.string().max(100).optional(),
  documentIds: z.array(z.string()).default([]),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.LEGAL_HOLD_MANAGE,
    audit: { eventType: 'admin.legalhold.create', action: 'create', resourceType: 'legal-hold', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const result = await db.$transaction(async (tx) => {
      const hold = await tx.legalHold.create({
        data: {
          tenantId: ctx.tenantId,
          name: body.name,
          reason: body.reason,
          caseRef: body.caseRef,
          setById: ctx.userId,
        },
      });

      for (const docId of body.documentIds) {
        const doc = await tx.document.findFirst({ where: { id: docId, tenantId: ctx.tenantId } });
        if (!doc) continue;
        await tx.legalHoldDocument.create({
          data: {
            tenantId: ctx.tenantId,
            legalHoldId: hold.id,
            documentId: doc.id,
            addedBy: ctx.userId,
          },
        }).catch(() => {}); // ignore duplicates
        await tx.document.update({
          where: { id: doc.id },
          data: {
            legalHold: true,
            legalHoldReason: body.name,
            legalHoldSetBy: ctx.userId,
            legalHoldSetAt: new Date(),
          },
        });
      }

      return hold;
    });

    const hold = await db.legalHold.findUnique({
      where: { id: result.id },
      include: { _count: { select: { documents: true } } },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.legalhold.create',
      action: 'create',
      resourceType: 'legal-hold',
      resourceId: result.id,
      resourceName: body.name,
      result: 'allow',
      metadata: { caseRef: body.caseRef, documentCount: body.documentIds.length },
    });

    await fireWebhook(ctx.tenantId, 'legalhold.created', { legalHoldId: result.id, name: body.name, reason: body.reason, documentCount: body.documentIds.length });

    return NextResponse.json({ legalHold: hold }, { status: 201 });
  },
);
