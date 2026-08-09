/**
 * Smart EDMS — Recertification decision
 * POST /api/admin/recertification/:id/decide   { decision: keep|revoke|change, reason? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { z } from 'zod';

const schema = z.object({
  decision: z.enum(['keep', 'revoke', 'change']),
  reason: z.string().max(500).optional(),
});

export const POST = createApiHandler(
  {},
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());

    const item = await db.recertificationItem.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: { campaign: true },
    });
    if (!item) throw ApiError.notFound('not_found', 'Recertification item not found');
    if (item.reviewerId !== ctx.userId) {
      throw ApiError.forbidden('not_reviewer', 'You are not the assigned reviewer');
    }

    const updated = await db.recertificationItem.update({
      where: { id: item.id },
      data: {
        decision: body.decision,
        reason: body.reason,
        decidedAt: new Date(),
      },
    });

    if (body.decision === 'revoke') {
      await db.user.update({
        where: { id: item.userId },
        data: { status: 'suspended' },
      });
      await db.session.deleteMany({ where: { userId: item.userId } }).catch(() => {});
      await notify({
        tenantId: ctx.tenantId,
        userId: item.userId,
        type: 'recertification.revoked',
        title: 'Access revoked',
        body: `Your access was revoked during recertification campaign "${item.campaign.name}".`,
        severity: 'critical',
        metadata: { campaignId: item.campaignId },
      }).catch(() => {});
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: `recertification.${body.decision}`,
      action: 'update',
      resourceType: 'user',
      resourceId: item.userId,
      result: 'allow',
      reason: body.reason,
      metadata: { campaignId: item.campaignId, decision: body.decision },
    });

    return NextResponse.json({ item: updated });
  },
);
