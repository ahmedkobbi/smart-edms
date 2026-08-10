/**
 * Smart EDMS — Public SSO provider list
 * GET /api/admin/sso-providers/public?tenant=<slug>
 *
 * Returns only enabled SSO providers (id + name) for the login page.
 * No authentication required — but MUST be scoped by tenant slug.
 *
 * SECURITY FIX (M5): Previously returned ALL tenants' SSO providers with
 * no tenant filter — leaked the customer list and IdP vendor mix.
 * Now requires a ?tenant=<slug> query parameter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant');

  // SECURITY FIX (M5): Require tenant slug — no untenant-scoped queries
  if (!tenantSlug) {
    return NextResponse.json({ items: [] });
  }

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) {
    return NextResponse.json({ items: [] });
  }

  const providers = await db.ssoProvider.findMany({
    where: { tenantId: tenant.id, enabled: true },
    select: { id: true, name: true, type: true },
  });

  return NextResponse.json({ items: providers });
}
