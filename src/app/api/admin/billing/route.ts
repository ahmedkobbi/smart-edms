/**
 * Smart EDMS — Billing / Subscription
 * GET   /api/admin/billing
 * PATCH /api/admin/billing   { plan, seats, storageBytes }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req: NextRequest, ctx) => {
    let sub = await db.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!sub) {
      // Auto-create trial subscription
      sub = await db.subscription.create({
        data: {
          tenantId: ctx.tenantId,
          plan: 'trial',
          status: 'trialing',
          seats: 5,
          storageBytes: BigInt(5 * 1024 * 1024 * 1024), // 5GB
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
        },
      });
    }

    // Compute usage
    const [userCount, documentCount, storageUsed] = await Promise.all([
      db.user.count({ where: { tenantId: ctx.tenantId, status: 'active' } }),
      db.document.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
      db.documentVersion.aggregate({
        where: { tenantId: ctx.tenantId },
        _sum: { sizeBytes: true },
      }),
    ]);

    return NextResponse.json({
      subscription: {
        ...sub,
        storageBytes: Number(sub.storageBytes),
      },
      usage: {
        seats: userCount,
        seatsLimit: sub.seats,
        documents: documentCount,
        storageUsedBytes: Number(storageUsed._sum.sizeBytes ?? 0),
        storageLimitBytes: Number(sub.storageBytes),
        storageUsedPct: Number(sub.storageBytes) > 0 ? Math.round((Number(storageUsed._sum.sizeBytes ?? 0) / Number(sub.storageBytes)) * 100) : 0,
      },
    });
  },
);

const patchSchema = z.object({
  plan: z.enum(['trial', 'starter', 'business', 'enterprise']).optional(),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional(),
  seats: z.number().int().min(1).max(10000).optional(),
  storageBytes: z.number().int().min(1024 * 1024).max(1024 * 1024 * 1024 * 1024).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    audit: { eventType: 'admin.billing.update', action: 'update', resourceType: 'subscription', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = patchSchema.parse(await req.json());

    let sub = await db.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!sub) {
      sub = await db.subscription.create({
        data: {
          tenantId: ctx.tenantId,
          plan: body.plan || 'trial',
          seats: body.seats || 5,
          storageBytes: BigInt(body.storageBytes || 5 * 1024 * 1024 * 1024),
        },
      });
    } else {
      sub = await db.subscription.update({
        where: { tenantId: ctx.tenantId },
        data: {
          ...(body.plan !== undefined ? { plan: body.plan } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.seats !== undefined ? { seats: body.seats } : {}),
          ...(body.storageBytes !== undefined ? { storageBytes: body.storageBytes } : {}),
        },
      });
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.billing.updated',
      action: 'update',
      resourceType: 'subscription',
      resourceId: sub.id,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ subscription: { ...sub, storageBytes: Number(sub.storageBytes) } });
  },
);
