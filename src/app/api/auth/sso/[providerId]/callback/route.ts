/**
 * Smart EDMS — SSO OIDC callback
 * GET /api/auth/sso/:providerId/callback?code=...&state=...
 *
 * Exchanges the authorization code for an access token, fetches user info,
 * finds or creates the user, and establishes a NextAuth JWT session by
 * minting the session JWT directly and setting the session cookie.
 *
 * Critical fix: decrypts the stored `clientSecretEnc` before sending it
 * to the IdP's token endpoint (the previous version sent the encrypted
 * blob as the plaintext secret, breaking every provider that had a secret).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stateStore } from '../init/route';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { resolveUserRoles, resolveUserPermissions } from '@/lib/auth/auth-options';
import { decryptString } from '@/lib/auth/crypto';
import { logger } from '@/lib/config/logger';
import { encode as encodeJwt } from 'next-auth/jwt';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');

  if (error) {
    loginUrl.searchParams.set('error', 'sso_error');
    loginUrl.searchParams.set('error_description', req.nextUrl.searchParams.get('error_description') || error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set('error', 'sso_missing_params');
    return NextResponse.redirect(loginUrl);
  }

  const stored = stateStore.get(state);
  if (!stored || stored.expiresAt < Date.now() || stored.providerId !== providerId) {
    loginUrl.searchParams.set('error', 'sso_state_expired');
    return NextResponse.redirect(loginUrl);
  }
  stateStore.delete(state);

  const provider = await db.ssoProvider.findFirst({
    where: { id: providerId, enabled: true },
  });
  if (!provider) {
    loginUrl.searchParams.set('error', 'sso_provider_not_found');
    return NextResponse.redirect(loginUrl);
  }

  if (provider.type !== 'oidc') {
    loginUrl.searchParams.set('error', 'sso_type_not_supported');
    return NextResponse.redirect(loginUrl);
  }

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`;
    const tokenEndpoint = provider.tokenEndpoint || `${provider.issuerUrl}/token`;

    // Decrypt the client secret before sending it to the IdP
    let clientSecret = '';
    if (provider.clientSecretEnc) {
      try {
        const blob = JSON.parse(provider.clientSecretEnc);
        clientSecret = await decryptString(blob);
      } catch (err) {
        logger.error('sso.secret_decrypt_failed', { providerId, error: (err as Error).message });
        loginUrl.searchParams.set('error', 'sso_internal_error');
        return NextResponse.redirect(loginUrl);
      }
    }

    // Exchange code for tokens
    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      logger.error('sso.token_exchange_failed', {
        status: tokenRes.status,
        providerId,
        body: errBody.slice(0, 500),
      });
      loginUrl.searchParams.set('error', 'sso_token_failed');
      return NextResponse.redirect(loginUrl);
    }

    const tokens = await tokenRes.json();

    // Fetch user info
    const userInfoEndpoint = provider.userInfoEndpoint || `${provider.issuerUrl}/userinfo`;
    const userInfoRes = await fetch(userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!userInfoRes.ok) {
      logger.error('sso.userinfo_failed', { status: userInfoRes.status, providerId });
      loginUrl.searchParams.set('error', 'sso_userinfo_failed');
      return NextResponse.redirect(loginUrl);
    }

    const userInfo = await userInfoRes.json();
    const email = userInfo[provider.emailAttribute || 'email'];
    const name = userInfo[provider.nameAttribute || 'name'];

    if (!email) {
      loginUrl.searchParams.set('error', 'sso_no_email');
      return NextResponse.redirect(loginUrl);
    }

    // Find or create user
    let user = await db.user.findFirst({
      where: { email: email.toLowerCase(), tenantId: provider.tenantId },
    });

    if (!user) {
      // Auto-provision user (JIT provisioning)
      user = await db.user.create({
        data: {
          tenantId: provider.tenantId,
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          status: 'active',
        },
      });

      // Assign end_user role by default
      const endUserRole = await db.role.findFirst({
        where: { tenantId: provider.tenantId, name: 'end_user' },
      });
      if (endUserRole) {
        await db.roleAssignment.create({
          data: { tenantId: provider.tenantId, userId: user.id, roleId: endUserRole.id, scope: '' },
        });
      }
    }

    if (user.status !== 'active') {
      loginUrl.searchParams.set('error', 'sso_account_inactive');
      return NextResponse.redirect(loginUrl);
    }

    // Audit the SSO login
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = req.headers.get('user-agent') || null;
    await recordAuditEvent({
      tenantId: provider.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      actorIp: ip,
      actorUserAgent: userAgent,
      eventType: 'auth.login',
      action: 'login',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      reason: `sso:${provider.name}`,
      metadata: { provider: provider.name, method: 'oidc', jit: !user.createdAt || (Date.now() - user.createdAt.getTime()) < 60_000 },
    });

    // Resolve roles + permissions for the JWT
    const roles = await resolveUserRoles(user.id, provider.tenantId);
    const permissions = await resolveUserPermissions(user.id, provider.tenantId);

    // Mint a NextAuth JWT directly and set the session cookie.
    // This bypasses the credentials-provider authorize() flow — the user
    // has already authenticated via the IdP, so we issue a session JWT
    // with the same shape that NextAuth's jwt() callback expects.
    const now = Math.floor(Date.now() / 1000);
    const sessionMaxAge = 8 * 60 * 60; // 8 hours — matches auth-options.ts
    const token = {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: provider.tenantId,
      roles,
      permissions,
      mfaVerified: user.mfaEnabled,
      refreshAt: Date.now() + 5 * 60 * 1000,
      iat: now,
      exp: now + sessionMaxAge,
      jti: crypto.randomUUID(),
    };

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      logger.error('sso.no_nextauth_secret', {});
      loginUrl.searchParams.set('error', 'sso_internal_error');
      return NextResponse.redirect(loginUrl);
    }

    const encoded = await encodeJwt({
      token,
      secret,
      maxAge: sessionMaxAge,
    } as any);

    // Set the session cookie — name matches NextAuth's default
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    const cookieStore = await cookies();
    cookieStore.set(cookieName, encoded, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: sessionMaxAge,
    });

    logger.info('sso.login_success', {
      providerId,
      userId: user.id,
      email: user.email,
      jit: (Date.now() - user.createdAt.getTime()) < 60_000,
    });

    // Redirect to the dashboard (the session cookie is now set)
    const dashboardUrl = new URL('/dashboard', process.env.NEXTAUTH_URL || 'http://localhost:3000');
    dashboardUrl.searchParams.set('sso', '1');
    return NextResponse.redirect(dashboardUrl);
  } catch (err: any) {
    logger.error('sso.callback_error', { error: err.message, providerId });
    loginUrl.searchParams.set('error', 'sso_internal_error');
    return NextResponse.redirect(loginUrl);
  }
}

// Need crypto.randomUUID — available in Node 19+. Fall back if needed.
import { webcrypto } from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto as any;
}
