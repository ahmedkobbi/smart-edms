/**
 * Smart EDMS — Access recertification campaigns
 * GET  /api/admin/recertification
 * POST /api/admin/recertification   create campaign (auto-generates items per user)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.recertificationCampaign.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
      take: 50,
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dueAt: z.string().datetime().optional(),
  reviewerId: z.string(), // who reviews (typically the security officer)
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_USERS_MANAGE,
    audit: { eventType: 'recertification.create', action: 'create', resourceType: 'recertification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const result = await db.$transaction(async (tx) => {
      const campaign = await tx.recertificationCampaign.create({
        data: {
          tenantId: ctx.tenantId,
          name: body.name,
          description: body.description,
          dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 30 * 24 * 3600_000),
        },
      });

      // Create one item per active user
      const users = await tx.user.findMany({
        where: { tenantId: ctx.tenantId, status: 'active' },
        select: { id: true, name: true, email: true },
      });

      for (const u of users) {
        await tx.recertificationItem.create({
          data: {
            campaignId: campaign.id,
            tenantId: ctx.tenantId,
            userId: u.id,
            reviewerId: body.reviewerId,
            decision: 'pending',
          },
        }).catch(() => {}); // skip duplicates
      }

      return { campaign, userCount: users.length };
    });

    // Notify reviewer — pass count + name in metadata so the i18n template
    // can interpolate them per recipient's locale
    await notify({
      tenantId: ctx.tenantId,
      userId: body.reviewerId,
      type: 'recertification.assigned',
      severity: 'warning',
      link: '/admin/recertification',
      metadata: {
        campaignId: result.campaign.id,
        count: result.userCount,
        name: result.campaign.name,
      },
    });

    return NextResponse.json(result, { status: 201 });
  },
);
