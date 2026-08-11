import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { collectEvidence } from '@/lib/security/audit-framework';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 3, windowMs: 60_000 } },
  async (req, ctx, params) => {
    const evidenceDir = process.env.SECURITY_AUDIT_EVIDENCE_DIR || '/tmp/smartedms-evidence';
    const evidencePath = await collectEvidence(ctx.targetTenantId, params!.id, evidenceDir);

    return NextResponse.json({
      collected: true,
      path: evidencePath,
      message: 'Evidence collected successfully. Download the files from the server.',
    }, { status: 201 });
  },
);
