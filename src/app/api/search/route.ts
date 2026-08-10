/**
 * Smart EDMS — Search
 * GET /api/search?q=&classifications=&tags=&from=&to=&page=&pageSize=
 *
 * Permission-aware: returns only documents the caller can read.
 * For end users (without document:read), restricts to owned documents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { searchTextIndex } from '@/lib/documents/text-extraction';
import { normalizeForSearch } from '@/lib/i18n/arabic-search';
import { searchDocuments as osSearch, isOpenSearchAvailable, indexDocument } from '@/lib/search/opensearch-service';
import { hybridSearch } from '@/lib/search/semantic-search';
import { logger } from '@/lib/config/logger';
import { z } from 'zod';

const querySchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  classifications: z.string().optional(), // comma-separated codes
  tags: z.string().optional(),
  state: z.string().optional(),
  folderId: z.string().optional(),
  sort: z.enum(['relevance', 'createdAt:desc', 'createdAt:asc', 'title:asc', 'updatedAt:desc']).default('relevance'),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SEARCH_USE },
  async (req: NextRequest, ctx) => {
    const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const canReadAll = hasPermission(ctx.session.user.permissions, PERMISSIONS.DOCUMENT_READ);

    const classificationCodes = q.classifications ? q.classifications.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const tagList = q.tags ? q.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // ── Try OpenSearch first (production-grade FTS with Arabic analyzer) ──
    if (await isOpenSearchAvailable()) {
      const osResult = await osSearch({
        tenantId: ctx.tenantId,
        query: q.q,
        ownerId: ctx.userId,
        canReadAll,
        classifications: classificationCodes,
        states: q.state ? [q.state] : undefined,
        tags: tagList.length > 0 ? tagList : undefined,
        folderId: q.folderId || undefined,
        page: q.page,
        pageSize: q.pageSize,
      });

      if (osResult) {
        logger.debug('search.opensearch', {
          query: q.q,
          total: osResult.total,
          returned: osResult.items.length,
        });

        // ── Hybrid search: combine keyword (OpenSearch BM25) + semantic (cosine) ──
        // Run semantic search in parallel-restricted mode (only score documents
        // the keyword search returned) and fuse via Reciprocal Rank Fusion.
        // If semantic search is unavailable (no embeddings indexed), the
        // keyword results pass through unchanged.
        let hybridItems = osResult.items;
        let searchEngine = 'opensearch';
        try {
          const keywordRanked = osResult.items.map((it: any) => ({
            documentId: it.id,
            score: typeof it._score === 'number' ? it._score : undefined,
          }));
          const fused = await hybridSearch(ctx.tenantId, q.q, keywordRanked, {
            limit: q.pageSize,
          });
          if (fused && fused.length > 0) {
            // Re-order the OpenSearch items by the fused score
            const fusedMap = new Map(fused.map((f) => [f.documentId, f]));
            hybridItems = osResult.items
              .map((it: any) => {
                const f = fusedMap.get(it.id);
                return f ? { ...it, _score: f.score, semanticScore: f.semanticScore, semanticSummary: f.summary } : it;
              })
              .sort((a: any, b: any) => (b._score ?? 0) - (a._score ?? 0));
            searchEngine = 'hybrid';
          }
        } catch (err) {
          logger.warn('search.hybrid_failed', { error: (err as Error).message });
        }

        return NextResponse.json({
          items: hybridItems,
          total: osResult.total,
          page: q.page,
          pageSize: q.pageSize,
          query: q.q,
          searchEngine,
          highlights: osResult.highlights,
          facets: {
            classifications: osResult.facets.classifications,
            tags: osResult.facets.tags,
            states: osResult.facets.states,
          },
        });
      }
    }

    // ── Fallback: Prisma LIKE queries (dev mode or OpenSearch unavailable) ──
    const where = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(canReadAll ? {} : { ownerId: ctx.userId }),
      ...(classificationCodes.length > 0 ? { classification: { code: { in: classificationCodes } } } : {}),
      ...(q.state ? { state: q.state } : {}),
      ...(q.folderId ? { folderId: q.folderId } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q } },
              { description: { contains: q.q } },
              { tags: { contains: q.q } },
              { title: { contains: normalizeForSearch(q.q) } },
              { description: { contains: normalizeForSearch(q.q) } },
            ],
          }
        : {}),
    };

    const orderBy =
      q.sort === 'createdAt:desc' ? { createdAt: 'desc' as const }
      : q.sort === 'createdAt:asc' ? { createdAt: 'asc' as const }
      : q.sort === 'title:asc' ? { title: 'asc' as const }
      : q.sort === 'updatedAt:desc' ? { updatedAt: 'desc' as const }
      : { createdAt: 'desc' as const };

    const [total, items] = await Promise.all([
      db.document.count({ where }),
      db.document.findMany({
        where,
        include: {
          classification: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { versions: true } },
        },
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    // Augment with full-text matches from DocumentTextIndex (OCR + extracted)
    let fullTextMatches: { documentId: string; snippet: string }[] = [];
    if (q.q && q.q.length >= 3) {
      try {
        fullTextMatches = await searchTextIndex(ctx.tenantId, q.q, { limit: 10 });
      } catch {
        // ignore if text index unavailable
      }
    }

    // Filter by tags (post-query because tags are JSON-encoded)
    let filtered = items;
    if (tagList.length > 0) {
      filtered = items.filter((d) => {
        try {
          const tags: string[] = JSON.parse(d.tags || '[]');
          return tagList.some((t) => tags.includes(t));
        } catch {
          return false;
        }
      });
    }

    // Compute facets
    const allMatching = await db.document.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null, ...(canReadAll ? {} : { ownerId: ctx.userId }) },
      select: { classificationId: true, tags: true, state: true },
    });

    const classificationFacet = new Map<string, number>();
    const tagFacet = new Map<string, number>();
    const stateFacet = new Map<string, number>();
    for (const d of allMatching) {
      if (d.classificationId) classificationFacet.set(d.classificationId, (classificationFacet.get(d.classificationId) ?? 0) + 1);
      stateFacet.set(d.state, (stateFacet.get(d.state) ?? 0) + 1);
      try {
        const tags: string[] = JSON.parse(d.tags || '[]');
        for (const t of tags) tagFacet.set(t, (tagFacet.get(t) ?? 0) + 1);
      } catch {}
    }

    // ── Hybrid enhancement for Prisma fallback ──
    // Even without OpenSearch, we can re-rank the Prisma results using
    // semantic similarity. This is best-effort — if no embeddings are
    // cached, the original Prisma order is preserved.
    let hybridFiltered = filtered;
    let prismaSearchEngine = 'prisma';
    if (q.q && q.q.trim().length > 0) {
      try {
        const keywordRanked = filtered.map((d: any) => ({ documentId: d.id, score: undefined }));
        const fused = await hybridSearch(ctx.tenantId, q.q, keywordRanked, { limit: filtered.length });
        if (fused && fused.length > 0) {
          const fusedMap = new Map(fused.map((f) => [f.documentId, f]));
          hybridFiltered = filtered
            .map((d: any) => {
              const f = fusedMap.get(d.id);
              return f ? { ...d, _score: f.score, semanticScore: f.semanticScore, semanticSummary: f.summary } : d;
            })
            .sort((a: any, b: any) => (b._score ?? 0) - (a._score ?? 0));
          prismaSearchEngine = 'prisma+semantic';
        }
      } catch (err) {
        logger.warn('search.prisma_hybrid_failed', { error: (err as Error).message });
      }
    }

    return NextResponse.json({
      items: hybridFiltered,
      total: tagList.length > 0 ? hybridFiltered.length : total,
      page: q.page,
      pageSize: q.pageSize,
      query: q.q,
      searchEngine: prismaSearchEngine, // Indicates fallback mode (+ semantic re-rank if available)
      fullTextMatches,
      facets: {
        classifications: Array.from(classificationFacet.entries()).map(([id, count]) => ({ id, count })),
        tags: Array.from(tagFacet.entries()).map(([name, count]) => ({ name, count })),
        states: Array.from(stateFacet.entries()).map(([state, count]) => ({ state, count })),
      },
    });
  },
);
