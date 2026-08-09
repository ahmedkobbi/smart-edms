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

export async function GET(req: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;

  const provider = await db.ssoProvider.findFirst({
    where: { id: providerId, enabled: true },
  });
  if (!provider) {
    return NextResponse.json({ error: { code: 'not_found', message: 'SSO provider not found' } }, { status: 404 });
  }

  if (provider.type !== 'oidc') {
    return NextResponse.json({ error: { code: 'not_supported', message: 'Only OIDC is supported' } }, { status: 400 });
  }

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
