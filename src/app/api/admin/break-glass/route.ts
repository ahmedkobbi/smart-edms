/**
 * Smart EDMS — Break-glass emergency access
 *
 * POST   /api/admin/break-glass              request emergency elevated access
 * GET    /api/admin/break-glass              list break-glass events (admin)
 * PATCH  /api/admin/break-glass/:id/review   review a break-glass event (approve/flag)
 *
 * Break-glass grants temporary tenant_admin permissions to a user with a
 * strong audit trail. All actions taken during the break-glass window are
 * tagged with the break-glass session ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { sendBreakGlassAlert } from '@/lib/notifications/email';
import { randomToken } from '@/lib/auth/crypto';
import { z } from 'zod';

const BREAK_GLASS_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    const items = await db.breakGlassAccess.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { grantedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items });
  },
);

const requestSchema = z.object({
  reason: z.string().min(10).max(500),
  justification: z.string().min(20).max(2000),
});

export const POST = createApiHandler(
  {
    audit: { eventType: 'breakglass.request', action: 'create', resourceType: 'break-glass', alwaysAudit: true },
    rateLimit: { max: 3, windowMs: 60 * 60 * 1000 }, // max 3 per hour
  },
  async (req: NextRequest, ctx) => {
    const body = requestSchema.parse(await req.json());

    // Check no active break-glass for this user
    const existing = await db.breakGlassAccess.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw ApiError.conflict('already_active', 'You already have an active break-glass session');
    }

    const granted = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.TENANT_ADMIN];
    const breakGlass = await db.breakGlassAccess.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        reason: body.reason,
        justification: body.justification,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + BREAK_GLASS_DURATION_MS),
        grantedPermissions: JSON.stringify(granted),
      },
    });

    // Audit + notify all other admins
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'breakglass.granted',
      action: 'create',
      resourceType: 'break-glass',
      resourceId: breakGlass.id,
      result: 'allow',
      reason: body.reason,
      metadata: {
        justification: body.justification,
        expiresAt: breakGlass.expiresAt,
        grantedPermissions: granted.length,
      },
    });

    // Notify all tenant admins (except the requester) for oversight
    // Pass email + reason in metadata so the i18n template can interpolate them.
    const admins = await db.roleAssignment.findMany({
      where: {
        tenantId: ctx.tenantId,
        role: { name: SYSTEM_ROLES.TENANT_ADMIN },
        userId: { not: ctx.userId },
      },
      select: { userId: true },
    });
    for (const a of admins) {
      await notify({
        tenantId: ctx.tenantId,
        userId: a.userId,
        type: 'breakglass.alert',
        severity: 'critical',
        link: '/admin/security',
        metadata: {
          breakGlassId: breakGlass.id,
          userId: ctx.userId,
          expiresAt: breakGlass.expiresAt,
          email: ctx.session.user.email,
          reason: body.reason,
        },
      });
      // Send email alert — resolve admin's locale for full i18n
      const adminUser = await db.user.findUnique({
        where: { id: a.userId },
        select: { email: true },
      });
      if (adminUser?.email) {
        const { getUserLocale } = await import('@/i18n/server-translator');
        const locale = await getUserLocale(a.userId);
        sendBreakGlassAlert({
          to: adminUser.email,
          userName: ctx.session.user.name || ctx.session.user.email,
          userEmail: ctx.session.user.email,
          reason: body.reason,
          expiresAt: breakGlass.expiresAt,
          locale,
          reviewUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/admin/security`,
        }).catch((err) => {
          console.warn('[break-glass] failed to send email to admin:', err);
        });
      }
    }

    return NextResponse.json({
      breakGlass,
      token: randomToken(32), // client stores this for X-Break-Glass-Token header
      expiresAt: breakGlass.expiresAt,
      expiresInMs: BREAK_GLASS_DURATION_MS,
      warning: 'All actions during this session are audit-logged with break-glass attribution.',
    }, { status: 201 });
  },
);
