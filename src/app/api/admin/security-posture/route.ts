/**
 * Smart EDMS — Security posture overview
 * GET /api/admin/security-posture
 *
 * Aggregates security-relevant metrics for admin review.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.ADMIN_VIEW },
  async (req: NextRequest, ctx) => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      lockedUsers,
      mfaEnabledCount,
      mfaDisabledCount,
      failedLogins24h,
      deniedActions24h,
      apiKeysActive,
      webhooksActive,
      documentsHs,
      documentsRestricted,
      legalHoldsActive,
      auditEvents24h,
      auditDenySpikes,
      recentFailedLogins,
    ] = await Promise.all([
      db.user.count({ where: { tenantId: ctx.tenantId } }),
      db.user.count({ where: { tenantId: ctx.tenantId, status: 'active' } }),
      db.user.count({ where: { tenantId: ctx.tenantId, status: 'suspended' } }),
      db.user.count({ where: { tenantId: ctx.tenantId, status: 'locked' } }),
      db.user.count({ where: { tenantId: ctx.tenantId, mfaEnabled: true } }),
      db.user.count({ where: { tenantId: ctx.tenantId, mfaEnabled: false, status: 'active' } }),
      db.auditEvent.count({
        where: {
          tenantId: ctx.tenantId,
          eventType: 'auth.login',
          result: 'deny',
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      }),
      db.auditEvent.count({
        where: {
          tenantId: ctx.tenantId,
          result: 'deny',
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      }),
      db.apiKey.count({ where: { tenantId: ctx.tenantId, revokedAt: null } }),
      db.webhook.count({ where: { tenantId: ctx.tenantId, enabled: true } }),
      db.document.count({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          classification: { code: 'HS' },
        },
      }),
      db.document.count({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          classification: { code: 'RESTRICTED' },
        },
      }),
      db.legalHold.count({ where: { tenantId: ctx.tenantId, releasedAt: null } }),
      db.auditEvent.count({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      }),
      db.auditEvent.groupBy({
        by: ['actorEmail'],
        where: {
          tenantId: ctx.tenantId,
          result: 'deny',
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
        _count: true,
        orderBy: { _count: { actorEmail: 'desc' } },
        take: 5,
      }),
      db.auditEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          eventType: 'auth.login',
          result: 'deny',
        },
        orderBy: { sequenceNum: 'desc' },
        take: 10,
        select: { actorEmail: true, actorIp: true, createdAt: true, reason: true },
      }),
    ]);

    // Compute posture score (0-100)
    const mfaScore = activeUsers > 0 ? Math.round((mfaEnabledCount / activeUsers) * 100) : 100;
    const postureScore = Math.min(100, Math.round(
      (mfaScore * 0.4) +
      (failedLogins24h === 0 ? 30 : Math.max(0, 30 - failedLogins24h * 3)) +
      (deniedActions24h < 10 ? 20 : Math.max(0, 20 - (deniedActions24h - 10))) +
      (suspendedUsers === 0 && lockedUsers === 0 ? 10 : 5)
    ));

    return NextResponse.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        locked: lockedUsers,
        mfaEnabled: mfaEnabledCount,
        mfaDisabled: mfaDisabledCount,
        mfaCoverage: mfaScore,
      },
      security: {
        failedLogins24h,
        deniedActions24h,
        apiKeysActive,
        webhooksActive,
        auditEvents24h,
        postureScore,
        postureGrade: postureScore >= 90 ? 'A' : postureScore >= 75 ? 'B' : postureScore >= 60 ? 'C' : postureScore >= 40 ? 'D' : 'F',
      },
      documents: {
        highlySensitive: documentsHs,
        restricted: documentsRestricted,
        legalHolds: legalHoldsActive,
      },
      anomalies: {
        topDeniedActors: auditDenySpikes.map((d) => ({ email: d.actorEmail, denyCount: d._count })),
        recentFailedLogins,
      },
    });
  },
);
