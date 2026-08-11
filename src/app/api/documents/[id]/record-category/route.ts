import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

const assignSchema = z.object({
  categoryId: z.string().nullable(),
});

// GET — fetch the current record category assignment for a document
export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      select: {
        id: true,
        recordCategoryId: true,
        isRecord: true,
        state: true,
      },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    let category: any = null;
    if (doc.recordCategoryId) {
      category = await db.recordCategory.findFirst({
        where: { id: doc.recordCategoryId, tenantId: ctx.targetTenantId },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          disposition: true,
          retentionActiveYears: true,
          retentionSemiActiveYears: true,
          dispositionAction: true,
          isVital: true,
          isOnHold: true,
        },
      });
    }

    // Also check if this document is a vital record
    const vitalRecord = await db.vitalRecord.findFirst({
      where: { documentId: params!.id, tenantId: ctx.targetTenantId },
      select: {
        id: true,
        vitalReason: true,
        recordType: true,
        recoveryPriority: true,
        backupVerified: true,
        lastVerifiedAt: true,
        nextReviewAt: true,
        reviewCycleMonths: true,
      },
    });

    return NextResponse.json({ category, vitalRecord, document: doc });
  },
);

// POST — assign or unassign a record category
export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE, rateLimit: { max: 20, windowMs: 60_000 },
    audit: { eventType: 'document.record_category.assigned', action: 'update', resourceType: 'document', resourceIdFromParams: 'id', alwaysAudit: true } },
  async (req, ctx, params) => {
    const body = assignSchema.parse(await req.json());

    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      select: { id: true, recordCategoryId: true },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    // If categoryId is null, remove the assignment
    if (body.categoryId === null) {
      const updated = await db.document.update({
        where: { id: params!.id },
        data: { recordCategoryId: null },
      });

      await recordAuditEvent({
        tenantId: ctx.targetTenantId,
        eventType: 'document.record_category.removed',
        action: 'update',
        resourceType: 'document',
        resourceId: params!.id,
        metadata: { previousCategoryId: doc.recordCategoryId },
      });

      logger.info('Record category removed from document', { documentId: params!.id });
      return NextResponse.json({ document: updated, category: null });
    }

    // Verify the category exists and belongs to the tenant
    const category = await db.recordCategory.findFirst({
      where: { id: body.categoryId, tenantId: ctx.targetTenantId },
    });
    if (!category) throw ApiError.notFound('category_not_found', 'Record category not found');

    const updated = await db.document.update({
      where: { id: params!.id },
      data: { recordCategoryId: body.categoryId },
    });

    await recordAuditEvent({
      tenantId: ctx.targetTenantId,
      eventType: 'document.record_category.assigned',
      action: 'update',
      resourceType: 'document',
      resourceId: params!.id,
      metadata: { categoryId: body.categoryId, categoryCode: category.code, categoryName: category.name },
    });

    logger.info('Record category assigned to document', {
      documentId: params!.id,
      categoryId: body.categoryId,
      categoryCode: category.code,
    });

    return NextResponse.json({ document: updated, category });
  },
);
