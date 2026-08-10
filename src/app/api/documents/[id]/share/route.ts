/**
 * Smart EDMS — Share management for a document
 *
 * GET   /api/documents/:id/share   list shares for this document
 * POST  /api/documents/:id/share   create a new share link
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { hashPassword, randomToken, timingSafeEqualStr } from '@/lib/auth/crypto';
import { notify, fireWebhook } from '@/lib/notifications/notify';
import { sendShareNotificationEmail } from '@/lib/notifications/email';
import { getUserLocale } from '@/i18n/server-translator';
import { z } from 'zod';
import { logger } from '@/lib/config/logger';

const createSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientUserId: z.string().optional(),
  mode: z.enum(['view', 'download', 'review']).default('view'),
  password: z.string().min(8).optional(),
  expiresAt: z.string().datetime().optional(),
  maxViews: z.number().int().min(1).max(1000).optional(),
  watermark: z.boolean().default(true),
  /** Preferred locale for the external recipient (e.g. "ar", "fr"). Falls back to sharer's locale. */
  recipientLocale: z.string().max(10).optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SHARE_VIEW },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const shares = await db.share.findMany({
      where: { documentId: doc.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      shares: shares.map((s) => ({
        ...s,
        passwordHash: undefined,
        hasPassword: !!s.passwordHash,
      })),
    });
  },
);

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.SHARE_CREATE,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: { eventType: 'share.create', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = createSchema.parse(await req.json());
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: { classification: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    if (!doc.shareAllowed) {
      throw ApiError.forbidden('sharing_disabled', 'Sharing is disabled for this document');
    }

    // SECURITY FIX (M-DOC-6): Share-create IDOR. The route required only
    // SHARE_CREATE (granted to END_USER) with no ownership/share check — any
    // end user could mint an external share link on any tenant document
    // whose `shareAllowed` flag was true, even one they did not own. Re-use
    // the shared access-control helper to enforce ownership/share read
    // access (you must be able to READ a document to share it).
    const { canReadDocument } = await import('@/lib/documents/access-control');
    const canRead = await canReadDocument(ctx.userId, ctx.tenantId, doc.id, ctx.session.user.permissions);
    if (!canRead) {
      throw ApiError.notFound('document_not_found', 'Document not found');
    }

    // Hardcoded classification-code checks (legacy, kept for backwards compat)
    if (doc.classification?.code === 'RESTRICTED' || doc.classification?.code === 'HS') {
      throw ApiError.forbidden('sharing_blocked_by_classification', 'External sharing is blocked for this classification');
    }

    // --- Classification.defaultPolicy enforcement (§9.4) ---
    // The classification's `defaultPolicy` JSON can deny share/download/preview
    // per classification. This is a per-classification rule that supplements
    // the tenant-level ABAC policies.
    const { evaluateClassificationPolicy } = await import('@/lib/auth/policy-engine');
    const classSharePolicy = evaluateClassificationPolicy(doc.classification?.defaultPolicy, 'share');
    if (classSharePolicy.decision === 'deny') {
      throw ApiError.forbidden('sharing_blocked_by_classification_policy', classSharePolicy.reason);
    }

    // --- ABAC policy evaluation (document-specific) ---
    // Evaluate tenant policies against this document's attributes.
    const { evaluatePolicies, buildPolicyContext } = await import('@/lib/auth/policy-engine');
    let docTags: string[] = [];
    try { docTags = JSON.parse(doc.tags || '[]'); } catch {}
    const policyCtx = buildPolicyContext({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorRoles: ctx.session.user.roles,
      action: 'document:share',
      resourceType: 'document',
      resourceId: doc.id,
      document: {
        id: doc.id,
        ownerId: doc.ownerId ?? undefined,
        classificationCode: doc.classification?.code,
        classificationLevel: doc.classification?.level,
        tags: docTags,
        state: doc.state,
        isRecord: doc.isRecord,
        legalHold: doc.legalHold,
        folderId: doc.folderId ?? undefined,
      },
    });
    const policyDecision = await evaluatePolicies(policyCtx);
    if (policyDecision.decision === 'deny') {
      const { alertPolicyViolation } = await import('@/lib/security/policy-alerts');
      await alertPolicyViolation(ctx.tenantId, {
        policyName: policyDecision.matchedPolicy?.name,
        action: 'document:share',
        resourceType: 'document',
        resourceId: doc.id,
        resourceName: doc.title,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        reason: policyDecision.reason,
      }).catch(() => {});
      throw ApiError.forbidden('policy_denied', policyDecision.reason);
    }

    // --- Tenant-level sharing policy enforcement ---
    // Master prompt §9.11: "external sharing must be denied by default
    // unless enabled by policy" and "anonymous links must be strongly
    // restricted or disabled by default".
    //
    // Tenant settings shape:
    //   settings.sharing.externalEnabled (boolean, default false)
    //   settings.sharing.anonymousEnabled (boolean, default false)
    //   settings.sharing.maxExpiryHours (number, default 168 = 7 days)
    //   settings.sharing.requirePassword (boolean, default true for external)
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { settings: true },
    });
    let sharingPolicy: {
      externalEnabled?: boolean;
      anonymousEnabled?: boolean;
      maxExpiryHours?: number;
      requirePassword?: boolean;
    } = {};
    try {
      const settings = JSON.parse((tenant as any)?.settings || '{}');
      sharingPolicy = settings?.sharing ?? {};
    } catch {
      // Use defaults below
    }

    // External sharing = recipient is NOT an internal user (recipientEmail
    // is set, OR recipientUserId is not provided). Default DENY.
    const isExternalShare = !!body.recipientEmail || !body.recipientUserId;
    const isAnonymousShare = !body.recipientEmail && !body.recipientUserId;

    if (isExternalShare && sharingPolicy.externalEnabled !== true) {
      throw ApiError.forbidden(
        'external_sharing_disabled',
        'External sharing is disabled for this tenant. Enable it in Tenant Settings → Sharing.',
      );
    }
    if (isAnonymousShare && sharingPolicy.anonymousEnabled !== true) {
      throw ApiError.forbidden(
        'anonymous_sharing_disabled',
        'Anonymous share links are disabled. Specify a recipient email or internal user.',
      );
    }

    // Enforce max expiry
    const maxExpiryHours = sharingPolicy.maxExpiryHours ?? 168; // 7 days default
    if (body.expiresAt) {
      const expiry = new Date(body.expiresAt);
      const maxExpiry = new Date(Date.now() + maxExpiryHours * 3600_000);
      if (expiry > maxExpiry) {
        throw ApiError.badRequest(
          'expiry_too_long',
          `Share link expiry exceeds the tenant maximum of ${maxExpiryHours} hours.`,
        );
      }
    }

    // Enforce password requirement for external shares
    if (isExternalShare && sharingPolicy.requirePassword !== false && !body.password) {
      throw ApiError.badRequest(
        'password_required',
        'External share links must have a password. Set a password or disable the requirement in Tenant Settings.',
      );
    }

    const token = randomToken(32);
    const passwordHash = body.password ? await hashPassword(body.password) : null;

    const share = await db.share.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        createdBy: ctx.userId,
        token,
        recipientEmail: body.recipientEmail ?? null,
        recipientUserId: body.recipientUserId ?? null,
        mode: body.mode,
        passwordHash,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxViews: body.maxViews ?? null,
        viewCount: 0,
        watermark: body.watermark,
        recipientLocale: body.recipientLocale ?? null,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'share.create',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        shareId: share.id,
        recipientEmail: body.recipientEmail,
        mode: body.mode,
        expiresAt: body.expiresAt,
        hasPassword: !!body.password,
        watermark: body.watermark,
      },
    });

    // Notify document owner (if not the sharer) — pass i18n metadata
    if (doc.ownerId && doc.ownerId !== ctx.userId) {
      await notify({
        tenantId: ctx.tenantId,
        userId: doc.ownerId,
        type: 'share.created',
        severity: 'info',
        link: `/documents/${doc.id}`,
        metadata: {
          shareId: share.id,
          documentId: doc.id,
          sharedBy: ctx.session.user.email,
          docTitle: doc.title,
          recipient: body.recipientEmail ?? 'an external recipient',
        },
      });
    }

    // Notify internal recipient if userId specified
    if (body.recipientUserId && body.recipientUserId !== ctx.userId) {
      await notify({
        tenantId: ctx.tenantId,
        userId: body.recipientUserId,
        type: 'share.received',
        severity: 'info',
        link: `/documents/${doc.id}`,
        metadata: {
          shareId: share.id,
          documentId: doc.id,
          sharedBy: ctx.session.user.email,
          docTitle: doc.title,
        },
      });
      // Send email to the recipient — resolve their locale
      const recipient = await db.user.findUnique({
        where: { id: body.recipientUserId },
        select: { email: true },
      });
      if (recipient?.email) {
        const recipientLocale = await getUserLocale(body.recipientUserId);
        const shareUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shared/${token}`;
        sendShareNotificationEmail({
          to: recipient.email,
          documentTitle: doc.title,
          sharedBy: ctx.session.user.email,
          shareUrl,
          expiresAt: share.expiresAt ?? undefined,
          locale: recipientLocale,
        }).catch((err) => {
          logger.warn('share_failed_to_send_email_to_recipient', { message: '[share] failed to send email to recipient:', error: err });
        });
      }
    } else if (body.recipientEmail) {
      // External recipient — use the explicitly-provided recipientLocale
      // if available, otherwise fall back to the sharer's locale.
      const externalLocale = body.recipientLocale || await getUserLocale(ctx.userId);
      const shareUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shared/${token}`;
      sendShareNotificationEmail({
        to: body.recipientEmail,
        documentTitle: doc.title,
        sharedBy: ctx.session.user.email,
        shareUrl,
        expiresAt: share.expiresAt ?? undefined,
        locale: externalLocale,
      }).catch((err) => {
        logger.warn('share_failed_to_send_email_to_external_recipient', { message: '[share] failed to send email to external recipient:', error: err });
      });
    }

    // Fire webhook
    await fireWebhook(ctx.tenantId, 'share.created', {
      shareId: share.id,
      documentId: doc.id,
      documentTitle: doc.title,
      sharedBy: ctx.userId,
      recipientEmail: body.recipientEmail,
      mode: body.mode,
    });

    return NextResponse.json(
      {
        share: {
          ...share,
          passwordHash: undefined,
          hasPassword: !!passwordHash,
          url: `/shared/${token}`,
        },
      },
      { status: 201 },
    );
  },
);

export async function verifySharePassword(share: { passwordHash: string | null }, password?: string): Promise<boolean> {
  if (!share.passwordHash) return true;
  if (!password) return false;
  return timingSafeEqualStr(await hashPassword(password), share.passwordHash) || (await verifyPasswordCompat(share.passwordHash, password));
}

async function verifyPasswordCompat(hash: string, plain: string): Promise<boolean> {
  try {
    const argon2 = (await import('argon2')).default;
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
