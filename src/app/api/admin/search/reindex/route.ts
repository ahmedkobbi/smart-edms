/**
 * Smart EDMS — Search reindex endpoint
 * POST /api/admin/search/reindex
 *
 * Triggers a bulk reindex of all tenant documents into OpenSearch.
 * Use when:
 *   - Setting up OpenSearch for the first time
 *   - After index mapping changes
 *   - After data migrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { reindexTenant, isOpenSearchAvailable } from '@/lib/search/opensearch-service';
import { logger } from '@/lib/config/logger';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    rateLimit: { max: 1, windowMs: 5 * 60_000 }, // max 1 per 5 minutes
    audit: { eventType: 'admin.search.reindex', action: 'create', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const available = await isOpenSearchAvailable();
    if (!available) {
      return NextResponse.json(
        { error: { code: 'opensearch_unavailable', message: 'OpenSearch is not configured or unreachable. Set OPENSEARCH_HOST in environment.' } },
        { status: 503 },
      );
    }

    logger.info('search.reindex_started', { tenantId: ctx.tenantId, actorId: ctx.userId });

    const result = await reindexTenant(ctx.tenantId);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Reindexed ${result.indexed} document(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
    });
  },
);
