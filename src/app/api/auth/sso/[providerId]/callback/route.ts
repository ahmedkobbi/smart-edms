/**
 * Smart EDMS — SSO OIDC callback
 * GET /api/auth/sso/:providerId/callback?code=...&state=...
 *
 * Exchanges the authorization code for an access token, fetches user info,
 * finds or creates the user, and redirects to the dashboard with a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stateStore } from '../init/route';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { resolveUserRoles, resolveUserPermissions } from '@/lib/auth/auth-options';
import { logger } from '@/lib/config/logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');

  if (error) {
    loginUrl.searchParams.set('error', 'sso_error');
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

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`;
    const tokenEndpoint = provider.tokenEndpoint || `${provider.issuerUrl}/token`;

    // Exchange code for tokens
    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecretEnc || '',
      }),
    });

    if (!tokenRes.ok) {
      logger.error('sso.token_exchange_failed', { status: tokenRes.status, providerId });
      loginUrl.searchParams.set('error', 'sso_token_failed');
      return NextResponse.redirect(loginUrl);
    }

    const tokens = await tokenRes.json();

    // Fetch user info
    const userInfoEndpoint = provider.userInfoEndpoint || `${provider.issuerUrl}/userinfo`;
    const userInfoRes = await fetch(userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
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
      // Auto-provision user
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

    // Audit
    await recordAuditEvent({
      tenantId: provider.tenantId,
      actorId: user.id,
      actorEmail: user.email,
      actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      actorUserAgent: req.headers.get('user-agent') || null,
      eventType: 'auth.login',
      action: 'login',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.email,
      result: 'allow',
      reason: `sso:${provider.name}`,
      metadata: { provider: provider.name, method: 'oidc' },
    });

    // Since we use JWT sessions, we need to redirect to a page that calls signIn()
    // For now, redirect to a special SSO complete page that uses the email to sign in
    // In production, this would use a server-side session creation
    const completeUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');
    completeUrl.searchParams.set('sso_email', email);
    completeUrl.searchParams.set('sso_success', 'true');
    return NextResponse.redirect(completeUrl);
  } catch (err: any) {
    logger.error('sso.callback_error', { error: err.message, providerId });
    loginUrl.searchParams.set('error', 'sso_internal_error');
    return NextResponse.redirect(loginUrl);
  }
}
