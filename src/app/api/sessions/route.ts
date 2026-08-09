/**
 * Smart EDMS — Session management
 * GET    /api/sessions              list current user's sessions
 * DELETE /api/sessions/:id          revoke a specific session
 * DELETE /api/sessions              revoke all other sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { recordAuditEvent } from '@/lib/audit/audit-service';

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

    const sessions = recentLogins.map((l) => ({
      id: l.id,
      ip: l.actorIp,
      userAgent: l.actorUserAgent,
      lastActivity: l.createdAt,
      current: false, // can't determine without session-bound tracking
    }));

    return NextResponse.json({ sessions });
  },
);

export const DELETE = createApiHandler(
  {
    audit: { eventType: 'session.revoke_all', action: 'delete', resourceType: 'session', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    // For JWT sessions, "revoking all others" requires rotating the JWT secret
    // OR using a session blacklist. We log the request and instruct the user
    // to change their password (which rotates the session).
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'session.revoke_requested',
      action: 'delete',
      resourceType: 'session',
      result: 'allow',
      metadata: { reason: 'user_initiated' },
    });

    return NextResponse.json({
      ok: true,
      message: 'Session revocation requested. To force-terminate all sessions, change your password in Settings → Security.',
    });
  },
);
