import { NextResponse } from "next/server";

/**
 * API root — returns minimal service info.
 *
 * SECURITY FIX (L-INFRA-13): Replaced the leftover "Hello, world!" placeholder
 * (which fingerprinted the deployment as a Next.js app) with a minimal
 * service-info response. No version is exposed (see M-ADM-16 for rationale).
 * The endpoint is unauthenticated but cheap — it returns a fixed string and
 * does not touch the DB.
 */
export async function GET() {
  return NextResponse.json(
    { name: 'Smart EDMS API', status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
