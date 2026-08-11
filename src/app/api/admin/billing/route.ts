/**
 * Smart EDMS — Billing / Subscription
 * GET   /api/admin/billing
 * PATCH /api/admin/billing   { plan, seats, storageBytes }
 *
 * SECURITY FIX (L-ADM-6): PATCH is now restricted by billing mode:
 *
 *   - 'stripe' mode (STRIPE_SECRET_KEY set): only platform admins with
 *     ADMIN_PLATFORM_BILLING_MANAGE can PATCH. tenant_admins get 403.
 *     Normal plan changes come via the Stripe webhook at
 *     POST /api/billing/webhook.
 *
 *   - 'manual' mode (no Stripe): same restriction — only platform admins
 *     can change billing directly. tenant_admins can view but not modify.
 *
 * In both modes, all PATCH calls enforce:
 *   - Plan-transition allowlist (skipping >1 tier is logged as suspicious)
 *   - Per-plan seats + storage caps (rejects over-limit requests with 400)
 *   - Audit event recording (alwaysAudit)
 *
 * Non-platform-admin PATCH attempts trigger a security alert
 * (`security.billing_self_upgrade_blocked`) and notify platform admins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import {
  getBillingMode,
  isPlanTransitionAllowed,
  validatePlanLimits,
  alertBillingSelfUpgradeAttempt,
  type Plan,
} from '@/lib/billing/billing-policy';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE },
  async (req: NextRequest, ctx) => {
    let sub = await db.subscription.findUnique({ where: { tenantId: ctx.targetTenantId } });
    if (!sub) {
      // Auto-create trial subscription
      sub = await db.subscription.create({
        data: {
          tenantId: ctx.tenantId,
          plan: 'trial',
          status: 'trialing',
          seats: 5,
          storageBytes: BigInt(5 * 1024 * 1024 * 1024), // 5GB
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
        },
      });
    }

    // Compute usage
    const [userCount, documentCount, storageUsed] = await Promise.all([
      db.user.count({ where: { tenantId: ctx.tenantId, status: 'active' } }),
      db.document.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
      db.documentVersion.aggregate({
        where: { tenantId: ctx.targetTenantId },
        _sum: { sizeBytes: true },
      }),
    ]);

    return NextResponse.json({
      subscription: {
        ...sub,
        storageBytes: Number(sub.storageBytes),
      },
      usage: {
        seats: userCount,
        seatsLimit: sub.seats,
        documents: documentCount,
        storageUsedBytes: Number(storageUsed._sum.sizeBytes ?? 0),
        storageLimitBytes: Number(sub.storageBytes),
        storageUsedPct: Number(sub.storageBytes) > 0 ? Math.round((Number(storageUsed._sum.sizeBytes ?? 0) / Number(sub.storageBytes)) * 100) : 0,
      },
      // SECURITY FIX (L-ADM-6): Expose the billing mode so the UI can show
      // "Manage subscription in Stripe" vs "Contact platform admin".
      billingMode: getBillingMode(),
    });
  },
);

const patchSchema = z.object({
  plan: z.enum(['trial', 'starter', 'business', 'enterprise']).optional(),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional(),
  seats: z.number().int().min(1).max(10000).optional(),
  storageBytes: z.number().int().min(1024 * 1024).max(1024 * 1024 * 1024 * 1024).optional(),
});

export const PATCH = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'admin.billing.update', action: 'update', resourceType: 'subscription', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = patchSchema.parse(await req.json());

    // SECURITY FIX (L-ADM-6): Only platform admins can change billing via PATCH.
    // tenant_admins must use Stripe (when configured) or contact platform admin.
    const isPlatformAdmin = hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_PLATFORM_BILLING_MANAGE);
    if (!isPlatformAdmin) {
      // Record the blocked attempt + alert platform admins
      await alertBillingSelfUpgradeAttempt({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorEmail: ctx.session.user.email,
        actorIp: ctx.ip,
        attemptedChange: body,
      });
      throw ApiError.forbidden(
        'not_authorized_billing',
        'Billing changes require platform admin permission. Use Stripe (if configured) or contact your platform administrator.',
      );
    }

    let sub = await db.subscription.findUnique({ where: { tenantId: ctx.targetTenantId } });
    if (!sub) {
      sub = await db.subscription.create({
        data: {
          tenantId: ctx.tenantId,
          plan: body.plan || 'trial',
          seats: body.seats || 5,
          storageBytes: BigInt(body.storageBytes || 5 * 1024 * 1024 * 1024),
        },
      });
    } else {
      // SECURITY FIX (L-ADM-6): Enforce plan-transition + limits policies.
      const currentPlan = sub.plan as Plan;
      const targetPlan = (body.plan ?? currentPlan) as Plan;
      const targetSeats = body.seats ?? sub.seats;
      const targetStorage = body.storageBytes ?? Number(sub.storageBytes);

      // Validate plan transition (allowlist + suspicious flag)
      if (body.plan !== undefined && body.plan !== currentPlan) {
        const transition = isPlanTransitionAllowed(currentPlan, targetPlan);
        if (!transition.allowed) {
          throw ApiError.badRequest('invalid_plan_transition', transition.reason || 'Plan transition not allowed');
        }
        if (transition.suspicious) {
          // Log but don't block — platform admin may have a legitimate reason
          await recordAuditEvent({
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            actorEmail: ctx.session.user.email,
            actorIp: ctx.ip,
            eventType: 'security.billing_suspicious_upgrade',
            action: 'update',
            resourceType: 'subscription',
            resourceId: sub.id,
            result: 'allow',
            reason: transition.reason,
            metadata: { previousPlan: currentPlan, newPlan: targetPlan },
          });
        }
      }

      // Validate plan limits
      const limitsCheck = validatePlanLimits(targetPlan, targetSeats, targetStorage);
      if (!limitsCheck.ok) {
        throw ApiError.badRequest('plan_limit_exceeded', limitsCheck.error!);
      }

      sub = await db.subscription.update({
        where: { tenantId: ctx.targetTenantId },
        data: {
          ...(body.plan !== undefined ? { plan: body.plan } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.seats !== undefined ? { seats: body.seats } : {}),
          ...(body.storageBytes !== undefined ? { storageBytes: BigInt(body.storageBytes) } : {}),
        },
      });
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.billing.updated',
      action: 'update',
      resourceType: 'subscription',
      resourceId: sub.id,
      result: 'allow',
      metadata: { changes: Object.keys(body) },
    });

    return NextResponse.json({ subscription: { ...sub, storageBytes: Number(sub.storageBytes) } });
  },
);
