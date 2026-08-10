/**
 * Smart EDMS — Metadata Schema detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  appliesTo: z.string().optional(),
  fields: z.array(z.any()).optional(),
});

export const PATCH = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const schema = await db.metadataSchema.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!schema) throw ApiError.notFound('not_found', 'Schema not found');

    const updated = await db.metadataSchema.update({
      where: { id: schema.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo } : {}),
        ...(body.fields !== undefined ? { fields: JSON.stringify(body.fields) } : {}),
      },
    });
    return NextResponse.json({ schema: { ...updated, fields: JSON.parse(updated.fields || '[]') } });
  },
);

export const DELETE = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const schema = await db.metadataSchema.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!schema) throw ApiError.notFound('not_found', 'Schema not found');
    await db.metadataSchema.delete({ where: { id: schema.id } });
    return NextResponse.json({ ok: true });
  },
);
