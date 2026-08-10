/**
 * Smart EDMS — Version compare
 * GET /api/documents/:id/compare?from=N&to=M
 *
 * Returns text diff between two versions' extracted text.
 * For text files: line-by-line diff.
 * For PDFs/Office: compares extracted text from DocumentTextIndex.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getFileStorage } from '@/lib/storage/file-storage';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const fromN = parseInt(req.nextUrl.searchParams.get('from') || '1', 10);
    const toN = parseInt(req.nextUrl.searchParams.get('to') || '2', 10);

    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const [fromVersion, toVersion] = await Promise.all([
      db.documentVersion.findFirst({
        where: { documentId: doc.id, versionNumber: fromN, tenantId: ctx.tenantId },
      }),
      db.documentVersion.findFirst({
        where: { documentId: doc.id, versionNumber: toN, tenantId: ctx.tenantId },
      }),
    ]);
    if (!fromVersion || !toVersion) {
      throw ApiError.notFound('version_not_found', 'One or both versions not found');
    }

    const storage = getFileStorage();
    const [fromBuf, toBuf] = await Promise.all([
      storage.get(fromVersion.storageKey),
      storage.get(toVersion.storageKey),
    ]);

    let fromText = '';
    let toText = '';
    if (fromVersion.mimeType.startsWith('text/') || fromVersion.mimeType === 'application/json') {
      fromText = fromBuf.toString('utf-8');
    } else {
      // Use extracted text index if available
      const idx = await db.documentTextIndex.findFirst({
        where: { documentId: doc.id, versionId: fromVersion.id },
      });
      fromText = idx?.extractedText || '';
    }
    if (toVersion.mimeType.startsWith('text/') || toVersion.mimeType === 'application/json') {
      toText = toBuf.toString('utf-8');
    } else {
      const idx = await db.documentTextIndex.findFirst({
        where: { documentId: doc.id, versionId: toVersion.id },
      });
      toText = idx?.extractedText || '';
    }

    // SECURITY FIX (M-DOC-16): Cap input size BEFORE allocating the O(m×n) DP
    // table. Two 50 000-line files would otherwise allocate a 2.5×10⁹ entry
    // table (~20 GB) and OOM the worker. Cap each side at 5 000 lines and
    // 200 KB total per side; if exceeded, return a 413.
    const MAX_LINES_PER_SIDE = 5000;
    const MAX_BYTES_PER_SIDE = 200 * 1024;
    if (fromText.length > MAX_BYTES_PER_SIDE || toText.length > MAX_BYTES_PER_SIDE) {
      throw ApiError.badRequest(
        'diff_too_large',
        `Version content exceeds the ${MAX_BYTES_PER_SIDE}-byte diff limit. Use a dedicated diff tool for large files.`,
      );
    }
    const fromLines = fromText.split('\n');
    const toLines = toText.split('\n');
    if (fromLines.length > MAX_LINES_PER_SIDE || toLines.length > MAX_LINES_PER_SIDE) {
      throw ApiError.badRequest(
        'diff_too_many_lines',
        `Version has more than ${MAX_LINES_PER_SIDE} lines — diff is capped to prevent OOM.`,
      );
    }

    const diff = computeLineDiff(fromLines, toLines);

    return NextResponse.json({
      from: { versionNumber: fromVersion.versionNumber, fileName: fromVersion.fileName, sizeBytes: fromVersion.sizeBytes, createdAt: fromVersion.createdAt },
      to: { versionNumber: toVersion.versionNumber, fileName: toVersion.fileName, sizeBytes: toVersion.sizeBytes, createdAt: toVersion.createdAt },
      diff,
      stats: {
        added: diff.filter((d) => d.type === 'add').length,
        removed: diff.filter((d) => d.type === 'remove').length,
        unchanged: diff.filter((d) => d.type === 'same').length,
      },
    });
  },
);

interface DiffLine {
  type: 'add' | 'remove' | 'same';
  lineNumber: number;
  content: string;
}

function computeLineDiff(fromLines: string[], toLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];

  // Simple LCS-based diff (inputs are already size-capped by the caller)
  const m = fromLines.length;
  const n = toLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (fromLines[i - 1] === toLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m, j = n;
  const tmp: DiffLine[] = [];
  while (i > 0 && j > 0) {
    if (fromLines[i - 1] === toLines[j - 1]) {
      tmp.unshift({ type: 'same', lineNumber: j, content: fromLines[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      tmp.unshift({ type: 'remove', lineNumber: i, content: fromLines[i - 1] });
      i--;
    } else {
      tmp.unshift({ type: 'add', lineNumber: j, content: toLines[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    tmp.unshift({ type: 'remove', lineNumber: i, content: fromLines[i - 1] });
    i--;
  }
  while (j > 0) {
    tmp.unshift({ type: 'add', lineNumber: j, content: toLines[j - 1] });
    j--;
  }

  // Limit to 500 lines for performance
  return tmp.slice(0, 500);
}
