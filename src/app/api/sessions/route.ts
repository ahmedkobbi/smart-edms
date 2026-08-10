/**
 * Smart EDMS — Session management
 * GET    /api/sessions              list current user's sessions (from audit log)
 * DELETE /api/sessions              revoke ALL sessions for the current user
 *                                  (sets sessionsRevokedAt = now; all JWTs with
 *                                   iat < now become invalid on next request)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { revokeAllUserSessions } from '@/lib/auth/session-revocation';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    // For JWT sessions (no DB row), we can't enumerate active sessions.
    // We track last-active via audit events instead.
    const recentLogins = await db.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        eventType: 'auth.login',
      },
      orderBy: { sequenceNum: 'desc' },
      take: 10,
      select: {
        id: true,
        actorIp: true,
        actorUserAgent: true,
        createdAt: true,
        metadata: true,
      },
    });

    const currentJti = ctx.session.user.jti;
    const sessions = recentLogins.map((l) => {
      let jti: string | undefined;
      try {
        const meta = JSON.parse(l.metadata || '{}');
        jti = meta.jti;
      } catch {}
      return {
        id: l.id,
        ip: l.actorIp,
        userAgent: l.actorUserAgent,
        lastActivity: l.createdAt,
        current: jti === currentJti,
        jti,
      };
    });

    return NextResponse.json({ sessions });
  },
);

export const DELETE = createApiHandler(
  {
    audit: { eventType: 'session.revoke_all', action: 'delete', resourceType: 'session', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    // Mass-revoke: sets sessionsRevokedAt = now on the user row.
    // All JWTs with iat < now become invalid on the next request.
    // The current session is also revoked (user must sign in again).
    await revokeAllUserSessions(ctx.userId, 'user_initiated');

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'session.revoke_all',
      action: 'delete',
      resourceType: 'session',
      result: 'allow',
      metadata: { reason: 'user_initiated', revokedJti: ctx.session.user.jti },
    });

    return NextResponse.json({
      ok: true,
      message: 'All sessions revoked. You will need to sign in again.',
      redirect: '/login',
    });
  },
);
