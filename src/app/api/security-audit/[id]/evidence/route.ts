import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';
import { readFile } from 'fs/promises';
import { join } from 'path';

// GET: Download collected evidence as a zip-like JSON bundle
export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 5, windowMs: 60_000 } },
  async (req, ctx, params) => {
    const audit = await db.securityAudit.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
    });
    if (!audit) throw ApiError.notFound('audit_not_found', 'Security audit not found');

    const evidenceDir = process.env.SECURITY_AUDIT_EVIDENCE_DIR || '/tmp/smartedms-evidence';
    const evidencePath = join(evidenceDir, `audit-${params!.id}`);

    try {
      // Read the evidence manifest
      const manifestPath = join(evidencePath, 'evidence-manifest.json');
      const manifestRaw = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestRaw);

      // Read all evidence files
      const files: Record<string, unknown> = {};
      for (const file of manifest.files || []) {
        try {
          const content = await readFile(join(evidencePath, file.file), 'utf-8');
          files[file.file] = JSON.parse(content);
        } catch {
          files[file.file] = { error: 'Could not read file' };
        }
      }

      const bundle = {
        auditId: params!.id,
        tenantId: ctx.targetTenantId,
        auditTitle: audit.title,
        framework: audit.framework,
        collectedAt: manifest.collectedAt,
        evidenceFiles: manifest.files,
        evidence: files,
      };

      // Record the download
      await recordAuditEvent({
        tenantId: ctx.targetTenantId,
        eventType: 'security.evidence.downloaded',
        action: 'read',
        resourceType: 'security_audit',
        resourceId: params!.id,
        metadata: { fileCount: manifest.files?.length || 0 },
      });

      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="audit-evidence-${params!.id}.json"`,
        },
      });
    } catch (err) {
      logger.error('Evidence download failed', { auditId: params!.id, error: (err as Error).message });
      throw ApiError.notFound('evidence_not_found', 'No evidence collected for this audit. Run evidence collection first.');
    }
  },
);
