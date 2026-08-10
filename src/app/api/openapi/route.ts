import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from '@/lib/auth/auth-options';
import { hasPermission } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permissions';

/**
 * SECURITY FIX (M-ADM-15): The OpenAPI spec was previously served
 * unauthenticated to anyone — leaking the full admin endpoint inventory
 * (/api/admin/break-glass, /api/admin/key-rotation, /api/admin/tenants, …)
 * including request/response schemas. This is a reconnaissance goldmine.
 *
 * The route now requires ADMIN_VIEW permission. The Cache-Control header is
 * also changed from `public` to `private` so proxies do not cache the spec
 * on behalf of authenticated users.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user || !hasPermission(session.user.permissions, PERMISSIONS.ADMIN_VIEW)) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  try {
    const specPath = path.join(process.cwd(), 'docs', 'openapi.json');
    const spec = await fs.readFile(specPath, 'utf-8');
    return NextResponse.json(JSON.parse(spec), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'spec_not_found', message: 'OpenAPI spec not found' } },
      { status: 404 },
    );
  }
}
