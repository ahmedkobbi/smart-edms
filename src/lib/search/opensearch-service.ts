/**
 * Smart EDMS — OpenSearch service
 *
 * Production-grade full-text search with Arabic analyzer support.
 *
 * Features:
 *   - Arabic text analysis (normalization, stemming, stopwords)
 *   - Multi-field indexing (title, description, tags, extracted text, metadata)
 *   - Permission-aware ACL filtering (tenant + classification + ownership)
 *   - Faceted search (classification, state, tags)
 *   - Highlighting
 *   - Fallback to Prisma LIKE queries if OpenSearch is unavailable
 *
 * Index: smart_edms_documents
 * Document ID: {tenantId}_{documentId}
 */

import { Client } from '@opensearch-project/opensearch';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { normalizeForSearch, buildSearchIndex } from '@/lib/i18n/arabic-search';

const INDEX_NAME = 'smart_edms_documents';

let client: Client | null = null;
let availabilityChecked = false;
let isAvailable = false;

/**
 * Get the OpenSearch client (singleton).
 * Returns null if not configured.
 */
function getClient(): Client | null {
  if (client) return client;

  const host = process.env.OPENSEARCH_HOST;
  if (!host) return null;

  try {
    client = new Client({
      node: host,
      auth: process.env.OPENSEARCH_USER
        ? {
            username: process.env.OPENSEARCH_USER,
            password: process.env.OPENSEARCH_PASS || '',
          }
        : undefined,
      ssl: process.env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED === 'false'
        ? { rejectUnauthorized: false }
        : undefined,
    });
    return client;
  } catch (err) {
    logger.warn('opensearch.client_init_failed', { error: (err as Error).message });
    return null;
  }
}

/**
 * Check if OpenSearch is available and the index exists.
 * Cached after first check (re-check on error).
 */
export async function isOpenSearchAvailable(): Promise<boolean> {
  if (availabilityChecked) return isAvailable;

  const c = getClient();
  if (!c) {
    availabilityChecked = true;
    isAvailable = false;
    return false;
  }

  try {
    const health = await c.cluster.health();
    isAvailable = health.statusCode === 200;
    availabilityChecked = true;

    if (isAvailable) {
      // Ensure index exists
      await ensureIndex(c);
      logger.info('opensearch.available', { host: process.env.OPENSEARCH_HOST });
    }
    return isAvailable;
  } catch (err) {
    logger.warn('opensearch.unavailable', { error: (err as Error).message });
    isAvailable = false;
    availabilityChecked = true;
    return false;
  }
}

/**
 * Reset availability cache (for retry after failure).
 */
export function resetAvailabilityCache() {
  availabilityChecked = false;
  isAvailable = false;
}

/**
 * Create the documents index with Arabic-aware mapping.
 *
 * The index uses a custom analyzer that:
 *   1. Normalizes Arabic text (tashkeel removal, hamza normalization)
 *   2. Applies Arabic stemming
 *   3. Filters Arabic stopwords
 *   4. Falls back to standard analysis for non-Arabic text
 */
