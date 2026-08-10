/**
 * Smart EDMS — Workflow approve/reject
 * POST /api/workflows/:id/approve   { approvalId, decision: approve|reject, comment, signatureText? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { fireWebhook } from '@/lib/notifications/notify';
import { sha256 } from '@/lib/auth/crypto';
import { z } from 'zod';

const schema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().max(1000).optional(),
  signatureText: z.string().max(500).optional(),
});

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.WORKFLOW_APPROVE,
    audit: { eventType: 'workflow.approve', action: 'update', resourceType: 'workflow', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const body = schema.parse(await req.json());

    const result = await db.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({
        where: { id: body.approvalId, tenantId: ctx.tenantId, status: 'pending' },
        include: { workflow: true },
      });
      if (!approval) throw ApiError.notFound('approval_not_found', 'Pending approval not found');
      if (approval.approverId !== ctx.userId) throw ApiError.forbidden('not_approver', 'You are not the assigned approver');

      const signature = body.signatureText ? sha256(`${ctx.userId}|${approval.id}|${body.decision}|${body.signatureText}|${Date.now()}`) : null;

      const updated = await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: body.decision === 'approve' ? 'approved' : 'rejected',
          comment: body.comment,
          signature,
          decidedAt: new Date(),
        },
      });

      const wf = approval.workflow;
      const allStepApprovals = await tx.approval.findMany({
        where: { workflowId: wf.id, stepIndex: approval.stepIndex },
      });

      const stepApproverCount = allStepApprovals.length;
      const stepMode = approval.stepMode || 'all';
      const approvedCount = allStepApprovals.filter((a) => a.status === 'approved').length + (body.decision === 'approve' ? 1 : 0) - 1;
      const rejectedCount = allStepApprovals.filter((a) => a.status === 'rejected').length + (body.decision === 'reject' ? 1 : 0) - 1;

      // Determine if step is complete
      let workflowStatus: string | null = null;
      let nextStep: number | null = null;

      if (body.decision === 'reject' || rejectedCount > 0) {
        workflowStatus = 'rejected';
      } else if (stepMode === 'any') {
        // mode='any': first approval completes the step immediately.
        // Mark all OTHER pending approvals on this step as 'delegated'
        // (re-used as 'auto-resolved') so they don't count as pending.
        if (body.decision === 'approve') {
          await tx.approval.updateMany({
            where: {
              workflowId: wf.id,
              stepIndex: approval.stepIndex,
              id: { not: approval.id },
              status: 'pending',
            },
            data: {
              status: 'delegated',
              comment: 'Auto-resolved: another approver on this step already approved (mode=any).',
              decidedAt: new Date(),
            },
          });
        }
        // For mode='any', one approval is enough — proceed to next step
        const maxStep = Math.max(...(await tx.approval.findMany({
          where: { workflowId: wf.id },
          select: { stepIndex: true },
          distinct: ['stepIndex'],
        })).map((s) => s.stepIndex));

        if (approval.stepIndex < maxStep) {
          nextStep = approval.stepIndex + 1;
          await tx.approval.updateMany({
            where: { workflowId: wf.id, stepIndex: nextStep },
            data: { status: 'pending' },
          });
          await tx.workflow.update({
            where: { id: wf.id },
            data: { currentStep: nextStep },
          });
        } else {
          workflowStatus = 'approved';
          if (wf.name?.toLowerCase().includes('record')) {
            await tx.document.update({
              where: { id: wf.documentId ?? '' },
              data: { isRecord: true, state: 'record' },
            });
          }
        }
      } else if (approvedCount >= stepApproverCount) {
        // mode='all': all approvers must approve (default behavior)
        const maxStep = Math.max(...(await tx.approval.findMany({
          where: { workflowId: wf.id },
          select: { stepIndex: true },
          distinct: ['stepIndex'],
        })).map((s) => s.stepIndex));

        if (approval.stepIndex < maxStep) {
          nextStep = approval.stepIndex + 1;
          await tx.approval.updateMany({
            where: { workflowId: wf.id, stepIndex: nextStep },
            data: { status: 'pending' },
          });
          await tx.workflow.update({
            where: { id: wf.id },
            data: { currentStep: nextStep },
          });
        } else {
          workflowStatus = 'approved';
          if (wf.name?.toLowerCase().includes('record')) {
            await tx.document.update({
              where: { id: wf.documentId ?? '' },
              data: { isRecord: true, state: 'record' },
            });
          }
        }
      }

      if (workflowStatus) {
        await tx.workflow.update({
          where: { id: wf.id },
          data: { status: workflowStatus, completedAt: new Date() },
        });
      }

      return { approval: updated, workflowStatus, nextStep };
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'workflow.approve',
      action: 'update',
      resourceType: 'workflow',
      resourceId: params!.id,
      result: 'allow',
      reason: body.comment,
      metadata: {
        approvalId: body.approvalId,
        decision: body.decision,
        workflowStatus: result.workflowStatus,
        nextStep: result.nextStep,
      },
    });

    await fireWebhook(ctx.tenantId, body.decision === 'approve' ? 'workflow.approved' : 'workflow.rejected', { workflowId: params!.id, decision: body.decision, comment: body.comment });

    return NextResponse.json(result);
  },
);
