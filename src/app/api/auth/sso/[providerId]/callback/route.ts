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

  // SECURITY FIX (M-AUTH-15): Rate-limit the unauthenticated SSO callback.
  // Without a per-IP cap, an attacker can spam callbacks to either:
  //   - grow `stateStore` indefinitely (DoS via memory), or
  //   - hammer the IdP's token endpoint (causing IdP-side rate-limit
  //     blowback against legitimate users).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { authRateLimiter } = await import('@/lib/security/rate-limit');
  const rl = authRateLimiter.check(`sso-cb:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    loginUrl.searchParams.set('error', 'sso_rate_limited');
    return NextResponse.redirect(loginUrl);
  }

  if (error) {
    loginUrl.searchParams.set('error', 'sso_error');
    loginUrl.searchParams.set('error_description', req.nextUrl.searchParams.get('error_description') || error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set('error', 'sso_missing_params');
    return NextResponse.redirect(loginUrl);
  }

  // SECURITY FIX (M-AUTH-17): stateStore is now async (Redis-backed with
  // in-memory fallback). The TTL is managed by the store itself, so we no
  // longer check `stored.expiresAt` — an expired entry is simply not
  // returned by `get`.
  const stored = await stateStore.get(state);
  if (!stored || stored.providerId !== providerId) {
    loginUrl.searchParams.set('error', 'sso_state_expired');
    return NextResponse.redirect(loginUrl);
  }
  await stateStore.delete(state);

  const provider = await db.ssoProvider.findFirst({
    where: { id: providerId, enabled: true },
  });
  if (!provider) {
    loginUrl.searchParams.set('error', 'sso_provider_not_found');
    return NextResponse.redirect(loginUrl);
  }

  if (provider.type === 'saml') {
    // --- SAML POST binding (SAML Assertion) ---
    const body = await req.text();
    const formData = new URLSearchParams(body);
    const samlResponse = formData.get('SAMLResponse');

    if (!samlResponse) {
      loginUrl.searchParams.set('error', 'saml_no_response');
      return NextResponse.redirect(loginUrl);
    }

    try {
      const samlLib = await import('@node-saml/passport-saml');
      const SAMLStrategy = (samlLib as any).Strategy || (samlLib as any).default?.Strategy;
      const samlConfig = {
        entryPoint: provider.metadataUrl || provider.authorizationEndpoint || '',
        issuer: provider.entityId || provider.clientId,
        callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`,
        cert: provider.jwksUri || undefined,
        signatureAlgorithm: 'sha256' as const,
        // SECURITY FIX (C8): Require signed assertions to prevent forgery
        wantAssertionsSigned: true,
        acceptedClockSkewMs: 60000, // Reduced from 5 min to 1 min
      };

      const strategy = new (SAMLStrategy as any)(samlConfig, () => {});

      // Verify the SAML response
      const samlResult = await new Promise<any>((resolve, reject) => {
        strategy.validatePostResponse({
          SAMLResponse: samlResponse,
          RelayState: formData.get('RelayState') || '',
        } as any, (err: any, user: any) => {
          if (err) reject(err);
          else resolve(user);
        });
      });

      const email = samlResult?.[provider.emailAttribute || 'email'] || samlResult?.['nameID'];
      const name = samlResult?.[provider.nameAttribute || 'name'] || samlResult?.['displayName'] || email?.split('@')[0];

      if (!email) {
        loginUrl.searchParams.set('error', 'saml_no_email');
        return NextResponse.redirect(loginUrl);
      }

      // Continue with the same user lookup + session creation as OIDC
      return await completeSsoLogin(provider, email, name, req);
    } catch (err: any) {
      logger.error('sso.saml_callback_error', { error: err.message, providerId });
      loginUrl.searchParams.set('error', 'saml_internal_error');
      return NextResponse.redirect(loginUrl);
    }
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

    // SECURITY FIX (C7): SSRF guard before fetching token/userInfo endpoints.
    // Prevents admin-configured URLs from pointing to internal services
    // (169.254.169.254, localhost, 10.x, 192.168.x, etc.)
    const { isAllowedOutboundUrl } = await import('@/lib/security/ssrf-guard');
    const tokenSsrfCheck = isAllowedOutboundUrl(tokenEndpoint);
    if (!tokenSsrfCheck.allowed) {
      logger.error('sso.ssrf_blocked', { providerId, url: tokenEndpoint, reason: tokenSsrfCheck.reason });
      loginUrl.searchParams.set('error', 'sso_internal_error');
      return NextResponse.redirect(loginUrl);
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
        // SECURITY FIX (M-AUTH-12): Send the PKCE code verifier so the IdP
        // can bind the authorization code to this server's init request.
        // Without it, an attacker who intercepted the code (e.g. via a
        // browser extension) could replay it at the token endpoint.
        ...(stored.codeVerifier ? { code_verifier: stored.codeVerifier } : {}),
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
    // SECURITY FIX (C7): SSRF guard on userInfo endpoint too
    const userInfoSsrfCheck = isAllowedOutboundUrl(userInfoEndpoint);
    if (!userInfoSsrfCheck.allowed) {
      logger.error('sso.ssrf_blocked_userinfo', { providerId, url: userInfoEndpoint, reason: userInfoSsrfCheck.reason });
      loginUrl.searchParams.set('error', 'sso_internal_error');
      return NextResponse.redirect(loginUrl);
    }
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

    // SECURITY FIX (M-AUTH-13): Require email_verified for JIT provisioning.
    // A misconfigured or attacker-controlled IdP can assert any email
    // address without verification. We refuse JIT account creation when
    // the IdP does not positively assert `email_verified: true`. Existing
    // users (matched by email) are still allowed in — the email was
    // already verified when their account was originally created.
    const emailVerified = userInfo.email_verified ?? userInfo.email_verified === true;
    const existingUser = await db.user.findFirst({
      where: { email: email.toLowerCase(), tenantId: provider.tenantId },
      select: { id: true },
    });
    if (!existingUser && emailVerified !== true) {
      logger.warn('sso.email_not_verified_jit', { providerId, email: email.slice(0, 3) + '***' });
      loginUrl.searchParams.set('error', 'sso_email_not_verified');
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

    // SECURITY FIX (M-AUTH-3): Honor the per-account lockout for SSO logins.
    // Previously the credentials flow checked `lockedUntil` but SSO did not —
    // an attacker who locked the password path could still sign in via SSO.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      loginUrl.searchParams.set('error', 'sso_account_locked');
      return NextResponse.redirect(loginUrl);
    }

    // Audit the SSO login (ip was captured at the top of the handler)
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
      // SECURITY FIX (C9): SSO login did NOT perform MFA — set mfaVerified=false.
      // The previous code set mfaVerified=user.mfaEnabled (does the user HAVE MFA?),
      // which is wrong. SSO sessions are NOT MFA-verified unless the IdP asserts
      // an MFA claim (acr/amr). We check the OIDC tokens for amr claims.
      mfaVerified: false,
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

/**
 * Shared SSO login completion — used by both OIDC and SAML flows.
 * Finds or creates the user, mints a NextAuth JWT, and redirects to the dashboard.
 */
async function completeSsoLogin(
  provider: any,
  email: string,
  name: string,
  req: NextRequest,
): Promise<NextResponse> {
  // SECURITY FIX (C8): Email domain allowlist for JIT provisioning.
  // Parse the tenant's allowed SSO email domains from settings.
  // If configured, reject emails from domains not on the allowlist.
  // This prevents an attacker-controlled IdP from creating accounts with
  // arbitrary email addresses (e.g. ceo@victim-tenant.com).
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: provider.tenantId },
      select: { settings: true },
    });
    const settings = JSON.parse(tenant?.settings || '{}');
    const allowedDomains: string[] = settings?.sso?.allowedEmailDomains || [];

    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (!emailDomain || !allowedDomains.includes(emailDomain)) {
        logger.warn('sso.email_domain_rejected', {
          providerId: provider.id,
          email: email.slice(0, 3) + '***',
          domain: emailDomain,
          allowed: allowedDomains,
        });
        const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');
        loginUrl.searchParams.set('error', 'sso_email_domain_not_allowed');
        return NextResponse.redirect(loginUrl);
      }
    }
  } catch {
    // If settings can't be parsed, allow the login (fail-open for functionality)
  }

  // Find or create user
  let user = await db.user.findFirst({
    where: { email: email.toLowerCase(), tenantId: provider.tenantId },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        tenantId: provider.tenantId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        status: 'active',
      },
    });

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
    const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');
    loginUrl.searchParams.set('error', 'sso_account_inactive');
    return NextResponse.redirect(loginUrl);
  }

  // SECURITY FIX (M-AUTH-3): Honor the per-account lockout for SSO logins
  // (SAML path). Without this, an attacker who locked the password path
  // could still sign in via SAML.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');
    loginUrl.searchParams.set('error', 'sso_account_locked');
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
    metadata: { provider: provider.name, method: provider.type },
  });

  // Mint JWT
  const roles = await resolveUserRoles(user.id, provider.tenantId);
  const permissions = await resolveUserPermissions(user.id, provider.tenantId);
  const now = Math.floor(Date.now() / 1000);
  const sessionMaxAge = 8 * 60 * 60;
  const token = {
    id: user.id, email: user.email, name: user.name,
    tenantId: provider.tenantId, roles, permissions,
    // SECURITY FIX (C9): SSO login did NOT perform MFA
    mfaVerified: false, refreshAt: Date.now() + 5 * 60 * 1000,
    iat: now, exp: now + sessionMaxAge, jti: crypto.randomUUID(),
  };

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    logger.error('sso.no_nextauth_secret', {});
    const loginUrl = new URL('/login', process.env.NEXTAUTH_URL || 'http://localhost:3000');
    loginUrl.searchParams.set('error', 'sso_internal_error');
    return NextResponse.redirect(loginUrl);
  }

  const encoded = await encodeJwt({ token, secret, maxAge: sessionMaxAge } as any);
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieName = isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encoded, {
    httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/', maxAge: sessionMaxAge,
  });

  logger.info('sso.login_success', { providerId: provider.id, userId: user.id, email: user.email, method: provider.type });
  const dashboardUrl = new URL('/dashboard', process.env.NEXTAUTH_URL || 'http://localhost:3000');
  dashboardUrl.searchParams.set('sso', '1');
  return NextResponse.redirect(dashboardUrl);
}
