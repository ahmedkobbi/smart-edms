/**
 * Smart EDMS — SSO OIDC login init
 * GET /api/auth/sso/:providerId/init
 *
 * Redirects to the OIDC provider's authorization endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { randomToken, randomBase64Url, sha256 } from '@/lib/auth/crypto';
import { createChallengeStore } from '@/lib/auth/challenge-store';

interface StateEntry {
  providerId: string;
  /** SECURITY FIX (M-AUTH-12): PKCE code verifier — sent to the IdP's token
   *  endpoint on callback to bind the authorization code to this init. */
  codeVerifier?: string;
}

/**
 * SECURITY FIX (M-AUTH-17 / L-AUTH-3/11): Replace the in-memory `Map` with
 * a Redis-backed challenge store (with in-memory fallback for dev). This
 * makes SSO logins work in multi-instance deploys (load balancer routing
 * the callback to a different replica than init) and bounds memory growth
 * via Redis TTL or the in-memory 10k LRU cap.
 */
const stateStore = createChallengeStore<StateEntry>('sso-state');
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

export async function GET(req: NextRequest, { params: routeParams }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await routeParams;

  // SECURITY FIX (M-AUTH-15): Rate-limit the unauthenticated SSO init.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { authRateLimiter } = await import('@/lib/security/rate-limit');
  const rl = await authRateLimiter.check(`sso-init:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many SSO requests' } }, { status: 429 });
  }

  const provider = await db.ssoProvider.findFirst({
    where: { id: providerId, enabled: true },
  });
  if (!provider) {
    return NextResponse.json({ error: { code: 'not_found', message: 'SSO provider not found' } }, { status: 404 });
  }

  if (provider.type === 'saml') {
    // --- SAML flow ---
    const samlLib = await import('@node-saml/passport-saml');
    const SAMLStrategy = (samlLib as any).Strategy || (samlLib as any).default?.Strategy;

    const samlConfig = {
      entryPoint: provider.metadataUrl || provider.authorizationEndpoint || '',
      issuer: provider.entityId || provider.clientId,
      callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`,
      cert: provider.jwksUri || undefined,
      signatureAlgorithm: 'sha256' as const,
      wantAssertionsSigned: true,
      acceptedClockSkewMs: 60000,
    };

    const strategy = new (SAMLStrategy as any)(samlConfig, () => {});
    const state = randomToken(16);
    await stateStore.set(state, { providerId: provider.id }, STATE_TTL_MS);

    return new Promise<NextResponse>((resolve) => {
      strategy.authenticateToIdp((err, url) => {
        if (err || !url) {
          resolve(NextResponse.json(
            { error: { code: 'saml_error', message: err?.message || 'Failed to generate SAML redirect' } },
            { status: 500 },
          ));
          return;
        }
        resolve(NextResponse.redirect(url));
      });
    });
  }

  if (provider.type !== 'oidc') {
    return NextResponse.json({ error: { code: 'not_supported', message: 'Only OIDC and SAML are supported' } }, { status: 400 });
  }

  // --- OIDC flow ---
  // SECURITY FIX (M-AUTH-12): PKCE (S256)
  const codeVerifier = randomBase64Url(32);
  const codeChallengeBytes = Buffer.from(codeVerifier, 'utf8');
  const crypto = await import('crypto');
  const codeChallengeB64u = crypto.createHash('sha256').update(codeChallengeBytes).digest('base64url');

  const state = randomToken(16);
  await stateStore.set(state, {
    providerId: provider.id,
    codeVerifier,
  }, STATE_TTL_MS);

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`;
  const authUrl = provider.authorizationEndpoint || `${provider.issuerUrl}/authorize`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    state,
    scope: provider.scopes || 'openid profile email',
    code_challenge: codeChallengeB64u,
    code_challenge_method: 'S256',
  });

  return NextResponse.redirect(`${authUrl}?${params.toString()}`);
}

export { stateStore };
