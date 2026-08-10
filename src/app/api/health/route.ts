/**
 * Smart EDMS — Health check endpoint
 * GET /api/health
 *
 * Returns 200 if the service is healthy, 503 if degraded.
 * No authentication required — safe for load balancer probes.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};
  let overallOk = true;

  // 1. Database connectivity
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'error' };
    overallOk = false;
  }

  // 2. Storage (local FS check)
  try {
    const storageRoot = process.env.STORAGE_LOCAL_ROOT || '/app/storage';
    const { promises: fs } = await import('fs');
    await fs.access(storageRoot);
    checks.storage = { status: 'ok' };
  } catch {
    checks.storage = { status: 'warning', latencyMs: 0 };
    // Storage warning doesn't fail the health check (S3 might not be mounted)
  }

  // 3. Environment
  const requiredEnv = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'SMART_EDMS_KEK'];
  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  checks.environment = {
    status: missingEnv.length === 0 ? 'ok' : 'error',
  };
  if (missingEnv.length > 0) {
    overallOk = false;
    checks.environment = { status: 'error' };
  }

  // 4. Process info
  checks.process = {
    status: 'ok',
  };

  const response = {
    status: overallOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    // SECURITY FIX (M-ADM-16): Drop `version` from the unauthenticated
    // response. The exact version publicly exposed lets an attacker
    // fingerprint the deployment against known CVEs in dependencies. The
    // version is now only available via the admin-only /api/admin/system-info
    // endpoint (to be added). `uptime` is safe to expose — it doesn't
    // fingerprint and is useful for monitoring.
    uptime: process.uptime ? Math.round(process.uptime()) : undefined,
    checks,
  };

  return NextResponse.json(response, {
    status: overallOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
