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
import { normalizeForSearch, expandArabicSynonyms } from '@/lib/i18n/arabic-search';
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
  /**
   * Metadata field filters. Format: `key:value` or `key:value1,value2`.
   * Multiple filters: repeat the param or use `&metadata.department=Finance&metadata.jurisdiction=EU,US`.
   * OpenSearch filters on `metadata.<key>.keyword` for exact matches.
   */
  metadata: z.union([z.string(), z.array(z.string())]).optional(),
  sort: z.enum(['relevance', 'createdAt:desc', 'createdAt:asc', 'title:asc', 'updatedAt:desc']).default('relevance'),
});

/**
 * Parse the `metadata` query param into a Record<string, string[]>.
 *
 * Supports two formats:
 *   1. Single string: "department:Finance,jurisdiction:EU"
 *      → { department: ['Finance'], jurisdiction: ['EU'] }
 *   2. Array (repeated param): ["department:Finance", "jurisdiction:EU,US"]
 *      → { department: ['Finance'], jurisdiction: ['EU', 'US'] }
 */
function parseMetadataParam(raw: string | string[] | undefined): Record<string, string[]> | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const result: Record<string, string[]> = {};
  for (const item of items) {
    const colonIdx = item.indexOf(':');
    if (colonIdx === -1) continue;
    const key = item.slice(0, colonIdx).trim();
    const values = item.slice(colonIdx + 1).split(',').map((v) => v.trim()).filter(Boolean);
    if (!key || values.length === 0) continue;
    if (!result[key]) result[key] = [];
    result[key].push(...values);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const GET = createApiHandler(
  {
    requiredPermission: PERMISSIONS.SEARCH_USE,
    // SECURITY FIX (L-DOC-5): Rate-limit search. Each request runs OpenSearch
    // + semantic hybrid re-ranking (cosine similarity over embeddings) — CPU
    // intensive. Without a cap, a user can issue hundreds of requests/min and
    // exhaust OpenSearch and the embeddings cache.
    rateLimit: { max: 60, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx) => {
    const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const canReadAll = hasPermission(ctx.session.user.permissions, PERMISSIONS.DOCUMENT_READ);

    const classificationCodes = q.classifications ? q.classifications.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const tagList = q.tags ? q.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Parse metadata filters from query params.
    // Supports: ?metadata=department:Finance  OR  ?metadata=department:Finance,jurisdiction:EU,US
    // OR repeated: ?metadata=department:Finance&metadata=jurisdiction:EU,US
    // Note: next/url searchParams only returns the first value for repeated
    // keys via .get(), so we use .getAll() for multi-value support.
    const rawMetadata = req.nextUrl.searchParams.getAll('metadata');
    const metadataFilters = parseMetadataParam(rawMetadata.length > 0 ? rawMetadata : q.metadata as string | string[] | undefined);

    // ── Try OpenSearch first (production-grade FTS with Arabic analyzer) ──
    // Expand Arabic synonyms before searching so documents containing
    // synonym variants are also matched.
    const expandedQuery = expandArabicSynonyms(q.q);
    if (await isOpenSearchAvailable()) {
      const osResult = await osSearch({
        tenantId: ctx.tenantId,
        query: expandedQuery,
        ownerId: ctx.userId,
        canReadAll,
        classifications: classificationCodes,
        states: q.state ? [q.state] : undefined,
        tags: tagList.length > 0 ? tagList : undefined,
        folderId: q.folderId || undefined,
        metadata: metadataFilters,
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
            metadata: osResult.facets.metadata || [],
          },
        });
      }
    }

    // ── Fallback: Prisma LIKE queries (dev mode or OpenSearch unavailable) ──
    // Note: Prisma's SQLite provider doesn't support JSON path queries,
    // so metadata filtering is approximated by a `contains` check on the
    // raw metadata JSON string. This is less precise than OpenSearch
    // (it matches substrings, not field values) but covers the common case.
    const metadataFilterConditions: any[] = [];
    if (metadataFilters) {
      for (const [key, values] of Object.entries(metadataFilters)) {
        for (const value of values) {
          // Match "key":"value" in the JSON string (approximate)
          metadataFilterConditions.push({
            metadata: { contains: `"${key}":"${value}"` },
          });
          // Also match with a space after the colon (common JSON formatting)
          metadataFilterConditions.push({
            metadata: { contains: `"${key}": "${value}"` },
          });
        }
      }
    }

    const where = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(canReadAll ? {} : { ownerId: ctx.userId }),
      ...(classificationCodes.length > 0 ? { classification: { code: { in: classificationCodes } } } : {}),
      ...(q.state ? { state: q.state } : {}),
      ...(q.folderId ? { folderId: q.folderId } : {}),
      ...(metadataFilterConditions.length > 0 ? { AND: metadataFilterConditions } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q } },
              { description: { contains: q.q } },
              { tags: { contains: q.q } },
              { title: { contains: normalizeForSearch(q.q) } },
              { description: { contains: normalizeForSearch(q.q) } },
              // Also search metadata JSON for the query text
              { metadata: { contains: q.q } },
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
    // SECURITY FIX (M-DOC-14): Only return full-text snippets for documents
    // the caller already owns or has been shared. Previously the fallback
    // path ran `searchTextIndex(tenantId, q)` which filtered ONLY by tenantId —
    // an end user could read snippets from any tenant document whose
    // extracted text contained the query.
    let fullTextMatches: { documentId: string; snippet: string }[] = [];
    if (q.q && q.q.length >= 3) {
      try {
        fullTextMatches = await searchTextIndex(ctx.tenantId, q.q, {
          limit: 10,
          // Filter snippets to documents the caller can read. For end users
          // (without DOCUMENT_READ), this restricts to owned documents.
          ownerId: canReadAll ? undefined : ctx.userId,
        });
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
    // SECURITY FIX (M-DOC-15): Use SQL GROUP BY aggregation instead of loading
    // every matching document row into the Node process. The previous code
    // ran `db.document.findMany({ ... select: { classificationId, tags, state } })`
    // with no pagination — for a tenant with 1M documents this loaded 1M rows
    // + parsed 1M JSON tag strings per request. Now we run three aggregate
    // queries that return at most a few hundred rows each.
    const facetWhere = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(canReadAll ? {} : { ownerId: ctx.userId }),
    };
    const [classificationFacetsRaw, stateFacetsRaw] = await Promise.all([
      db.document.groupBy({
        by: ['classificationId'],
        where: facetWhere,
        _count: { classificationId: true },
      }),
      db.document.groupBy({
        by: ['state'],
        where: facetWhere,
        _count: { state: true },
      }),
    ]);

    // For tags we still need to parse JSON (Prisma can't group by JSON array
    // elements). To bound the work, only compute tag facets on the current
    // page of results — this gives a representative sample for the UI without
    // loading every document. (For precise tag facets, use OpenSearch.)
    const tagFacet = new Map<string, number>();
    for (const d of filtered) {
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
        classifications: classificationFacetsRaw.map((r) => ({ id: r.classificationId, count: r._count.classificationId })),
        tags: Array.from(tagFacet.entries()).map(([name, count]) => ({ name, count })),
        states: stateFacetsRaw.map((r) => ({ state: r.state, count: r._count.state })),
        metadata: [], // Prisma fallback doesn't compute metadata facets
      },
    });
  },
);
