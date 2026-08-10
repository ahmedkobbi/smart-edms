/**
 * Smart EDMS — Workflow delegation
 * POST /api/workflows/:id/delegate   { approvalId, toUserId, reason }
 *
 * Allows an assigned approver to delegate their approval to another user.
 * The delegate becomes the new approver; the original approver is marked
 * 'delegated' with a record of who they delegated to.
 *
 * Rules:
 *   - Only the assigned approver can delegate
 *   - The delegate must be an active user in the same tenant
 *   - The delegate cannot be the same as the original approver
 *   - The delegate cannot already be an approver on the same step
 *     (would create a duplicate approval)
 *   - Requires WORKFLOW_DELEGATE permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { notify } from '@/lib/notifications/notify';
import { z } from 'zod';

const schema = z.object({
  approvalId: z.string().min(1),
  toUserId: z.string().min(1),
  reason: z.string().min(3).max(500),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.WORKFLOW_DELEGATE,
    audit: { eventType: 'workflow.delegate', action: 'update', resourceType: 'workflow', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());

    const result = await db.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({
        where: { id: body.approvalId, tenantId: ctx.tenantId, status: 'pending' },
        include: { workflow: true },
      });
      if (!approval) throw ApiError.notFound('approval_not_found', 'Pending approval not found');
      if (approval.approverId !== ctx.userId) {
        throw ApiError.forbidden('not_approver', 'Only the assigned approver can delegate this approval');
      }

      // Validate the delegate
      const delegate = await tx.user.findFirst({
        where: { id: body.toUserId, tenantId: ctx.tenantId, status: 'active' },
        select: { id: true, email: true, name: true },
      });
      if (!delegate) throw ApiError.badRequest('invalid_delegate', 'Delegate not found or inactive');
      if (delegate.id === ctx.userId) {
        throw ApiError.badRequest('cannot_delegate_to_self', 'You cannot delegate to yourself');
      }

      // Check the delegate isn't already an approver on this step
      const existing = await tx.approval.findFirst({
        where: {
          workflowId: approval.workflowId,
          stepIndex: approval.stepIndex,
          approverId: delegate.id,
        },
      });
      if (existing) {
        throw ApiError.conflict(
          'delegate_already_approver',
          'The delegate is already an approver on this workflow step',
        );
      }

      // Fetch the document title for the notification (separate query
      // because the Workflow model doesn't have a document relation in
      // the current Prisma schema)
      let docTitle = 'document';
      if (approval.documentId) {
        const doc = await tx.document.findUnique({
          where: { id: approval.documentId },
          select: { title: true },
        });
        if (doc) docTitle = doc.title;
      }

      // Create a delegation record
      await tx.approvalDelegation.create({
        data: {
          approvalId: approval.id,
          fromUserId: ctx.userId,
          toUserId: delegate.id,
          reason: body.reason,
        },
      });

      // Update the original approval: mark as delegated, record who it went to
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: 'delegated',
          delegatedTo: delegate.id,
          comment: `Delegated to ${delegate.email}: ${body.reason}`,
          decidedAt: new Date(),
        },
      });

      // Create a NEW approval for the delegate
      const newApproval = await tx.approval.create({
        data: {
          tenantId: ctx.tenantId,
          workflowId: approval.workflowId,
          documentId: approval.documentId,
          stepIndex: approval.stepIndex,
          stepName: approval.stepName,
          approverId: delegate.id,
          status: 'pending',
          stepMode: approval.stepMode,
          dueAt: approval.dueAt,
        },
      });

      return { approval, delegate, newApproval, workflow: approval.workflow, docTitle };
    });

    // Audit
    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'workflow.delegate',
      action: 'update',
      resourceType: 'workflow',
      resourceId: params!.id,
      result: 'allow',
      reason: body.reason,
      metadata: {
        approvalId: body.approvalId,
        newApprovalId: result.newApproval.id,
        fromUserId: ctx.userId,
        toUserId: body.toUserId,
        delegateEmail: result.delegate.email,
      },
    });

    // Notify the delegate
    await notify({
      tenantId: ctx.tenantId,
      userId: body.toUserId,
      type: 'workflow.assigned',
      severity: 'warning',
      link: `/workflows/${params!.id}`,
      metadata: {
        workflowId: params!.id,
        docTitle: result.docTitle,
        wfName: result.workflow.name ?? '',
        delegatedBy: ctx.session.user.email,
      },
    });

    return NextResponse.json({
      ok: true,
      newApprovalId: result.newApproval.id,
      delegate: result.delegate,
    });
  },
);
