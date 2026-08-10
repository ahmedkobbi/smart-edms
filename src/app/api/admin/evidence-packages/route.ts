/**
 * Smart EDMS — Evidence Packages (§9.12 — exportable audit evidence)
 *
 * GET  /api/admin/evidence-packages        list packages
 * POST /api/admin/evidence-packages        generate a new evidence package
 *
 * An evidence package is a structured export containing:
 *   - Audit events for a time period (with hash chain verification)
 *   - Document metadata (not content)
 *   - Classification change history
 *   - Retention disposition records
 *   - Legal hold history
 *   - Signed audit receipt(s)
 *
 * The export is locale-aware: labels are localized based on the ?locale= param.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { sha256 } from '@/lib/auth/crypto';
import { logger } from '@/lib/config/logger';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.AUDIT_EXPORT },
  async (req: NextRequest, ctx) => {
    const items = await db.evidencePackage.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  locale: z.enum(['en', 'ar', 'fr', 'es', 'de']).default('en'),
  includeAuditEvents: z.boolean().default(true),
  includeDocuments: z.boolean().default(true),
  includeClassificationChanges: z.boolean().default(true),
  includeDispositions: z.boolean().default(true),
  includeLegalHolds: z.boolean().default(true),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AUDIT_EXPORT,
    rateLimit: { max: 3, windowMs: 60_000 },
    audit: { eventType: 'evidence.generate', action: 'create', resourceType: 'evidence_package', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);

    // Create the evidence package record
    const pkg = await db.evidencePackage.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description,
        createdBy: ctx.userId,
        status: 'generating',
        locale: body.locale,
        periodStart,
        periodEnd,
        manifest: JSON.stringify({
          includeAuditEvents: body.includeAuditEvents,
          includeDocuments: body.includeDocuments,
          includeClassificationChanges: body.includeClassificationChanges,
          includeDispositions: body.includeDispositions,
          includeLegalHolds: body.includeLegalHolds,
        }),
      },
    });

    // Gather evidence data
    const evidence: any = {
      package: {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        locale: pkg.locale,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        generatedAt: new Date().toISOString(),
        generatedBy: ctx.session.user.email,
        tenantId: ctx.tenantId,
      },
    };

    let eventCount = 0;
    let documentCount = 0;

    if (body.includeAuditEvents) {
      const events = await db.auditEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { sequenceNum: 'asc' },
        select: {
          sequenceNum: true, eventType: true, action: true, result: true,
          actorEmail: true, actorIp: true, resourceType: true, resourceId: true,
          resourceName: true, reason: true, eventHash: true, prevHash: true, createdAt: true,
          metadata: true,
        },
      });
      evidence.auditEvents = events;
      eventCount = events.length;

      // Include hash chain verification result
      const { verifyAuditChain } = await import('@/lib/audit/audit-service');
      const verification = await verifyAuditChain(ctx.tenantId, { limit: 10_000 });
      evidence.auditChainVerification = verification;
    }

    if (body.includeDocuments) {
      const docs = await db.document.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: {
          id: true, title: true, state: true, documentType: true,
          documentLanguage: true, textDirection: true,
          isRecord: true, legalHold: true,
          classification: { select: { code: true, name: true } },
          currentVersion: true, createdAt: true, updatedAt: true,
        },
      });
      evidence.documents = docs;
      documentCount = docs.length;
    }

    if (body.includeClassificationChanges) {
      const changes = await db.classificationChange.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        include: {
          fromClass: { select: { code: true, name: true } },
          toClass: { select: { code: true, name: true } },
          actor: { select: { email: true } },
        },
      });
      evidence.classificationChanges = changes;
    }

    if (body.includeDispositions) {
      const dispositions = await db.dispositionRecord.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      });
      evidence.dispositions = dispositions;
    }

    if (body.includeLegalHolds) {
      const holds = await db.legalHold.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
      });
      evidence.legalHolds = holds;
    }

    // Include signed audit receipts for the period
    const receipts = await db.auditReceipt.findMany({
      where: {
        tenantId: ctx.tenantId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });
    evidence.signedReceipts = receipts;

    // Compute package hash for integrity
    const packageJson = JSON.stringify(evidence, null, 2);
    const packageHash = sha256(packageJson);

    // Persist to object storage
    const storageKey = `evidence/${ctx.tenantId}/${pkg.id}/evidence.json`;
    const { getFileStorage } = await import('@/lib/storage/file-storage');
    const storage = getFileStorage();
    await storage.put(storageKey, Buffer.from(packageJson, 'utf-8'), 'application/json', {
      tenantId: ctx.tenantId,
      evidencePackageId: pkg.id,
      generatedBy: ctx.userId,
    });

    // Update the package record
    const updated = await db.evidencePackage.update({
      where: { id: pkg.id },
      data: {
        status: 'ready',
        eventCount,
        documentCount,
        packageHash,
        storageKey,
        fileSize: Buffer.byteLength(packageJson, 'utf-8'),
        completedAt: new Date(),
      },
    });

    logger.info('evidence.package_generated', {
      packageId: pkg.id,
      eventCount,
      documentCount,
      locale: body.locale,
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'evidence.package_generated',
      action: 'create',
      resourceType: 'evidence_package',
      resourceId: pkg.id,
      resourceName: pkg.name,
      result: 'allow',
      metadata: {
        eventCount,
        documentCount,
        locale: body.locale,
        packageHash,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    });

    return NextResponse.json({
      package: updated,
      evidence, // Return the full evidence JSON (in production, would return a download URL)
      packageHash,
    }, { status: 201 });
  },
);
