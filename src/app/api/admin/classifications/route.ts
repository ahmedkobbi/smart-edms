/**
 * Smart EDMS — Admin classifications
 * GET   /api/admin/classifications
 * POST  /api/admin/classifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.classification.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { level: 'asc' },
      include: { _count: { select: { documents: true } } },
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  level: z.number().int().min(0).max(99),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultPolicy: z.record(z.unknown()).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_CLASSIFICATIONS_MANAGE,
    audit: { eventType: 'admin.classification.create', action: 'create', resourceType: 'classification', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const existing = await db.classification.findFirst({
      where: { OR: [{ code: body.code, tenantId: ctx.tenantId }, { name: body.name, tenantId: ctx.tenantId }] },
    });
    if (existing) throw ApiError.conflict('classification_exists', 'Classification code or name already exists');

    const cls = await db.classification.create({
      data: {
        tenantId: ctx.tenantId,
        code: body.code,
        name: body.name,
        description: body.description,
        level: body.level,
        color: body.color,
        defaultPolicy: body.defaultPolicy ? JSON.stringify(body.defaultPolicy) : null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.classification.create',
      action: 'create',
      resourceType: 'classification',
      resourceId: cls.id,
      resourceName: cls.name,
      result: 'allow',
      metadata: { code: cls.code, level: cls.level },
    });

    return NextResponse.json({ classification: cls }, { status: 201 });
  },
);
