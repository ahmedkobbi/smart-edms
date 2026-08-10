/**
 * Smart EDMS — Enterprise-grade text extraction + OCR pipeline
 *
 * Architecture:
 *   1. Text extraction (no OCR):
 *      - text/* + JSON: read directly
 *      - PDF: pdfjs-dist getTextContent() (proper font/CID/FlateDecode handling)
 *      - OOXML (.docx/.xlsx/.pptx): JSZip + XML parsing (real decompression)
 *      - ODF: same zip approach
 *   2. OCR (when text extraction yields < threshold):
 *      - Images: tesseract CLI with configurable languages
 *      - Scanned PDFs: pdfjs-dist page rasterization → PNG → tesseract per page
 *   3. Language detection: franc (before OCR for language selection,
 *      after OCR for document language metadata)
 *   4. Confidence tracking: tesseract TSV output → per-page + mean confidence
 *   5. Raw text persistence: original text preserved for display/AI/exports;
 *      normalized text used only for search index
 *   6. Audit events: document.ocr.started/completed/failed
 *   7. Per-tenant config: languages, DPI, maxPages, minConfidence
 *
 * OCR is opt-in per tenant via settings.features.ocr (default: true).
 * Language selection is per-tenant via settings.ocr.languages (default: ['eng','ara']).
 */

import { db } from '@/lib/db';
import { getFileStorage } from '@/lib/storage/file-storage';
import { buildSearchIndex } from '@/lib/i18n/arabic-search';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface OcrConfig {
  enabled: boolean;
  languages: string[];      // e.g. ['eng', 'ara', 'fra']
  dpi: number;              // render DPI for PDF rasterization (default 300)
  maxPages: number;         // max pages to OCR (default 50)
  minConfidence: number;    // below this %, mark as low_confidence (default 70)
}

export interface OcrResult {
  text: string;
  confidence: number | null;     // mean confidence 0-100
  pageConfidences: number[];     // per-page confidence
  engine: string;                // 'tesseract_cli' | 'none'
  languages: string;             // e.g. "eng+ara"
  durationMs: number;
  pageCount: number;
}

export interface TextExtractionResult {
  extractedText: string;        // normalized for search
  rawText: string;              // original case, no normalization
  ocrApplied: boolean;
  ocrConfidence: number | null;
  ocrPageConfidences: number[];
  ocrEngine: string;
  ocrLanguages: string;
  ocrDurationMs: number | null;
  pageCount: number;
  language: string;
}

// ---------------------------------------------------------------------------
//  Tenant OCR config resolution
// ---------------------------------------------------------------------------

const DEFAULT_OCR_CONFIG: OcrConfig = {
  enabled: true,
  languages: ['eng', 'ara'],
  dpi: 300,
  maxPages: 50,
  minConfidence: 70,
};

/**
 * Resolve OCR config from tenant settings.
 * Falls back to defaults if settings are missing or invalid.
 */
export async function getOcrConfig(tenantId: string): Promise<OcrConfig> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = JSON.parse(tenant?.settings || '{}');
    const ocrSettings = settings?.ocr ?? {};
    const features = settings?.features ?? {};

    return {
      enabled: features.ocr !== false,
      languages: Array.isArray(ocrSettings.languages) && ocrSettings.languages.length > 0
        ? ocrSettings.languages
        : DEFAULT_OCR_CONFIG.languages,
      dpi: typeof ocrSettings.dpi === 'number' ? ocrSettings.dpi : DEFAULT_OCR_CONFIG.dpi,
      maxPages: typeof ocrSettings.maxPages === 'number' ? ocrSettings.maxPages : DEFAULT_OCR_CONFIG.maxPages,
      minConfidence: typeof ocrSettings.minConfidence === 'number' ? ocrSettings.minConfidence : DEFAULT_OCR_CONFIG.minConfidence,
    };
  } catch {
    return DEFAULT_OCR_CONFIG;
  }
}

// ---------------------------------------------------------------------------
//  Main entry: indexDocumentText
// ---------------------------------------------------------------------------

