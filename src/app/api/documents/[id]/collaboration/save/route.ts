/**
 * Smart EDMS — Collaboration save (internal endpoint)
 * POST /api/documents/:id/collaboration/save
 *
 * Called by the collaboration service (Hocuspocus / Yjs websocket bridge) to
 * persist document content. Must NOT be reachable by unauthenticated callers.
 *
 * SECURITY FIX (M-DOC-20): Previously this endpoint had NO authentication —
 * any unauthenticated attacker who learned a documentId + tenantId could
 * overwrite the document's text index with arbitrary content, poisoning
 * search, AI summarize, PII detection, and policy-risk pipelines.
 *
 * The endpoint now requires a shared-secret bearer token (WS_INTERNAL_SECRET)
 * that is also used by the websocket service. The token must be provisioned
 * out-of-band and rotated periodically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { timingSafeEqualStr } from '@/lib/auth/crypto';

function isAuthenticated(req: NextRequest): boolean {
  const expected = process.env.WS_INTERNAL_SECRET;
  if (!expected || expected.length < 32) {
    // Refuse to operate if the shared secret is missing or too short — forces
    // operators to provision one before enabling the collaboration service.
    return false;
  }
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  return timingSafeEqualStr(provided, expected);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // SECURITY FIX (M-DOC-20): Require shared-secret authentication.
  if (!isAuthenticated(req)) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  }

  const { id: documentId } = await params;
  const body = await req.json();
  const { tenantId, content } = body;

  if (!tenantId || typeof content !== 'string') {
    return NextResponse.json({ error: { code: 'invalid_request' } }, { status: 400 });
  }

  // Cap content size to prevent abuse (16 MB — matches a large rich-text doc)
  if (content.length > 16 * 1024 * 1024) {
    return NextResponse.json({ error: { code: 'content_too_large' } }, { status: 413 });
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
