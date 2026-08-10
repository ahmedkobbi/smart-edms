/**
 * Smart EDMS — Group detail
 * GET    /api/admin/groups/:id
 * PATCH  /api/admin/groups/:id   add/remove members
 * DELETE /api/admin/groups/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const group = await db.group.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        policies: { select: { id: true, name: true, effect: true, action: true } },
      },
    });
    if (!group) throw ApiError.notFound('not_found', 'Group not found');
    return NextResponse.json({ group });
  },
);

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  addMemberIds: z.array(z.string()).default([]),
  removeMemberIds: z.array(z.string()).default([]),
});

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const group = await db.group.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!group) throw ApiError.notFound('not_found', 'Group not found');

    await db.$transaction(async (tx) => {
      if (body.name !== undefined || body.description !== undefined) {
        await tx.group.update({
          where: { id: group.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
          },
        });
      }
      for (const uid of body.addMemberIds) {
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId: group.id, userId: uid } },
          update: {},
          create: { tenantId: ctx.tenantId, groupId: group.id, userId: uid },
        }).catch(() => {});
      }
      if (body.removeMemberIds.length > 0) {
        await tx.groupMember.deleteMany({
          where: { groupId: group.id, userId: { in: body.removeMemberIds } },
        });
      }
    });

    return NextResponse.json({ ok: true });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_GROUPS_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const group = await db.group.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!group) throw ApiError.notFound('not_found', 'Group not found');
    await db.group.delete({ where: { id: group.id } });
    return NextResponse.json({ ok: true });
  },
);