/**
 * Extract text from a document version, run OCR if needed, and persist
 * to DocumentTextIndex for full-text search + AI analysis.
 *
 * This function is designed to be called from:
 *   - Initial upload (POST /api/documents)
 *   - New version upload (POST /api/documents/:id/versions)
 *   - Version restore (POST /api/documents/:id/versions/:vid/restore)
 *   - Manual re-OCR (POST /api/documents/:id/reindex)
 *
 * It updates the Document.ocrStatus field so the UI can show OCR state.
 */
export async function indexDocumentText(
  tenantId: string,
  documentId: string,
  versionId: string,
): Promise<TextExtractionResult> {
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, tenantId, documentId },
  });
  if (!version) throw new Error('Version not found');

  const storage = getFileStorage();
  const buf = await storage.get(version.storageKey);
  const config = await getOcrConfig(tenantId);

  // Mark OCR as processing
  await db.document.update({
    where: { id: documentId },
    data: { ocrStatus: 'processing' },
  }).catch(() => {});

  let result: TextExtractionResult;

  try {
    // --- Step 1: Text extraction (no OCR) ---
    let extractedText = '';
    let pageCount = 0;

    if (version.mimeType.startsWith('text/') || version.mimeType === 'application/json') {
      extractedText = buf.toString('utf-8').slice(0, 200_000);
    } else if (version.mimeType === 'application/pdf') {
      const pdfResult = await extractPdfText(buf);
      extractedText = pdfResult.text;
      pageCount = pdfResult.pageCount;
    } else if (isOoxmlMime(version.mimeType) || isOdfMime(version.mimeType)) {
      extractedText = await extractZipXmlText(buf, version.mimeType);
    }

    // --- Step 2: OCR (when text extraction yields < threshold) ---
    let ocrResult: OcrResult | null = null;

    const needsOcr = config.enabled && extractedText.length < 50 &&
      (version.mimeType.startsWith('image/') || version.mimeType === 'application/pdf');

    if (needsOcr) {
      // Audit: OCR started
      await recordAuditEvent({
        tenantId,
        actorId: 'system',
        actorEmail: 'system@smartedms.local',
        eventType: 'document.ocr.started',
        action: 'create',
        resourceType: 'document',
        resourceId: documentId,
        result: 'allow',
        metadata: {
          versionId,
          mimeType: version.mimeType,
          languages: config.languages,
          dpi: config.dpi,
          maxPages: config.maxPages,
        },
      }).catch(() => {});

      const ocrStartTime = Date.now();

      try {
        if (version.mimeType === 'application/pdf') {
          // Scanned PDF: rasterize each page with pdfjs-dist, then OCR
          ocrResult = await ocrScannedPdf(buf, config);
        } else if (version.mimeType.startsWith('image/')) {
          // Direct image OCR
          ocrResult = await ocrImage(buf, version.mimeType, config);
        }

        if (ocrResult && ocrResult.text.length > extractedText.length) {
          extractedText = ocrResult.text;
        }
      } catch (err) {
        logger.warn('ocr.failed', {
          documentId,
          versionId,
          error: (err as Error).message,
        });

        // Audit: OCR failed
        await recordAuditEvent({
          tenantId,
          actorId: 'system',
          actorEmail: 'system@smartedms.local',
          eventType: 'document.ocr.failed',
          action: 'create',
          resourceType: 'document',
          resourceId: documentId,
          result: 'deny',
          reason: (err as Error).message,
          metadata: { versionId, durationMs: Date.now() - ocrStartTime },
        }).catch(() => {});
      }
    }

    // --- Step 3: Language detection ---
    const detectedLang = await detectLanguageAdvanced(extractedText);

    // --- Step 4: Build search-optimized text (normalized) ---
    const searchText = buildSearchIndex(extractedText);

    // --- Step 5: Determine OCR status ---
    let ocrStatus = 'skipped';
    if (ocrResult) {
      if (ocrResult.confidence !== null && ocrResult.confidence < config.minConfidence) {
        ocrStatus = 'low_confidence';
      } else {
        ocrStatus = 'success';
      }
    } else if (needsOcr) {
      ocrStatus = 'failed';
    } else if (!config.enabled) {
      ocrStatus = 'skipped';
    } else {
      ocrStatus = 'success'; // text extraction without OCR succeeded
    }

    // --- Step 6: Persist ---
    await db.documentTextIndex.upsert({
      where: { documentId },
      update: {
        versionId,
        extractedText: searchText,
        rawText: extractedText,
        ocrApplied: !!ocrResult,
        ocrConfidence: ocrResult?.confidence ?? null,
        ocrPageConfidences: JSON.stringify(ocrResult?.pageConfidences ?? []),
        ocrEngine: ocrResult?.engine ?? 'none',
        ocrLanguages: ocrResult?.languages ?? '',
        ocrDurationMs: ocrResult?.durationMs ?? null,
        language: detectedLang,
        pageCount: pageCount || ocrResult?.pageCount || 0,
        indexedAt: new Date(),
      },
      create: {
        tenantId,
        documentId,
        versionId,
        extractedText: searchText,
        rawText: extractedText,
        ocrApplied: !!ocrResult,
        ocrConfidence: ocrResult?.confidence ?? null,
        ocrPageConfidences: JSON.stringify(ocrResult?.pageConfidences ?? []),
        ocrEngine: ocrResult?.engine ?? 'none',
        ocrLanguages: ocrResult?.languages ?? '',
        ocrDurationMs: ocrResult?.durationMs ?? null,
        language: detectedLang,
        pageCount: pageCount || ocrResult?.pageCount || 0,
      },
    });

    // Update document OCR status + language
    await db.document.update({
      where: { id: documentId },
      data: {
        ocrStatus,
        documentLanguage: detectedLang,
        textDirection: detectedLang === 'ar' ? 'rtl' : 'ltr',
      },
    }).catch(() => {});

    // Audit: OCR completed
    if (ocrResult) {
      await recordAuditEvent({
        tenantId,
        actorId: 'system',
        actorEmail: 'system@smartedms.local',
        eventType: 'document.ocr.completed',
        action: 'create',
        resourceType: 'document',
        resourceId: documentId,
        result: 'allow',
        metadata: {
          versionId,
          ocrApplied: true,
          engine: ocrResult.engine,
          languages: ocrResult.languages,
          confidence: ocrResult.confidence,
          pageConfidences: ocrResult.pageConfidences,
          durationMs: ocrResult.durationMs,
          pageCount: ocrResult.pageCount,
          ocrStatus,
        },
      }).catch(() => {});
    }

    result = {
      extractedText: searchText,
      rawText: extractedText,
      ocrApplied: !!ocrResult,
      ocrConfidence: ocrResult?.confidence ?? null,
      ocrPageConfidences: ocrResult?.pageConfidences ?? [],
      ocrEngine: ocrResult?.engine ?? 'none',
      ocrLanguages: ocrResult?.languages ?? '',
      ocrDurationMs: ocrResult?.durationMs ?? null,
      pageCount: pageCount || ocrResult?.pageCount || 0,
      language: detectedLang,
    };
  } catch (err) {
    // Mark as failed
    await db.document.update({
      where: { id: documentId },
      data: { ocrStatus: 'failed' },
    }).catch(() => {});
    throw err;
  }

  // Trigger semantic embedding generation (best-effort, non-blocking)
  try {
    const { indexDocumentEmbedding } = await import('@/lib/search/semantic-search');
    indexDocumentEmbedding(documentId).catch(() => {});
  } catch {}

  return result;
}

