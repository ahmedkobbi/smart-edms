/**
 * Smart EDMS — Admin policies (ABAC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE },
  async (req: NextRequest, ctx) => {
    const items = await db.policy.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
    return NextResponse.json({
      items: items.map((p) => ({ ...p, conditions: JSON.parse(p.conditions || '{}') })),
    });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  effect: z.enum(['allow', 'deny']),
  action: z.string().min(1),
  resource: z.string().min(1),
  conditions: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().min(0).max(1000).default(100),
  enabled: z.boolean().default(true),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_POLICIES_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'admin.policy.create', action: 'create', resourceType: 'policy', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());
    const existing = await db.policy.findFirst({ where: { name: body.name, tenantId: ctx.tenantId } });
    if (existing) throw ApiError.conflict('exists', 'Policy with this name already exists');

    const policy = await db.policy.create({
      data: {
        ...body,
        conditions: JSON.stringify(body.conditions),
        tenantId: ctx.tenantId,
      },
    });

    // Invalidate the policy cache so the new policy takes effect immediately
    const { invalidatePolicyCache } = await import('@/lib/auth/policy-engine');
    invalidatePolicyCache(ctx.tenantId);

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.policy.create',
      action: 'create',
      resourceType: 'policy',
      resourceId: policy.id,
      resourceName: policy.name,
      result: 'allow',
      metadata: { effect: policy.effect, action: policy.action, resource: policy.resource, priority: policy.priority },
    });

    return NextResponse.json({ policy: { ...policy, conditions: body.conditions } }, { status: 201 });
  },
);
