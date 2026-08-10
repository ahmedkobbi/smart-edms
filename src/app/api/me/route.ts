/**
 * Smart EDMS — Current user / session info
 * GET   /api/me           — get current user + tenant + session
 * PATCH /api/me           — update profile (name, jobTitle, department, avatarUrl)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: {
        id: true, email: true, name: true, status: true, mfaEnabled: true,
        jobTitle: true, department: true, avatarUrl: true,
        lastLoginAt: true, lastLoginIp: true, createdAt: true,
      },
    });

    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, slug: true, settings: true },
    });

    return NextResponse.json({
      user,
      tenant,
      session: ctx.session.user,
    });
  },
);

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  jobTitle: z.string().max(100).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const PATCH = createApiHandler(
  {
    audit: { eventType: 'me.profile.update', action: 'update', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = patchSchema.parse(await req.json());

    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.jobTitle !== undefined) updateData.jobTitle = body.jobTitle;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ user: ctx.session.user, message: 'No changes' });
    }

    const updated = await db.user.update({
      where: { id: ctx.userId },
      data: updateData,
      select: {
        id: true, email: true, name: true, jobTitle: true, department: true, avatarUrl: true,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'me.profile.update',
      action: 'update',
      resourceType: 'user',
      resourceId: ctx.userId,
      resourceName: ctx.session.user.email,
      result: 'allow',
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({ user: updated });
  },
);