// ---------------------------------------------------------------------------
//  PDF text extraction (pdfjs-dist)
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF using pdfjs-dist.
 * This handles CID fonts, FlateDecode streams, and all modern PDF features
 * that the old regex-based approach couldn't handle.
 */
async function extractPdfText(buf: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // Dynamic import — pdfjs-dist is heavy and only needed for PDFs
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
    } as any);

    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;
    const maxPages = Math.min(pageCount, 100); // cap at 100 pages
    const textParts: string[] = [];

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .trim();
      if (pageText) textParts.push(pageText);
    }

    await pdfDoc.destroy();

    return {
      text: textParts.join('\n\n').slice(0, 200_000),
      pageCount,
    };
  } catch (err) {
    logger.warn('pdf.text_extraction_failed', { error: (err as Error).message });
    return { text: '', pageCount: 0 };
  }
}

// ---------------------------------------------------------------------------
//  OOXML / ODF text extraction (JSZip + XML parsing)
// ---------------------------------------------------------------------------

function isOoxmlMime(mime: string): boolean {
  return mime.includes('openxmlformats-officedocument');
}

function isOdfMime(mime: string): boolean {
  return mime.includes('opendocument');
}

/**
 * Extract text from OOXML (.docx, .xlsx, .pptx) or ODF files.
 * These are ZIP archives containing XML files — we decompress with JSZip
 * and extract text from the relevant XML elements.
 */
