/**
 * Smart EDMS — Collaboration save (internal endpoint)
 * POST /api/documents/:id/collaboration/save
 *
 * Called by the collaboration service to persist document content.
 * Internal-only (should be restricted to localhost in production).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const body = await req.json();
  const { tenantId, content } = body;

  if (!tenantId || typeof content !== 'string') {
    return NextResponse.json({ error: { code: 'invalid_request' } }, { status: 400 });
  }

  // Verify document exists
  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true, title: true, currentVersion: true },
  });

  if (!doc) {
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  }

  // Update the text index with the new content
  await db.documentTextIndex.upsert({
    where: { documentId },
    update: {
      extractedText: content,
      indexedAt: new Date(),
    },
    create: {
      tenantId,
      documentId,
      versionId: `${documentId}_collab`,
      extractedText: content,
    },
  });

  // Update document's updatedAt
  await db.document.update({
    where: { id: documentId },
    data: { updatedAt: new Date() },
  });

  logger.debug('collab.saved', { documentId, tenantId, contentLength: content.length });

  return NextResponse.json({ ok: true });
}
