/**
 * Smart EDMS — Policy risk analysis (AI-assisted)
 * POST /api/documents/:id/policy-risk
 *
 * Analyzes a document against tenant policies + classifications and returns
 * risk suggestions (advisory only — never auto-applies).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { detectPii } from '@/lib/ai/analyzer';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AI_SUGGESTION_REQUEST,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'ai.policy_risk.request', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        classification: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        shares: { where: { revokedAt: null } },
      },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    // SECURITY FIX (M-DOC-21): Ownership check. See analyze-pii/route.ts.
    const { canReadDocument } = await import('@/lib/documents/access-control');
    const canRead = await canReadDocument(ctx.userId, ctx.tenantId, doc.id, ctx.session.user.permissions);
    if (!canRead) {
      throw ApiError.notFound('document_not_found', 'Document not found');
    }

    const [policies, piiResult] = await Promise.all([
      db.policy.findMany({ where: { tenantId: ctx.tenantId, enabled: true } }),
      detectPii(ctx.tenantId, doc.id).catch(() => ({ findings: [], totalMatches: 0, byType: {}, source: 'heuristic' })),
    ]);

    const risks: {
      severity: 'low' | 'medium' | 'high' | 'critical';
      category: string;
      description: string;
      recommendation: string;
    }[] = [];

    // Risk 1: HS/Restricted doc with active shares
    if ((doc.classification?.code === 'HS' || doc.classification?.code === 'RESTRICTED') && doc.shares.length > 0) {
      risks.push({
        severity: 'critical',
        category: 'sharing_policy_violation',
        description: `${doc.classification.code} document has ${doc.shares.length} active external share(s).`,
        recommendation: 'Revoke all external shares immediately. HS/Restricted documents should not be externally shared.',
      });
    }

    // Risk 2: PII detected in document
    if (piiResult.totalMatches > 0) {
      const byType = piiResult.byType as Record<string, number>;
      const highRiskPii = (byType.ssn || 0) + (byType.credit_card || 0) + (byType.iban || 0);
      risks.push({
        severity: highRiskPii > 0 ? 'critical' : 'high',
        category: 'pii_detected',
        description: `${piiResult.totalMatches} PII matches detected (${JSON.stringify(piiResult.byType)}).`,
        recommendation: highRiskPii > 0
          ? 'Highly sensitive PII (SSN/credit card/IBAN) detected. Consider redaction, reclassification to HS, or restricting access.'
          : 'PII detected. Review and consider redacting sensitive matches before sharing.',
      });
    }

    // Risk 3: Document classified lower than content suggests
    if (doc.classification?.level !== undefined && doc.classification.level < 3) {
      const byType = piiResult.byType as Record<string, number>;
      if (byType.ssn || byType.credit_card || byType.passport) {
        risks.push({
          severity: 'high',
          category: 'under_classified',
          description: `Document is classified as ${doc.classification.code} but contains highly sensitive PII.`,
          recommendation: 'Reclassify to Highly Sensitive (HS) to enforce stricter access controls.',
        });
      }
    }

    // Risk 4: Document with no retention schedule
    if (!doc.retentionScheduleId) {
      risks.push({
        severity: 'low',
        category: 'no_retention',
        description: 'No retention schedule assigned.',
        recommendation: 'Assign a retention schedule to ensure compliant lifecycle management.',
      });
    }

    // Risk 5: Document with no classification
    if (!doc.classification) {
      risks.push({
        severity: 'medium',
        category: 'unclassified',
        description: 'Document has no classification assigned.',
        recommendation: 'Assign a classification to enable policy enforcement.',
      });
    }

    // Risk 6: Old document not reviewed
    const daysSinceUpdate = (Date.now() - doc.updatedAt.getTime()) / (24 * 3600_000);
    if (daysSinceUpdate > 365) {
      risks.push({
        severity: 'low',
        category: 'stale_document',
        description: `Document last updated ${Math.round(daysSinceUpdate)} days ago.`,
        recommendation: 'Review for relevance, accuracy, and potential archival.',
      });
    }

    // Risk 7: Document owned by suspended user
    if (doc.ownerId) {
      const owner = await db.user.findUnique({ where: { id: doc.ownerId }, select: { status: true, name: true } });
      if (owner?.status === 'suspended') {
        risks.push({
          severity: 'medium',
          category: 'orphaned_document',
          description: `Document owner (${owner.name || 'unknown'}) is suspended.`,
          recommendation: 'Reassign ownership to an active user.',
        });
      }
    }

    const overallRisk = risks.some((r) => r.severity === 'critical') ? 'critical'
      : risks.some((r) => r.severity === 'high') ? 'high'
      : risks.some((r) => r.severity === 'medium') ? 'medium'
      : risks.some((r) => r.severity === 'low') ? 'low'
      : 'none';

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'ai.policy_risk.result',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: {
        overallRisk,
        riskCount: risks.length,
        categories: risks.map((r) => r.category),
      },
    });

    return NextResponse.json({
      overallRisk,
      risks,
      analyzedAt: new Date().toISOString(),
      requiresHumanReview: risks.some((r) => r.severity === 'high' || r.severity === 'critical'),
    });
  },
);