async function extractZipXmlText(buf: Buffer, mimeType: string): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const textParts: string[] = [];

    // Determine which XML files to read based on file type
    const isWord = mimeType.includes('wordprocessing');
    const isExcel = mimeType.includes('spreadsheet');
    const isPpt = mimeType.includes('presentation');
    const isOdf = mimeType.includes('opendocument');

    if (isWord) {
      // word/document.xml contains the main text
      const docXml = await zip.file('word/document.xml')?.async('text');
      if (docXml) {
        textParts.push(extractTextFromXml(docXml, ['w:t']));
      }
      // Also check headers/footers
      const headerFiles = Object.keys(zip.files).filter((f) => f.match(/word\/header\d*\.xml/));
      for (const hf of headerFiles) {
        const xml = await zip.file(hf)?.async('text');
        if (xml) textParts.push(extractTextFromXml(xml, ['w:t']));
      }
    } else if (isExcel) {
      // xl/sharedStrings.xml has string values; xl/worksheets/sheet*.xml have cell refs
      const sharedStrings = await zip.file('xl/sharedStrings.xml')?.async('text');
      if (sharedStrings) {
        textParts.push(extractTextFromXml(sharedStrings, ['t']));
      }
      // Also read worksheet cell values directly
      const sheetFiles = Object.keys(zip.files).filter((f) => f.match(/xl\/worksheets\/sheet\d*\.xml/));
      for (const sf of sheetFiles) {
        const xml = await zip.file(sf)?.async('text');
        if (xml) textParts.push(extractTextFromXml(xml, ['v', 't']));
      }
    } else if (isPpt) {
      // ppt/slides/slide*.xml
      const slideFiles = Object.keys(zip.files).filter((f) => f.match(/ppt\/slides\/slide\d*\.xml/));
      for (const sf of slideFiles.slice(0, 100)) {
        const xml = await zip.file(sf)?.async('text');
        if (xml) textParts.push(extractTextFromXml(xml, ['a:t']));
      }
    } else if (isOdf) {
      // content.xml is the main content
      const contentXml = await zip.file('content.xml')?.async('text');
      if (contentXml) {
        // ODF uses text:h and text:p elements
        textParts.push(extractTextFromXml(contentXml, ['text:h', 'text:p', 'table:table-cell']));
      }
    }

    return textParts.join(' ').slice(0, 200_000);
  } catch (err) {
    logger.warn('ooxml.text_extraction_failed', { mimeType, error: (err as Error).message });
    return '';
  }
}

/**
 * Extract text content from specified XML elements.
 * Uses regex (not a full XML parser) for performance — good enough for
 * text extraction where we just need the inner text of known elements.
 */
