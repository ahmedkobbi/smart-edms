/**
 * Smart EDMS — SSO OIDC login init
 * GET /api/auth/sso/:providerId/init
 *
 * Redirects to the OIDC provider's authorization endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { randomToken } from '@/lib/auth/crypto';

const stateStore = new Map<string, { providerId: string; expiresAt: number }>();

export async function GET(req: NextRequest, { params: routeParams }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await routeParams;

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
      wantAssertionsSigned: false,
      acceptedClockSkewMs: 300000,
    };

    const strategy = new (SAMLStrategy as any)(samlConfig, () => {});
    const state = randomToken(16);
    stateStore.set(state, { providerId: provider.id, expiresAt: Date.now() + 10 * 60 * 1000 });

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
  const state = randomToken(16);
  stateStore.set(state, { providerId: provider.id, expiresAt: Date.now() + 10 * 60 * 1000 });

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/sso/${providerId}/callback`;
  const authUrl = provider.authorizationEndpoint || `${provider.issuerUrl}/authorize`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    state,
    scope: provider.scopes || 'openid profile email',
  });

  return NextResponse.redirect(`${authUrl}?${params.toString()}`);
}

export { stateStore };
