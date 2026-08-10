/**
 * Smart EDMS — Security anomalies
 * GET  /api/admin/anomalies                list unresolved anomalies
 *
 * The anomaly-resolve POST endpoint lives at:
 *   POST /api/admin/anomalies/[id]/resolve   { notes }
 *
 * SECURITY FIX (L-ADM-1): Removed the dead POST handler at the base route.
 * It referenced `params!.id` even though `params` is not in the route
 * signature for a non-dynamic route — `params` was always `undefined`, so
 * `params!.id` threw TypeError, which the createApiHandler wrapper caught
 * and returned as 500. The actual resolve endpoint at the `[id]/resolve`
 * subroute is the correct path. The dead code was duplicate and confusing.
 *
 * SECURITY FIX (L-ADM-5): Removed the inline `await detectAnomalies()`
 * call from GET. The cron job already runs detection hourly; running it
 * inline on every GET issued 4+ aggregate queries per page load. The
 * anomaly list now reflects what was last detected by the cron (or by
 * the explicit /api/admin/anomalies/detect endpoint if one is added).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_VIEW,
    // SECURITY FIX (L-INFRA-11): Rate-limit admin anomaly listing.
    rateLimit: { max: 30, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const items = await db.securityAnomaly.findMany({
      where: { tenantId: ctx.tenantId, resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items });
  },
);