function extractTextFromXml(xml: string, tagNames: string[]): string {
  const parts: string[] = [];
  for (const tag of tagNames) {
    // Match <tag>...</tag> or <tag attr="...">...</tag>
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g');
    let match;
    while ((match = regex.exec(xml)) !== null) {
      if (match[1] && match[1].trim()) {
        parts.push(match[1].trim());
      }
    }
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
//  OCR: Image
// ---------------------------------------------------------------------------

/**
 * Run OCR on an image buffer using the system tesseract CLI.
 * Returns text + confidence data from TSV output.
 */
async function ocrImage(
  buf: Buffer,
  mimeType: string,
  config: OcrConfig,
): Promise<OcrResult> {
  const startTime = Date.now();
  const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'png');
  const langStr = config.languages.join('+');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-edms-ocr-'));
  const inputFile = path.join(tmpDir, `input.${ext}`);
  const outputBase = path.join(tmpDir, 'output');

  try {
    await fs.writeFile(inputFile, buf);

    // Run tesseract with TSV output for confidence data
    // TSV format: level page_num block_num par_num line_num word_num left top width height conf text
    await new Promise<void>((resolve, reject) => {
      execFile(
        'tesseract',
        [inputFile, outputBase, '-l', langStr, 'tsv'],
        { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    const tsvText = await fs.readFile(`${outputBase}.tsv`, 'utf-8');
    const parsed = parseTesseractTsv(tsvText);

    return {
      text: parsed.text.slice(0, 200_000),
      confidence: parsed.meanConfidence,
      pageConfidences: [parsed.meanConfidence],
      engine: 'tesseract_cli',
      languages: langStr,
      durationMs: Date.now() - startTime,
      pageCount: 1,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
//  OCR: Scanned PDF (rasterize + OCR per page)
// ---------------------------------------------------------------------------

/**
 * OCR a scanned PDF by:
 *   1. Loading the PDF with pdfjs-dist
 *   2. Rendering each page to a PNG canvas at the configured DPI
 *   3. Running tesseract on each page image
 *   4. Concatenating per-page text + computing per-page confidence
 */
async function ocrScannedPdf(
  buf: Buffer,
  config: OcrConfig,
): Promise<OcrResult> {
  const startTime = Date.now();
  const langStr = config.languages.join('+');

  // Load PDF
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfDoc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
  } as any).promise;

  const pageCount = Math.min(pdfDoc.numPages, config.maxPages);
  const pageTexts: string[] = [];
  const pageConfidences: number[] = [];
  const scale = config.dpi / 72; // PDF default is 72 DPI

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-edms-ocr-pdf-'));

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });

      // Render page to canvas
      const canvasFactory = (pdfjs as any).canvasFactory || new (pdfjs as any).NodeCanvasFactory();
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
      const renderContext = {
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory,
      };

      await page.render(renderContext).promise;

      // Get PNG buffer from canvas
      const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');

      // OCR the page image
      const pageInputFile = path.join(tmpDir, `page-${i}.png`);
      const pageOutputBase = path.join(tmpDir, `page-${i}-output`);
      await fs.writeFile(pageInputFile, pngBuffer);

      await new Promise<void>((resolve, reject) => {
        execFile(
          'tesseract',
          [pageInputFile, pageOutputBase, '-l', langStr, 'tsv'],
          { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });

      const tsvText = await fs.readFile(`${pageOutputBase}.tsv`, 'utf-8');
      const parsed = parseTesseractTsv(tsvText);

      pageTexts.push(parsed.text);
      pageConfidences.push(parsed.meanConfidence);

      // Clean up page canvas
      canvasFactory.destroy(canvasAndContext);

      logger.debug('ocr.pdf_page_done', {
        page: i,
        totalPages: pageCount,
        confidence: parsed.meanConfidence,
        textLength: parsed.text.length,
      });
    }

    await pdfDoc.destroy();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // Compute mean confidence across all pages
  const validConfidences = pageConfidences.filter((c) => c >= 0);
  const meanConfidence = validConfidences.length > 0
    ? validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length
    : null;

  return {
    text: pageTexts.join('\n\n--- Page Break ---\n\n').slice(0, 500_000),
    confidence: meanConfidence,
    pageConfidences,
    engine: 'tesseract_cli',
    languages: langStr,
    durationMs: Date.now() - startTime,
    pageCount,
  };
}

// ---------------------------------------------------------------------------
//  Tesseract TSV parser
// ---------------------------------------------------------------------------

/**
 * Parse Tesseract TSV output to extract text + confidence.
 * TSV format (tab-separated):
 *   level  page_num  block_num  par_num  line_num  word_num  left  top  width  height  conf  text
 *
 * We extract:
 *   - text: all word-level (level=5) text values, joined by space
 *   - meanConfidence: average of word-level conf values (excluding -1)
 */
function parseTesseractTsv(tsv: string): { text: string; meanConfidence: number } {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return { text: '', meanConfidence: -1 };

  // Skip header line
  const dataLines = lines.slice(1);
  const words: string[] = [];
  const confidences: number[] = [];

  for (const line of dataLines) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;

    const level = parseInt(cols[0], 10);
    if (level !== 5) continue; // word level

    const conf = parseFloat(cols[10]);
    const text = cols[11];

    if (text && text.trim()) {
      words.push(text.trim());
      if (conf >= 0) confidences.push(conf);
    }
  }

  const meanConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : -1;

  return {
    text: words.join(' '),
    meanConfidence,
  };
}

// ---------------------------------------------------------------------------
//  Language detection (franc)
// ---------------------------------------------------------------------------

/**
 * Detect document language using the franc library.
 * Falls back to a simple Arabic-character-ratio heuristic if franc is
 * unavailable or the text is too short.
 */
async function detectLanguageAdvanced(text: string): Promise<string> {
  if (!text || text.trim().length < 10) return 'en';

  try {
    // franc requires at least a few words to detect reliably
    const { franc } = await import('franc');
    const detected = franc(text.slice(0, 1000));

    // Map franc's ISO 639-3 codes to our supported locales
    const francToLocale: Record<string, string> = {
      eng: 'en',
      ara: 'ar',
      fra: 'fr',
      spa: 'es',
      deu: 'de',
    };

    if (detected && francToLocale[detected]) {
      return francToLocale[detected];
    }

    // If franc detected a language we don't support, fall back to heuristic
    if (detected && detected !== 'und') {
      // Check if it's an Arabic script language
      if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    }
  } catch {
    // franc not available — fall through to heuristic
  }

  // Heuristic: Arabic character ratio
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + latinChars;
  return total === 0 ? 'en' : arabicChars / total > 0.3 ? 'ar' : 'en';
}

// ---------------------------------------------------------------------------
//  Search helper (unchanged API)
// ---------------------------------------------------------------------------

export async function searchTextIndex(
  tenantId: string,
  query: string,
  opts: { limit?: number; ownerId?: string } = {},
): Promise<{ documentId: string; snippet: string }[]> {
  // SECURITY FIX (M-DOC-14): Honor `ownerId` filter when supplied so that
  // end users (without DOCUMENT_READ) only get snippets from documents they
  // own. Previously the function filtered ONLY by tenantId, leaking snippets
  // from any tenant document whose extracted text contained the query.
  const results = await db.documentTextIndex.findMany({
    where: {
      tenantId,
      extractedText: { contains: query },
      ...(opts.ownerId ? { document: { ownerId: opts.ownerId } } : {}),
    },
    take: opts.limit ?? 50,
    select: { documentId: true, extractedText: true, rawText: true },
  });

  return results.map((r) => {
    // Use rawText for display snippets (preserves original case)
    const source = r.rawText || r.extractedText;
    const idx = source.toLowerCase().indexOf(query.toLowerCase());
    const start = Math.max(0, idx - 50);
    const end = Math.min(source.length, idx + query.length + 100);
    const snippet = source.slice(start, end);
    return { documentId: r.documentId, snippet: idx >= 0 ? `…${snippet}…` : source.slice(0, 200) };
  });
}
