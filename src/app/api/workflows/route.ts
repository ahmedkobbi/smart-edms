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
import { notify, fireWebhook } from '@/lib/notifications/notify';
import { sendWorkflowAssignedEmail } from '@/lib/notifications/email';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.WORKFLOW_APPROVE },
  async (req: NextRequest, ctx) => {
    // SECURITY FIX (M-ADM-9): Clamp page + pageSize. The previous code did
    // `parseInt(...)` with no clamp, allowing `?pageSize=99999999` to load
    // millions of joined rows (workflow → document.classification → approvals
    // → approver → delegations) into memory.
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '20', 10) || 20));
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
            stepMode: step.mode, // 'any' = first-approver-wins; 'all' = unanimous
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

    // Notify first-step approvers
    // Pass docTitle and wfName in metadata so the i18n template can interpolate them
    // for each recipient's locale (notify() resolves the recipient's locale).
    for (const approverId of body.steps[0].approverIds) {
      await notify({
        tenantId: ctx.tenantId,
        userId: approverId,
        type: 'workflow.assigned',
        severity: 'warning',
        link: `/workflows/${result.id}`,
        metadata: {
          workflowId: result.id,
          documentId: doc.id,
          stepIndex: 0,
          docTitle: doc.title,
          wfName: result.name,
        },
      });
      // Send email notification — resolve recipient's locale for full i18n
      const approver = await db.user.findUnique({
        where: { id: approverId },
        select: { email: true },
      });
      if (approver?.email) {
        const wfUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/workflows/${result.id}`;
        // Resolve the approver's locale (cached) and pass it to the email template
        const { getUserLocale } = await import('@/i18n/server-translator');
        const locale = await getUserLocale(approverId);
        sendWorkflowAssignedEmail({
          to: approver.email,
          documentTitle: doc.title,
          workflowName: result.name,
          workflowUrl: wfUrl,
          locale,
        }).catch((err) => {
          console.warn('[workflow] failed to send email to approver:', err);
        });
      }
    }

    // Fire webhook
    await fireWebhook(ctx.tenantId, 'workflow.created', {
      workflowId: result.id,
      documentId: doc.id,
      documentTitle: doc.title,
      initiatedBy: ctx.userId,
    });

    return NextResponse.json({ workflow: result }, { status: 201 });
  },
);
