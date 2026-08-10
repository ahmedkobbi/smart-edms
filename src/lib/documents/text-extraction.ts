/**
 * Smart EDMS — Text extraction + OCR pipeline
 *
 * For each uploaded document, extracts text and stores it in DocumentTextIndex
 * for full-text search and AI analysis.
 *
 * Strategy:
 *   - text/* files: read directly
 *   - application/json: read directly
 *   - PDF: extract text streams (basic) + OCR fallback for scanned pages
 *   - Images (PNG, JPEG, TIFF, BMP): Tesseract OCR (if available)
 *
 * OCR is opt-in per tenant via feature flags (settings.features.ocr).
 */

import { db } from '@/lib/db';
import { getFileStorage } from '@/lib/storage/file-storage';
import { buildSearchIndex, detectLanguage } from '@/lib/i18n/arabic-search';

/**
 * Extract text from a document version and persist to DocumentTextIndex.
 */
export async function indexDocumentText(
  tenantId: string,
  documentId: string,
  versionId: string,
): Promise<{ extractedText: string; ocrApplied: boolean; pageCount: number }> {
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, tenantId, documentId },
  });
  if (!version) throw new Error('Version not found');

  const storage = getFileStorage();
  const buf = await storage.get(version.storageKey);

  // Check tenant feature flag
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  let ocrEnabled = true;
  try {
    const settings = JSON.parse(tenant?.settings || '{}');
    ocrEnabled = settings?.features?.ocr !== false;
  } catch {}

  let extractedText = '';
  let ocrApplied = false;
  let pageCount = 0;

  if (version.mimeType.startsWith('text/') || version.mimeType === 'application/json') {
    extractedText = buf.toString('utf-8').slice(0, 100_000);
  } else if (version.mimeType === 'application/pdf') {
    const result = extractPdfText(buf);
    extractedText = result.text;
    pageCount = result.pageCount;
    // If PDF has little extractable text, try OCR
    if (ocrEnabled && extractedText.length < 50) {
      try {
        const ocrText = await runOcr(buf, 'png');
        if (ocrText.length > extractedText.length) {
          extractedText = ocrText;
          ocrApplied = true;
        }
      } catch (err) {
        console.warn('[ocr] failed for PDF:', err);
      }
    }
  } else if (version.mimeType.startsWith('image/')) {
    if (ocrEnabled) {
      try {
        extractedText = await runOcr(buf, version.mimeType.split('/')[1]);
        ocrApplied = true;
      } catch (err) {
        console.warn('[ocr] failed for image:', err);
      }
    }
  } else if (version.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
             version.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
             version.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    // OOXML: extract text from XML parts
    extractedText = extractOoxmlText(buf);
  } else if (version.mimeType === 'application/vnd.oasis.opendocument.text') {
    extractedText = extractOoxmlText(buf); // ODF is also zip-based
  }

  // Detect language + build search-optimized text
  const detectedLang = detectLanguage(extractedText);
  const searchText = buildSearchIndex(extractedText);

  // Update document language metadata
  await db.document.update({
    where: { id: documentId },
    data: {
      documentLanguage: detectedLang,
      textDirection: detectedLang === 'ar' ? 'rtl' : 'ltr',
    },
  }).catch(() => {});

  // Persist
  await db.documentTextIndex.upsert({
    where: { documentId },
    update: {
      versionId,
      extractedText: searchText, // Store normalized + original for search
      ocrApplied,
      language: detectedLang,
      pageCount,
      indexedAt: new Date(),
    },
    create: {
      tenantId,
      documentId,
      versionId,
      extractedText: searchText,
      ocrApplied,
      language: detectedLang,
      pageCount,
    },
  });

  return { extractedText, ocrApplied, pageCount };
}

/**
 * Basic PDF text extraction — pulls strings from BT/ET text blocks.
 * Production would use pdf-parse or pdfjs-dist.
 */
function extractPdfText(buf: Buffer): { text: string; pageCount: number } {
  const text = buf.toString('latin1');
  // Count pages
  const pageCountMatches = text.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = pageCountMatches?.length ?? 1;

  // Extract strings from text blocks
  const matches = text.match(/\(([^)]{1,500})\)/g);
  if (!matches) return { text: '', pageCount };

  const extracted = matches
    .map((m) => m.slice(1, -1))
    .filter((s) => /[a-zA-Z]{3,}/.test(s))
    .join(' ')
    .slice(0, 100_000);

  return { text: extracted, pageCount };
}

/**
 * Extract text from OOXML (zip-based) by reading XML parts.
 */
function extractOoxmlText(buf: Buffer): string {
  // Find wordDocument.xml / sheetData / slide XML
  const text = buf.toString('latin1');
  const matches: string[] = [];

  // <w:t> elements (Word)
  const wordMatches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  if (wordMatches) {
    for (const m of wordMatches) {
      const content = m.replace(/<[^>]+>/g, '');
      if (content) matches.push(content);
    }
  }

  // <a:t> elements (PowerPoint)
  const pptMatches = text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
  if (pptMatches) {
    for (const m of pptMatches) {
      const content = m.replace(/<[^>]+>/g, '');
      if (content) matches.push(content);
    }
  }

  // <v> elements (Excel cell values)
  const xlMatches = text.match(/<v>([^<]+)<\/v>/g);
  if (xlMatches) {
    for (const m of xlMatches) {
      const content = m.replace(/<[^>]+>/g, '');
      if (content) matches.push(content);
    }
  }

  return matches.join(' ').slice(0, 100_000);
}

/**
 * Run OCR using Tesseract (if installed).
 * Falls back gracefully if not available.
 */
async function runOcr(buf: Buffer, format: string): Promise<string> {
  const { execFile } = await import('child_process');
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-edms-ocr-'));
  const inputFile = path.join(tmpDir, `input.${format === 'jpeg' ? 'jpg' : format || 'png'}`);
  const outputFile = path.join(tmpDir, 'output');

  try {
    await fs.writeFile(inputFile, buf);

    await new Promise<void>((resolve, reject) => {
      execFile(
        'tesseract',
        [inputFile, outputFile, '-l', 'eng+ara'], // English + Arabic OCR
        { timeout: 30_000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    const text = await fs.readFile(`${outputFile}.txt`, 'utf-8');
    return text.slice(0, 100_000);
  } catch (err) {
    // Tesseract not installed — return empty
    return '';
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Search the text index for a query.
 */
export async function searchTextIndex(
  tenantId: string,
  query: string,
  opts: { limit?: number } = {},
): Promise<{ documentId: string; snippet: string }[]> {
  const results = await db.documentTextIndex.findMany({
    where: {
      tenantId,
      extractedText: { contains: query },
    },
    take: opts.limit ?? 50,
    select: { documentId: true, extractedText: true },
  });

  return results.map((r) => {
    const idx = r.extractedText.toLowerCase().indexOf(query.toLowerCase());
    const start = Math.max(0, idx - 50);
    const end = Math.min(r.extractedText.length, idx + query.length + 100);
    const snippet = r.extractedText.slice(start, end);
    return { documentId: r.documentId, snippet: idx >= 0 ? `…${snippet}…` : r.extractedText.slice(0, 200) };
  });
}
