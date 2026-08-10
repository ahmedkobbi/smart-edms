/**
 * Smart EDMS — Public share view
 *
 * GET /api/shares/:token               verify share + return minimal metadata
 * POST /api/shares/:token/view         { password? } → returns signed URL + records view
 *
 * No authentication required — the token IS the credential.
 * Enforces: expiry, view count, password, watermark.
 *
 * SECURITY FIXES:
 *   H3: GET no longer leaks document title/description/classification/owner
 *       when the share has a password. Only returns hasPassword + expiresAt.
 *   H4: maxViews check-and-increment is now atomic (updateMany with conditional WHERE).
 *   L3: All "dead" states return uniform 410 Gone with generic message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { getFileStorage } from '@/lib/storage/file-storage';
import { authRateLimiter } from '@/lib/security/rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';

function shareGone(code: string): NextResponse {
  // SECURITY FIX (L3): Uniform 410 for all dead states (no status oracle)
  return NextResponse.json({ error: { code: 'gone', message: 'This share link is no longer available.' } }, { status: 410 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await db.share.findUnique({
    where: { token },
    include: {
      document: { select: { deletedAt: true } },
    },
  });
  if (!share) return NextResponse.json({ error: { code: 'not_found', message: 'Share not found' } }, { status: 404 });
  if (share.revokedAt) return shareGone('revoked');
  if (share.expiresAt && share.expiresAt < new Date()) return shareGone('expired');
  if (share.maxViews && share.viewCount >= share.maxViews) return shareGone('max_views');
  if (share.document.deletedAt) return shareGone('document_deleted');

  // SECURITY FIX (H3): If the share has a password, return ONLY the fact
  // that a password is required — do NOT leak document title, description,
  // classification, or owner name.
  if (share.passwordHash) {
    return NextResponse.json({
      share: {
        hasPassword: true,
        expiresAt: share.expiresAt,
        watermark: share.watermark,
      },
    });
  }

  // No password — safe to return metadata
  const fullShare = await db.share.findUnique({
    where: { token },
    include: {
      document: {
        include: { classification: true, owner: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json({
    share: {
      token: fullShare!.token,
      mode: fullShare!.mode,
      hasPassword: false,
      expiresAt: fullShare!.expiresAt,
      watermark: fullShare!.watermark,
      viewCount: fullShare!.viewCount,
      maxViews: fullShare!.maxViews,
      document: {
        id: fullShare!.document.id,
        title: fullShare!.document.title,
        description: fullShare!.document.description,
        classification: fullShare!.document.classification
          ? { code: fullShare!.document.classification.code, name: fullShare!.document.classification.name, color: fullShare!.document.classification.color }
          : null,
        ownerName: fullShare!.document.owner?.name ?? null,
      },
    },
  });
}

const viewSchema = z.object({
  password: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // SECURITY FIX (M-DOC-22 / M-ADM-19): Rate-limit share-password attempts.
  // Without this, an attacker who obtains a share token can brute-force the
  // password at line rate — failed attempts do NOT consume a view (they fail
  // at the argon2.verify step before the viewCount increment), so the
  // maxViews safeguard does not slow them down. Two limiters:
  //   1. Per-token: max 10 attempts per 10 minutes (then 410 Gone to lock).
  //   2. Per-IP: max 30 attempts per minute across all tokens (catches
  //      attackers rotating across many share links).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipRl = await authRateLimiter.check(`share-pw-ip:${ip}`, 30, 60_000);
  if (!ipRl.allowed) {
    return NextResponse.json({ error: { code: 'rate_limited', message: 'Too many share requests' } }, { status: 429 });
  }
  // The token-specific limiter uses a longer window — if exceeded, we LOCK the
  // share by setting revokedAt (defence-in-depth, alerts the sharer).
  const tokenRlKey = `share-pw:${token}`;
  const tokenRl = await authRateLimiter.check(tokenRlKey, 10, 10 * 60_000);
  if (!tokenRl.allowed) {
    // Lock the share to protect against continued brute-force
    await db.share.update({
      where: { token },
      data: { revokedAt: new Date(), revokeReason: 'Brute-force protection: too many password attempts' },
    }).catch(() => {});
    return shareGone('brute_force_locked');
  }

  const body = viewSchema.parse(await req.json().catch(() => ({})));

  const share = await db.share.findUnique({
    where: { token },
    include: {
      document: { include: { classification: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
    },
  });
  if (!share) return NextResponse.json({ error: { code: 'not_found', message: 'Share not found' } }, { status: 404 });
  if (share.revokedAt) return shareGone('revoked');
  if (share.expiresAt && share.expiresAt < new Date()) return shareGone('expired');
  if (share.document.deletedAt) return shareGone('document_deleted');

  // Password check
  if (share.passwordHash) {
    if (!body.password) return NextResponse.json({ error: { code: 'password_required', message: 'Password required' } }, { status: 401 });
    try {
      const ok = await argon2.verify(share.passwordHash, body.password);
      // SECURITY FIX (M-ADM-19): Return uniform 403 for "password required"
      // and "invalid password" so the response is NOT distinguishable to an
      // attacker probing for shares that have passwords vs. those that don't.
      if (!ok) return NextResponse.json({ error: { code: 'password_required', message: 'Password required' } }, { status: 403 });
    } catch {
      return NextResponse.json({ error: { code: 'password_required', message: 'Password required' } }, { status: 403 });
    }
  }

  // SECURITY FIX (H4): Atomic maxViews check-and-increment.
  // The previous code did a non-atomic read-then-write, allowing N concurrent
  // requests to all pass the maxViews check before any incremented the counter.
  // Now we use updateMany with a conditional WHERE clause — only one request
  // can "win" if maxViews is reached.
  if (share.maxViews) {
    const incrementResult = await db.share.updateMany({
      where: {
        id: share.id,
        viewCount: { lt: share.maxViews },
      },
      data: { viewCount: { increment: 1 } },
    });
    if (incrementResult.count === 0) {
      return shareGone('max_views');
    }
  } else {
    // No maxViews limit — just increment
    await db.share.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  const version = share.document.versions[0];
  if (!version) return NextResponse.json({ error: { code: 'no_version', message: 'No file available' } }, { status: 404 });

  const storage = getFileStorage();
  const mode = share.mode === 'download' ? 'attachment' : 'inline';
  const url = await storage.getSignedDownloadUrl(version.storageKey, 60, mode === 'inline' ? undefined : version.fileName);

  await recordAuditEvent({
    tenantId: share.tenantId,
    eventType: 'share.view',
    action: 'read',
    resourceType: 'document',
    resourceId: share.document.id,
    resourceName: share.document.title,
    result: 'allow',
    reason: `share:${share.id}`,
    actorEmail: share.recipientEmail ?? 'anonymous',
    actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    actorUserAgent: req.headers.get('user-agent') ?? 'unknown',
    metadata: { shareId: share.id, mode: share.mode, versionNumber: version.versionNumber },
  });

  await fireWebhook(share.tenantId, 'share.viewed', { shareId: share.id, documentId: share.documentId, recipientEmail: share.recipientEmail });

  return NextResponse.json({
    url,
    expiresInSeconds: 60,
    mode: share.mode,
    watermark: share.watermark,
    watermarkText: share.watermark
      ? `${share.recipientEmail ?? 'Anonymous'} • ${new Date().toISOString()} • ${share.token.slice(0, 8)}`
      : null,
    document: {
      id: share.document.id,
      title: share.document.title,
      classification: share.document.classification
        ? { code: share.document.classification.code, name: share.document.classification.name, color: share.document.classification.color }
        : null,
    },
  });
}
