/**
 * Smart EDMS — Dual-control request management
 *
 * GET  /api/admin/dual-control            list requests (pending/all)
 * POST /api/admin/dual-control            create a new dual-control request
 *
 * Dual-control enforces separation of duties: a destructive admin action
 * (e.g. tenant deletion, key purging, policy cascade-delete) must be
 * requested by one admin and approved by a DIFFERENT admin before it
 * can be executed.
 *
 * The request stores the action + payload so the approver can review
 * exactly what will happen. Execution is a separate step performed by
 * the requester after approval (or auto-executed for idempotent actions).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

const DUAL_CONTROL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req: NextRequest, ctx) => {
    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const where: any = { tenantId: ctx.tenantId };
    if (status !== 'all') where.status = status;

    const items = await db.dualControlRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  action: z.string().min(1).max(100),
  resourceType: z.string().min(1).max(50),
  resourceId: z.string().max(200).default(''),
  reason: z.string().min(10).max(1000),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    audit: { eventType: 'dual_control.request', action: 'create', resourceType: 'dual_control', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    // Check for an existing pending request for the same action+resource
    // (prevents request spam)
    const existing = await db.dualControlRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: body.action,
        resourceId: body.resourceId,
        status: 'pending',
      },
    });
    if (existing) {
      throw ApiError.conflict(
        'pending_exists',
        'A pending dual-control request already exists for this action. Wait for it to be decided or expired before creating a new one.',
      );
    }

    const request = await db.dualControlRequest.create({
      data: {
        tenantId: ctx.tenantId,
        requestedById: ctx.userId,
        action: body.action,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        reason: body.reason,
        payload: JSON.stringify(body.payload),
        status: 'pending',
        expiresAt: new Date(Date.now() + DUAL_CONTROL_TTL_MS),
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'dual_control.request',
      action: 'create',
      resourceType: 'dual_control',
      resourceId: request.id,
      result: 'allow',
      reason: body.reason,
      metadata: {
        action: body.action,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        expiresAt: request.expiresAt,
      },
    });

    return NextResponse.json({ request }, { status: 201 });
  },
);
