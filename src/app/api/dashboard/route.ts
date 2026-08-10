/**
 * Smart EDMS — Dashboard summary
 * GET /api/dashboard
 *
 * Returns aggregates: document counts by state/classification,
 * pending approvals, recent activity, security posture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';

export const GET = createApiHandler(
  {},
  async (req: NextRequest, ctx) => {
    const isAdmin = hasPermission(ctx.session.user.permissions, PERMISSIONS.ADMIN_VIEW);

    // SECURITY FIX (M-ADM-14): `recentActivity` (last 10 audit events) and
    // `legalHolds` count leak PII of other tenant users — actorEmail exposes
    // every acting user's email (including admins and security officers) to
    // every other user. Restrict:
    //   - Non-admins see only THEIR OWN recent activity (filtered by actorId).
    //   - Non-admins do not see the legalHolds count (gate behind LEGAL_HOLD_MANAGE).
    const auditWhere = isAdmin
      ? { tenantId: ctx.tenantId }
      : { tenantId: ctx.tenantId, actorId: ctx.userId };
    const [
      totalDocs,
      byState,
      byClassification,
      recentDocs,
      pendingApprovals,
      myDocs,
      recentAudit,
      legalHolds,
      myFavorites,
      myRecentViews,
    ] = await Promise.all([
      db.document.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
      db.document.groupBy({
        by: ['state'],
        where: { tenantId: ctx.tenantId, deletedAt: null },
        _count: true,
      }),
      db.document.groupBy({
        by: ['classificationId'],
        where: { tenantId: ctx.tenantId, deletedAt: null, classificationId: { not: null } },
        _count: true,
      }),
      db.document.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { classification: true, owner: { select: { name: true } } },
      }),
      db.approval.count({
        where: { tenantId: ctx.tenantId, approverId: ctx.userId, status: 'pending' },
      }),
      db.document.count({
        where: { tenantId: ctx.tenantId, ownerId: ctx.userId, deletedAt: null },
      }),
      db.auditEvent.findMany({
        where: auditWhere,
        orderBy: { sequenceNum: 'desc' },
        take: 10,
        select: {
          id: true, eventType: true, action: true, result: true,
          actorEmail: true, resourceName: true, createdAt: true,
        },
      }),
      // SECURITY FIX (M-ADM-14): Only expose legalHolds count to admins.
      isAdmin
        ? db.legalHold.count({ where: { tenantId: ctx.tenantId, releasedAt: null } })
        : Promise.resolve(0),
      db.favorite.findMany({
        where: { userId: ctx.userId, tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          document: {
            select: { id: true, title: true, state: true, classification: { select: { code: true, name: true, color: true } } },
          },
        },
      }),
      db.recentView.findMany({
        where: { userId: ctx.userId, tenantId: ctx.tenantId },
        orderBy: { viewedAt: 'desc' },
        take: 5,
        include: {
          document: {
            select: { id: true, title: true, state: true, classification: { select: { code: true, name: true, color: true } } },
          },
        },
      }),
    ]);

    // Resolve classification names
    const classIds = byClassification.map((b) => b.classificationId!).filter(Boolean);
    const classifications = classIds.length > 0
      ? await db.classification.findMany({ where: { id: { in: classIds } } })
      : [];
    const classMap = new Map(classifications.map((c) => [c.id, c]));
    const classificationBreakdown = byClassification.map((b) => ({
      classification: b.classificationId ? classMap.get(b.classificationId) : null,
      count: b._count,
    }));

    const stateBreakdown = byState.map((b) => ({ state: b.state, count: b._count }));

    return NextResponse.json({
      stats: {
        totalDocuments: totalDocs,
        myDocuments: myDocs,
        pendingApprovals,
        legalHolds,
        isAdmin,
      },
      breakdowns: {
        byState: stateBreakdown,
        byClassification: classificationBreakdown,
      },
      recentDocuments: recentDocs,
      recentActivity: recentAudit,
      myFavorites: myFavorites.map((f) => ({ ...f.document, favoritedAt: f.createdAt })),
      myRecentViews: myRecentViews.map((r) => ({ ...r.document, viewedAt: r.viewedAt })),
    });
  },
);
