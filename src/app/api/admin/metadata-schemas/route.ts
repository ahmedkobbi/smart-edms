/**
 * Smart EDMS — Metadata Schemas API
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    const items = await db.metadataSchema.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      items: items.map((s) => ({ ...s, fields: JSON.parse(s.fields || '[]') })),
    });
  },
);

const fieldSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multiselect']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  appliesTo: z.string().default('*'),
  fields: z.array(fieldSchema).min(1),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.metadata-schema.create', action: 'create', resourceType: 'metadata-schema', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.metadataSchema.findFirst({ where: { name: body.name, tenantId: ctx.tenantId } });
    if (existing) throw ApiError.conflict('exists', 'Schema with this name already exists');

    const schema = await db.metadataSchema.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        appliesTo: body.appliesTo,
        fields: JSON.stringify(body.fields),
      },
    });
    return NextResponse.json({ schema: { ...schema, fields: body.fields } }, { status: 201 });
  },
);
