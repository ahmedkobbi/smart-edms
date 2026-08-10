/**
 * Smart EDMS — Vocabulary detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  terms: z.array(z.string()).optional(),
});

export const PATCH = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const body = patchSchema.parse(await req.json());
    const vocab = await db.controlledVocabulary.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!vocab) throw ApiError.notFound('not_found', 'Vocabulary not found');

    const updated = await db.controlledVocabulary.update({
      where: { id: vocab.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.terms !== undefined ? { terms: JSON.stringify(body.terms) } : {}),
      },
    });
    return NextResponse.json({ vocabulary: { ...updated, terms: JSON.parse(updated.terms || '[]') } });
  },
);

export const DELETE = createApiHandler(
  {
    requireStepUp: true, requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
  async (req: NextRequest, ctx, params) => {
    const vocab = await db.controlledVocabulary.findFirst({ where: { id: params!.id, tenantId: ctx.tenantId } });
    if (!vocab) throw ApiError.notFound('not_found', 'Vocabulary not found');
    await db.controlledVocabulary.delete({ where: { id: vocab.id } });
    return NextResponse.json({ ok: true });
  },
);
