/**
 * Smart EDMS — Public SSO provider list
 * GET /api/admin/sso-providers/public
 *
 * Returns only enabled SSO providers (id + name) for the login page.
 * No authentication required.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const providers = await db.ssoProvider.findMany({
    where: { enabled: true },
    select: { id: true, name: true, type: true },
  });
  return NextResponse.json({ items: providers });
}
