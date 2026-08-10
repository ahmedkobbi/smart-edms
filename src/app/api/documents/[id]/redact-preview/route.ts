/**
 * Smart EDMS — Redaction preview
 * POST /api/documents/:id/redact-preview   { regions: [{page, x, y, w, h}] }
 *
 * Generates a preview image of the redacted derivative WITHOUT creating
 * a new version. The client can display this preview before committing
 * the redaction (via POST /api/documents/:id/redact).
 *
 * Returns a base64-encoded PNG/JPEG of the first page with redaction
 * rectangles applied. For multi-page PDFs, the client can request
 * specific pages via the `page` query param.
 *
 * This endpoint does NOT modify the document — it's read-only preview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage } from '@/lib/storage/file-storage';
import { z } from 'zod';

const regionSchema = z.object({
  page: z.number().int().min(1).default(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const previewSchema = z.object({
  regions: z.array(regionSchema).min(1),
  page: z.number().int().min(1).default(1),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_REDACT,
    rateLimit: { max: 20, windowMs: 60_000 },
  },
  async (req: NextRequest, ctx, params) => {
    const body = previewSchema.parse(await req.json());

    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const version = doc.versions[0];
    if (!version) throw ApiError.notFound('no_version', 'No version available');

    const storage = getFileStorage();
    const buf = await storage.get(version.storageKey);

    // Generate preview based on file type
    let previewBase64: string;
    let mimeType: string;

    if (version.mimeType.startsWith('image/')) {
      // Image: apply redaction rectangles and return as base64
      const result = await applyRedactionsToImage(buf, body.regions);
      previewBase64 = result.toString('base64');
      mimeType = version.mimeType;
    } else if (version.mimeType === 'application/pdf') {
      // PDF: render the requested page to an image, apply redactions
      const result = await renderPdfPageWithRedactions(buf, body.page, body.regions);
      previewBase64 = result.toString('base64');
      mimeType = 'image/png';
    } else {
      throw ApiError.badRequest('unsupported_type', 'Redaction preview is only available for images and PDFs');
    }

    return NextResponse.json({
      preview: `data:${mimeType};base64,${previewBase64}`,
      mimeType,
      page: body.page,
      regions: body.regions.length,
    });
  },
);

/**
 * Apply redaction rectangles to an image buffer.
 * Uses sharp to composite black rectangles over the specified regions.
 */
async function applyRedactionsToImage(buf: Buffer, regions: any[]): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  const image = sharp(buf);
  const metadata = await image.metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;

  // Build SVG overlay with redaction rectangles
  const rects = regions.map((r) => {
    const x = Math.round(r.x * width);
    const y = Math.round(r.y * height);
    const w = Math.round(r.w * width);
    const h = Math.round(r.h * height);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black" />`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;

  return image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toBuffer();
}

/**
 * Render a PDF page to an image and apply redaction rectangles.
 * Uses pdfjs-dist to rasterize the page, then sharp to composite.
 */
async function renderPdfPageWithRedactions(buf: Buffer, pageNum: number, regions: any[]): Promise<Buffer> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const sharp = (await import('sharp')).default;

  const pdfDoc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
  } as any).promise;

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 }); // 2x for better quality

  // Render to canvas
  const canvasFactory = (pdfjs as any).canvasFactory || new (pdfjs as any).NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  await page.render({
    canvasContext: canvasAndContext.context,
    viewport,
    canvasFactory,
  } as any).promise;

  const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');
  canvasFactory.destroy(canvasAndContext);
  await pdfDoc.destroy();

  // Now apply redactions on the rendered page image
  const width = viewport.width;
  const height = viewport.height;

  const rects = regions
    .filter((r) => r.page === pageNum || r.page === 1)
    .map((r) => {
      const x = Math.round(r.x * width);
      const y = Math.round(r.y * height);
      const w = Math.round(r.w * width);
      const h = Math.round(r.h * height);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black" />`;
    }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;

  return sharp(pngBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
