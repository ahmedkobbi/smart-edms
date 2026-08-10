/**
 * Smart EDMS — Search reindex endpoint
 * POST /api/admin/search/reindex?scope=keyword|semantic|all
 *
 * Triggers a bulk reindex of all tenant documents.
 *   - scope=keyword (default): re-index into OpenSearch (BM25 keyword search)
 *   - scope=semantic: regenerate DocumentEmbedding rows (cosine semantic search)
 *   - scope=all: both
 *
 * Use when:
 *   - Setting up OpenSearch for the first time
 *   - After index mapping changes
 *   - After data migrations
 *   - After enabling AI for a tenant (semantic embeddings)
 *   - After swapping the embedding model (EMBEDDING_MODEL change)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { reindexTenant, isOpenSearchAvailable } from '@/lib/search/opensearch-service';
import { reindexTenantEmbeddings } from '@/lib/search/semantic-search';
import { logger } from '@/lib/config/logger';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    rateLimit: { max: 1, windowMs: 5 * 60_000 }, // max 1 per 5 minutes
    audit: { eventType: 'admin.search.reindex', action: 'create', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const scope = (req.nextUrl.searchParams.get('scope') || 'keyword').toLowerCase();
    if (!['keyword', 'semantic', 'all'].includes(scope)) {
      return NextResponse.json(
        { error: { code: 'invalid_scope', message: 'scope must be one of: keyword, semantic, all' } },
        { status: 400 },
      );
    }

    logger.info('search.reindex_started', { tenantId: ctx.tenantId, actorId: ctx.userId, scope });

    // Try to enqueue as a background job (production with Redis)
    try {
      const { enqueueReindexJob, isRedisAvailable } = await import('@/lib/queue/redis-queue');
      const redisOk = await isRedisAvailable();
      if (redisOk) {
        const result = await enqueueReindexJob({
          tenantId: ctx.tenantId,
          scope: scope as 'keyword' | 'semantic' | 'all',
          startedBy: ctx.userId,
        });
        return NextResponse.json({
          ok: true,
          scope,
          queued: true,
          jobId: result.jobId,
          message: `Reindex queued as background job. Check Admin → Jobs for progress.`,
        });
      }
    } catch {
      // Redis not available — fall through to inline reindex
    }

    // --- Inline reindex (dev mode without Redis) ---
    const response: any = { ok: true, scope, queued: false };

    if (scope === 'keyword' || scope === 'all') {
      const available = await isOpenSearchAvailable();
      if (!available) {
        if (scope === 'keyword') {
          return NextResponse.json(
            { error: { code: 'opensearch_unavailable', message: 'OpenSearch is not configured or unreachable. Set OPENSEARCH_HOST in environment.' } },
            { status: 503 },
          );
        }
        response.keyword = { skipped: true, reason: 'opensearch_unavailable' };
      } else {
        response.keyword = await reindexTenant(ctx.tenantId);
      }
    }

    if (scope === 'semantic' || scope === 'all') {
      // Semantic reindex works without OpenSearch — it only needs the
      // DocumentTextIndex rows that are always present.
      response.semantic = await reindexTenantEmbeddings(ctx.tenantId);
    }

    const parts: string[] = [];
    if (response.keyword && !response.keyword.skipped) {
      parts.push(`keyword: ${response.keyword.indexed} indexed, ${response.keyword.failed} failed`);
    }
    if (response.semantic) {
      parts.push(`semantic: ${response.semantic.generated} generated, ${response.semantic.cached} cached, ${response.semantic.failed} failed`);
    }
    response.message = parts.length > 0 ? `Reindex complete — ${parts.join('; ')}.` : 'Reindex complete.';

    return NextResponse.json(response);
  },
);
