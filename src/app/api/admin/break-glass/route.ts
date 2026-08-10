/**
 * Smart EDMS — Break-glass emergency access
 *
 * POST   /api/admin/break-glass              request emergency elevated access
 * GET    /api/admin/break-glass              list break-glass events (admin)
 *
 * SECURITY FIX (C1): Break-glass now requires:
 *   1. `ADMIN_VIEW` permission (only admin roles can request)
 *   2. Step-up authentication (MFA)
 *   3. Token is hashed (SHA-256) and stored; verified with timingSafeEqual
 *   4. Break-glass is created in `approved: false` state — a second admin
 *      must approve via the dual-control flow before it can be activated
 *   5. The `X-Break-Glass-Token` header is verified against the stored hash
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { sendBreakGlassAlert } from '@/lib/notifications/email';
import { randomToken, sha256, timingSafeEqualStr } from '@/lib/auth/crypto';
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
    requiredPermission: PERMISSIONS.ADMIN_VIEW,
    requireStepUp: true,
    audit: { eventType: 'breakglass.request', action: 'create', resourceType: 'break-glass', alwaysAudit: true },
    rateLimit: { max: 3, windowMs: 60 * 60 * 1000 },
  },
  async (req: NextRequest, ctx) => {
    const body = requestSchema.parse(await req.json());

    // Check no active break-glass for this user
    const existing = await db.breakGlassAccess.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        expiresAt: { gt: new Date() },
        approved: true,
      },
    });
    if (existing) {
      throw ApiError.conflict('already_active', 'You already have an active break-glass session');
    }

    // Generate a cryptographically secure token
    const rawToken = randomToken(32);
    const tokenHash = sha256(rawToken);

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
        tokenHash,
        approved: false, // Requires second-admin approval (dual control)
      },
    });

    // Audit
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'breakglass.request',
      action: 'create',
      resourceType: 'break-glass',
      resourceId: breakGlass.id,
      result: 'allow',
      reason: body.reason,
      metadata: {
        justification: body.justification,
        expiresAt: breakGlass.expiresAt,
        grantedPermissions: granted.length,
        approved: false,
        requiresApproval: true,
      },
    });

    // Notify all tenant admins (except the requester) for approval
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
          requiresApproval: true,
        },
      });
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
      token: rawToken,
      expiresAt: breakGlass.expiresAt,
      expiresInMs: BREAK_GLASS_DURATION_MS,
      approved: false,
      warning: 'Break-glass requires approval from a second administrator. Use POST /api/admin/break-glass/:id/approve to activate.',
    }, { status: 201 });
  },
);
