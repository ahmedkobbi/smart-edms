/**
 * Smart EDMS — Workflows list & create
 *
 * GET  /api/workflows?status=&documentId=&page=
 * POST /api/workflows   { documentId, name, steps: [{approverIds, mode, dueInHours}] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.WORKFLOW_APPROVE },
  async (req: NextRequest, ctx) => {
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10);
    const status = req.nextUrl.searchParams.get('status');
    const documentId = req.nextUrl.searchParams.get('documentId');
    const assignedToMe = req.nextUrl.searchParams.get('assignedToMe') === 'true';

    const where = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(documentId ? { documentId } : {}),
      ...(assignedToMe ? { approvals: { some: { approverId: ctx.userId, status: 'pending' } } } : {}),
    };

    const [total, items] = await Promise.all([
      db.workflow.count({ where }),
      db.workflow.findMany({
        where,
        include: {
          document: { select: { id: true, title: true, classification: true } },
          initiator: { select: { id: true, name: true, email: true } },
          approvals: {
            include: { approver: { select: { id: true, name: true, email: true } } },
            orderBy: { stepIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  },
);

const stepSchema = z.object({
  name: z.string().min(1).max(100),
  approverIds: z.array(z.string()).min(1),
  mode: z.enum(['any', 'all']).default('all'),
  dueInHours: z.number().int().min(1).max(720).default(72),
});

const createSchema = z.object({
  documentId: z.string().min(1),
  name: z.string().min(1).max(200),
  steps: z.array(stepSchema).min(1),
  reason: z.string().max(500).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.WORKFLOW_CREATE,
    audit: { eventType: 'workflow.create', action: 'create', resourceType: 'workflow', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const body = createSchema.parse(await req.json());

    const doc = await db.document.findFirst({
      where: { id: body.documentId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('document_not_found', 'Document not found');

    const result = await db.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          initiatedById: ctx.userId,
          name: body.name,
          status: 'pending',
          currentStep: 0,
          dueAt: body.steps[0].dueInHours
            ? new Date(Date.now() + body.steps[0].dueInHours * 3600_000)
            : null,
          reason: body.reason,
        },
      });

      // Create approval rows for step 0
      const step = body.steps[0];
      for (const approverId of step.approverIds) {
        const approver = await tx.user.findFirst({ where: { id: approverId, tenantId: ctx.tenantId, status: 'active' } });
        if (!approver) throw ApiError.badRequest('invalid_approver', `Approver ${approverId} not found`);
        await tx.approval.create({
          data: {
            tenantId: ctx.tenantId,
            workflowId: workflow.id,
            documentId: doc.id,
            stepIndex: 0,
            stepName: step.name,
            approverId,
            status: 'pending',
            dueAt: new Date(Date.now() + step.dueInHours * 3600_000),
          },
        });
      }

      return workflow;
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'workflow.create',
      action: 'create',
      resourceType: 'workflow',
      resourceId: result.id,
      resourceName: result.name,
      result: 'allow',
      reason: body.reason,
      metadata: {
        documentId: doc.id,
        documentName: doc.title,
        stepCount: body.steps.length,
        firstStepApprovers: body.steps[0].approverIds,
      },
    });

    return NextResponse.json({ workflow: result }, { status: 201 });
  },
);