async function ensureIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists.body) return;

  await client.indices.create({
    index: INDEX_NAME,
    body: {
      settings: {
        analysis: {
          analyzer: {
            // Arabic-aware analyzer with normalization
            smart_edms_arabic: {
              type: 'custom',
              tokenizer: 'standard',
              filter: [
                'lowercase',
                'arabic_normalization',
                'smart_edms_stop',
                'arabic_stemmer',
              ],
            },
            // General analyzer for mixed content
            smart_edms_default: {
              type: 'custom',
              tokenizer: 'standard',
              filter: [
                'lowercase',
                'smart_edms_stop',
              ],
            },
          },
          filter: {
            smart_edms_stop: {
              type: 'stop',
              stopwords: [
                // English stopwords
                'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
                // Arabic stopwords
                'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
                'التي', 'الذي', 'الذين', 'ما', 'هل', 'لا', 'لم', 'لن', 'قد', 'كان',
                'كل', 'بعض', 'غير', 'بين', 'أو', 'ثم', 'إذا', 'حتى', 'عند', 'لكن',
                'هو', 'هي', 'هم', 'نحن', 'أنا', 'إن', 'أن', 'كي', 'بعد', 'قبل',
                'ال', 'و', 'ف', 'ب', 'ل',
              ],
            },
            arabic_normalization: {
              type: 'arabic_normalization',
            },
            arabic_stemmer: {
              type: 'stemmer',
              language: 'arabic',
            },
          },
        },
      },
      mappings: {
        properties: {
          tenantId: { type: 'keyword' },
          documentId: { type: 'keyword' },
          title: {
            type: 'text',
            fields: {
              arabic: { type: 'text', analyzer: 'smart_edms_arabic' },
              default: { type: 'text', analyzer: 'smart_edms_default' },
              keyword: { type: 'keyword', ignore_above: 256 },
            },
          },
          description: {
            type: 'text',
            fields: {
              arabic: { type: 'text', analyzer: 'smart_edms_arabic' },
              default: { type: 'text', analyzer: 'smart_edms_default' },
            },
          },
          tags: { type: 'keyword' },
          documentType: { type: 'keyword' },
          state: { type: 'keyword' },
          classificationId: { type: 'keyword' },
          classificationCode: { type: 'keyword' },
          ownerId: { type: 'keyword' },
          folderId: { type: 'keyword' },
          documentLanguage: { type: 'keyword' },
          // Full-text content from OCR + text extraction
          content: {
            type: 'text',
            fields: {
              arabic: { type: 'text', analyzer: 'smart_edms_arabic' },
              default: { type: 'text', analyzer: 'smart_edms_default' },
            },
          },
          // Metadata — dynamic mapping so any metadata field is auto-indexed.
          // This enables filtering by metadata values (e.g. metadata.department,
          // metadata.caseNumber, metadata.jurisdiction).
          // String values are indexed as both `text` (for full-text search)
          // and `keyword` (for exact filtering / aggregations).
          metadata: {
            type: 'object',
            enabled: true,
            dynamic: true,
          },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    },
  });

  logger.info('opensearch.index_created', { index: INDEX_NAME });
}

/**
 * Index a document in OpenSearch.
 * Called after document upload/version creation.
 */
export async function indexDocument(tenantId: string, documentId: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const doc = await db.document.findFirst({
      where: { id: documentId, tenantId },
      include: {
        classification: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });

    if (!doc) return;

    // Get extracted text if available
    const textIndex = await db.documentTextIndex.findUnique({
      where: { documentId },
      select: { extractedText: true },
    });

    let tags: string[] = [];
    try { tags = JSON.parse(doc.tags || '[]'); } catch {}

    // Parse metadata JSON — this is indexed as a dynamic object so any
    // field (e.g. metadata.department, metadata.caseNumber) is searchable.
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(doc.metadata || '{}'); } catch {}

    const docBody = {
      tenantId,
      documentId: doc.id,
      title: doc.title,
      description: doc.description || '',
      tags,
      documentType: doc.documentType,
      state: doc.state,
      classificationId: doc.classificationId || '',
      classificationCode: doc.classification?.code || '',
      ownerId: doc.ownerId || '',
      folderId: doc.folderId || '',
      documentLanguage: doc.documentLanguage || 'en',
      content: textIndex?.extractedText || '',
      metadata,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };

    await client.index({
      id: `${tenantId}_${documentId}`,
      index: INDEX_NAME,
      body: docBody,
      refresh: false, // Don't refresh on every index (bulk is better)
    });

    logger.debug('opensearch.indexed', { documentId, tenantId });
  } catch (err) {
    logger.warn('opensearch.index_failed', { documentId, tenantId, error: (err as Error).message });
    resetAvailabilityCache();
  }
}

/**
 * Delete a document from the index.
 */
export async function deleteDocumentFromIndex(tenantId: string, documentId: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.delete({
      id: `${tenantId}_${documentId}`,
      index: INDEX_NAME,
    });
    logger.debug('opensearch.deleted', { documentId, tenantId });
  } catch (err) {
    // Ignore not found
    logger.debug('opensearch.delete_failed', { documentId, error: (err as Error).message });
  }
}

