/**
 * Smart EDMS — Controlled vocabularies
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const items = await db.controlledVocabulary.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      items: items.map((v) => ({ ...v, terms: JSON.parse(v.terms || '[]') })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  terms: z.array(z.string().min(1).max(100)).min(1),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.vocab.create', action: 'create', resourceType: 'vocabulary', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.controlledVocabulary.findFirst({
      where: { name: body.name, tenantId: ctx.tenantId },
    });
    if (existing) throw ApiError.conflict('exists', 'Vocabulary with this name already exists');

    const vocab = await db.controlledVocabulary.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        terms: JSON.stringify(body.terms),
      },
    });
    return NextResponse.json({ vocabulary: { ...vocab, terms: body.terms } }, { status: 201 });
  },
);
