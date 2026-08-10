/**
 * Smart EDMS — Logout (session revocation)
 * POST /api/auth/logout
 *
 * Revokes the current JWT session by adding its `jti` to the
 * RevokedSession denylist, then clears the session cookie.
 *
 * This is necessary because NextAuth's default signOut() with JWT
 * strategy only clears the cookie — it does NOT invalidate the JWT
 * server-side. A stolen cookie could still be used until natural
 * expiry (8 hours). This endpoint ensures immediate revocation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth-options';
import { revokeSession } from '@/lib/auth/session-revocation';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (session?.user?.jti) {
    // Revoke the JWT
    const expiresAt = session.user.exp
      ? new Date(session.user.exp * 1000)
      : new Date(Date.now() + 8 * 3600_000); // fallback 8h

    await revokeSession({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      jti: session.user.jti,
      reason: 'logout',
      jwtExpiresAt: expiresAt,
    });

    // Audit
    await recordAuditEvent({
      tenantId: session.user.tenantId,
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      actorUserAgent: req.headers.get('user-agent') || null,
      eventType: 'auth.logout',
      action: 'logout',
      resourceType: 'user',
      resourceId: session.user.id,
      resourceName: session.user.email,
      result: 'allow',
      metadata: { jti: session.user.jti, method: 'explicit_logout' },
    }).catch(() => {});

    logger.info('auth.logout', { userId: session.user.id, jti: session.user.jti });
  }

  // Clear the session cookie
  const res = NextResponse.json({ ok: true, redirect: '/login' });
  res.cookies.delete('next-auth.session-token');
  res.cookies.delete('__Secure-next-auth.session-token');
  // Also clear the custom cookie names from auth-options
  res.cookies.delete('smart_edms_session');
  res.cookies.delete('smart_edms_csrf');

  return res;
}