/**
 * Search documents with OpenSearch.
 *
 * Features:
 *   - Multi-field search (title, description, content)
 *   - Arabic analyzer applied automatically based on field type
 *   - ACL filtering (tenant + ownership/classification)
 *   - Faceted results
 *   - Highlighting
 *
 * Returns null if OpenSearch is not available (caller should fall back to Prisma).
 */
export async function searchDocuments(params: {
  tenantId: string;
  query: string;
  ownerId?: string;
  canReadAll?: boolean;
  classifications?: string[];
  states?: string[];
  tags?: string[];
  folderId?: string;
  /** Metadata field filters — key = field name, value = expected value(s). */
  metadata?: Record<string, string | string[]>;
  page: number;
  pageSize: number;
}): Promise<{
  items: any[];
  total: number;
  facets: {
    classifications: { id: string; count: number }[];
    states: { state: string; count: number }[];
    tags: { name: string; count: number }[];
    /** Top metadata field values (for the most common fields). */
    metadata: { field: string; value: string; count: number }[];
  };
  highlights: Record<string, string[]>;
} | null> {
  const client = getClient();
  if (!client || !(await isOpenSearchAvailable())) return null;

  const { tenantId, query, page, pageSize } = params;

  // Build the query
  const must: any[] = [
    { term: { tenantId } },
  ];

  // ACL: if user can't read all, restrict to owned
  if (!params.canReadAll && params.ownerId) {
    must.push({ term: { ownerId: params.ownerId } });
  }

  // Filters
  const filter: any[] = [];
  if (params.classifications?.length) {
    filter.push({ terms: { classificationCode: params.classifications } });
  }
  if (params.states?.length) {
    filter.push({ terms: { state: params.states } });
  }
  if (params.tags?.length) {
    filter.push({ terms: { tags: params.tags } });
  }
  if (params.folderId) {
    filter.push({ term: { folderId: params.folderId } });
  }
  // Metadata filters — each key becomes a `term` or `terms` filter on
  // `metadata.<fieldName>`. OpenSearch's dynamic mapping auto-creates
  // keyword subfields for string values, so we filter on the keyword
  // subfield for exact matches.
  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      if (value == null) continue;
      const fieldPath = `metadata.${key}`;
      if (Array.isArray(value)) {
        // Multiple values → terms (OR) query on the keyword subfield
        filter.push({ terms: { [`${fieldPath}.keyword`]: value } });
      } else {
        // Single value → term query on the keyword subfield
        filter.push({ term: { [`${fieldPath}.keyword`]: value } });
      }
    }
  }

  // Text query — search both Arabic and default analyzers
  // Also includes metadata.* (wildcard) so metadata values are full-text searchable
  if (query && query.trim()) {
    const normalized = normalizeForSearch(query);
    must.push({
      multi_match: {
        query: normalized || query,
        fields: [
          'title^3',
          'title.arabic^3',
          'title.default^2',
          'description^2',
          'description.arabic^2',
          'content',
          'content.arabic',
          'content.default',
          'tags',
          'metadata.*', // all metadata text fields
        ],
        type: 'best_fields',
        fuzziness: 'AUTO',
        minimum_should_match: '75%',
      },
    });
  }

  const searchBody = {
    query: {
      bool: {
        must,
        filter,
      },
    },
    from: (page - 1) * pageSize,
    size: pageSize,
    sort: [{ _score: 'desc' }, { updatedAt: 'desc' }],
    highlight: {
      fields: {
        title: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
        description: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
        'content.default': { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 150, number_of_fragments: 3 },
        'content.arabic': { pre_tags: ['<mark>'], post_tags: ['</mark>'], fragment_size: 150, number_of_fragments: 3 },
      },
    },
    aggregations: {
      classifications: {
        terms: { field: 'classificationId', size: 20 },
      },
      states: {
        terms: { field: 'state', size: 10 },
      },
      tags: {
        terms: { field: 'tags', size: 30 },
      },
      // Metadata facets — we can't aggregate over all metadata fields
      // dynamically (OpenSearch doesn't support wildcard aggregations),
      // so we aggregate over the most common fields if they exist.
      // Admins can extend this list via tenant settings in a future iteration.
      metadataDepartments: {
        terms: { field: 'metadata.department.keyword', size: 15, missing: '__none__' },
      },
      metadataDocumentTypes: {
        terms: { field: 'metadata.documentType.keyword', size: 15, missing: '__none__' },
      },
      metadataJurisdictions: {
        terms: { field: 'metadata.jurisdiction.keyword', size: 10, missing: '__none__' },
      },
    },
  };

  try {
    const result = await client.search({
      index: INDEX_NAME,
      body: searchBody,
    });

    const hits = result.body.hits;
    const aggregations = result.body.aggregations;

    const items = hits.hits.map((hit: any) => ({
      id: hit._source.documentId,
      _score: hit._score,
      title: hit._source.title,
      description: hit._source.description,
      state: hit._source.state,
      documentType: hit._source.documentType,
      classificationId: hit._source.classificationId || null,
      classificationCode: hit._source.classificationCode || null,
      ownerId: hit._source.ownerId,
      folderId: hit._source.folderId,
      documentLanguage: hit._source.documentLanguage,
      tags: hit._source.tags,
      updatedAt: hit._source.updatedAt,
      createdAt: hit._source.createdAt,
      highlight: hit.highlight,
    }));

    // Fetch full document data from DB (for owner info, classification details)
    const docIds = items.map((i: any) => i.id);
    const dbDocs = await db.document.findMany({
      where: { id: { in: docIds }, tenantId },
      include: {
        classification: { select: { id: true, code: true, name: true, color: true } },
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { versions: true } },
      },
    });
    const dbMap = new Map(dbDocs.map((d) => [d.id, d]));
    const mergedItems = items
      .map((i: any) => {
        const dbDoc = dbMap.get(i.id);
        if (!dbDoc) return null;
        return { ...dbDoc, _score: i._score, highlight: i.highlight };
      })
      .filter(Boolean);

    return {
      items: mergedItems,
      total: hits.total?.value || 0,
      facets: {
        classifications: (aggregations?.classifications?.buckets || []).map((b: any) => ({
          id: b.key,
          count: b.doc_count,
        })),
        states: (aggregations?.states?.buckets || []).map((b: any) => ({
          state: b.key,
          count: b.doc_count,
        })),
        tags: (aggregations?.tags?.buckets || []).map((b: any) => ({
          name: b.key,
          count: b.doc_count,
        })),
        // Metadata facets — flatten the 3 aggregation buckets into a
        // single list of { field, value, count } entries.
        metadata: [
          ...(aggregations?.metadataDepartments?.buckets || [])
            .filter((b: any) => b.key !== '__none__')
            .map((b: any) => ({ field: 'department', value: b.key, count: b.doc_count })),
          ...(aggregations?.metadataDocumentTypes?.buckets || [])
            .filter((b: any) => b.key !== '__none__')
            .map((b: any) => ({ field: 'documentType', value: b.key, count: b.doc_count })),
          ...(aggregations?.metadataJurisdictions?.buckets || [])
            .filter((b: any) => b.key !== '__none__')
            .map((b: any) => ({ field: 'jurisdiction', value: b.key, count: b.doc_count })),
        ],
      },
      highlights: {},
    };
  } catch (err) {
    logger.warn('opensearch.search_failed', { error: (err as Error).message, query });
    resetAvailabilityCache();
    return null;
  }
}

/**
 * Bulk reindex all documents for a tenant.
 * Used when setting up OpenSearch for the first time or after schema changes.
 */
export async function reindexTenant(tenantId: string): Promise<{ indexed: number; failed: number }> {
  const client = getClient();
  if (!client || !(await isOpenSearchAvailable())) {
    return { indexed: 0, failed: 0 };
  }

  const docs = await db.document.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true },
  });

  let indexed = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      await indexDocument(tenantId, doc.id);
      indexed++;
    } catch {
      failed++;
    }
  }

  // Refresh index to make documents searchable immediately
  await client.indices.refresh({ index: INDEX_NAME });

  logger.info('opensearch.reindexed', { tenantId, indexed, failed, total: docs.length });
  return { indexed, failed };
}
