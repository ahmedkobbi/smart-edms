/**
 * Smart EDMS — Groups API
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.group.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true, policies: true } } },
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).default([]),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_GROUPS_MANAGE,
    audit: { eventType: 'admin.group.create', action: 'create', resourceType: 'group', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.group.findFirst({ where: { name: body.name, tenantId: ctx.tenantId } });
    if (existing) throw ApiError.conflict('exists', 'Group with this name already exists');

    const group = await db.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { tenantId: ctx.tenantId, name: body.name, description: body.description },
      });
      if (body.memberIds.length > 0) {
        for (const userId of body.memberIds) {
          const user = await tx.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId } });
          if (!user) continue;
          await tx.groupMember.create({
            data: { tenantId: ctx.tenantId, groupId: g.id, userId },
          }).catch(() => {});
        }
      }
      return g;
    });

    return NextResponse.json({ group }, { status: 201 });
  },
);
