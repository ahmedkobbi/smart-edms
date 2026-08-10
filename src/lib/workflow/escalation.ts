/**
 * Smart EDMS — Workflow escalation & reminder helper
 *
 * Called by:
 *   - The /api/cron/escalate endpoint (configured externally to hit every hour)
 *   - Manual invocation from admin
 *
 * For each pending approval past its dueAt:
 *   - If the workflow definition has an escalatesTo step, reassign.
 *   - Otherwise, mark as escalated + notify admin.
 *
 * Also sends reminders for approvals due within 24h.
 */

import { db } from '@/lib/db';
import { notify } from '@/lib/notifications/notify';
import { recordAuditEvent } from '@/lib/audit/audit-service';

export async function processOverdueWorkflows(): Promise<{
  escalated: number;
  reminded: number;
}> {
  let escalated = 0;
  let reminded = 0;

  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 3600_000);

  // Find all pending approvals
  const pendingApprovals = await db.approval.findMany({
    where: { status: 'pending' },
    include: {
      workflow: { include: { document: true } },
    },
    take: 500,
  });

  for (const approval of pendingApprovals) {
    if (!approval.dueAt) continue;

    // Overdue → escalate
    if (approval.dueAt < now) {
      // Look for an escalation target in workflow definition (if any)
      const wfDef = approval.workflow.definitionId
        ? await db.workflowDefinition.findUnique({ where: { id: approval.workflow.definitionId } })
        : null;

      let escalatesTo: string | null = null;
      if (wfDef) {
        try {
          const steps = JSON.parse(wfDef.steps || '[]');
          if (steps[approval.stepIndex]?.escalatesTo) {
            escalatesTo = steps[approval.stepIndex].escalatesTo;
          }
        } catch {}
      }

      if (escalatesTo) {
        // Reassign to escalation target
        const target = await db.user.findFirst({
          where: { id: escalatesTo, tenantId: approval.tenantId, status: 'active' },
        });
        if (target) {
          await db.$transaction(async (tx) => {
            await tx.approval.update({
              where: { id: approval.id },
              data: { status: 'escalated' },
            });
            await tx.approval.create({
              data: {
                tenantId: approval.tenantId,
                workflowId: approval.workflowId,
                documentId: approval.documentId,
                stepIndex: approval.stepIndex,
                stepName: approval.stepName + ' (escalated)',
                approverId: target.id,
                status: 'pending',
                dueAt: new Date(now.getTime() + 48 * 3600_000),
              },
            });
          });
          await notify({
            tenantId: approval.tenantId,
            userId: target.id,
            type: 'workflow.escalated',
            severity: 'critical',
            link: `/workflows/${approval.workflowId}`,
            metadata: {
              workflowId: approval.workflowId,
              originalApprover: approval.approverId,
              docTitle: approval.workflow.document?.title ?? 'document',
              wfName: approval.workflow.name ?? '',
            },
          });
        }
      } else {
        // No escalation target — mark escalated + notify admin
        await db.approval.update({
          where: { id: approval.id },
          data: { status: 'escalated' },
        });
        const admins = await db.roleAssignment.findMany({
          where: { tenantId: approval.tenantId, role: { name: 'tenant_admin' } },
          select: { userId: true },
        });
        for (const a of admins) {
          await notify({
            tenantId: approval.tenantId,
            userId: a.userId,
            type: 'workflow.overdue',
            severity: 'critical',
            link: `/workflows/${approval.workflowId}`,
            metadata: {
              workflowId: approval.workflowId,
              approvalId: approval.id,
              docTitle: approval.workflow.document?.title ?? 'document',
            },
          });
        }
      }
      escalated++;
    } else if (approval.dueAt < twentyFourHoursFromNow) {
      // Due within 24h → reminder
      await notify({
        tenantId: approval.tenantId,
        userId: approval.approverId,
        type: 'workflow.reminder',
        severity: 'warning',
        link: `/workflows/${approval.workflowId}`,
        metadata: {
          workflowId: approval.workflowId,
          dueAt: approval.dueAt,
          docTitle: approval.workflow.document?.title ?? 'document',
        },
      });
      reminded++;
    }
  }

  if (escalated > 0 || reminded > 0) {
    // Best-effort audit record (use first tenant encountered)
    const tenantId = pendingApprovals[0]?.tenantId;
    if (tenantId) {
      await recordAuditEvent({
        tenantId,
        eventType: 'workflow.escalation.run',
        action: 'update',
        resourceType: 'workflow',
        result: 'allow',
        metadata: { escalated, reminded, runAt: now.toISOString() },
      });
    }
  }

  return { escalated, reminded };
}
