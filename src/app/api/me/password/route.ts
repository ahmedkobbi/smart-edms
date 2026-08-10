/**
 * Smart EDMS — Change password
 * POST /api/me/password   { currentPassword, newPassword }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { hashPassword, verifyPassword } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { authRateLimiter } from '@/lib/security/rate-limit';
import { z } from 'zod';

const schema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(12).max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

export const POST = createApiHandler(
  {
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'me.password.change', action: 'update', resourceType: 'user', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = schema.parse(await req.json());

    const user = await db.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, passwordHash: true, email: true },
    });
    if (!user) throw ApiError.notFound('user_not_found', 'User not found');

    const ok = await verifyPassword(body.currentPassword, user.passwordHash || '');
    if (!ok) throw ApiError.forbidden('invalid_password', 'Current password is incorrect');

    const newHash = await hashPassword(body.newPassword);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    // Revoke ALL sessions for this user (including the current one) —
    // standard security practice on password change. The user must sign
    // in again with their new password.
    const { revokeAllUserSessions } = await import('@/lib/auth/session-revocation');
    await revokeAllUserSessions(user.id, 'password_change');

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'me.password.change',
      action: 'update',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  },
);
