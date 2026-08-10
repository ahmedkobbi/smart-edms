/**
 * Smart EDMS — Key rotation
 * POST /api/admin/key-rotation
 *
 * Re-wraps all document DEKs with the current KEK.
 * Use after rotating the SMART_EDMS_KEK environment variable.
 *
 * Requires step-up authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getKek } from '@/lib/auth/crypto';
import { rotateWrappedDeks } from '@/lib/storage/envelope-encryption';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.ADMIN_TENANT_MANAGE,
    requireStepUp: true,
    rateLimit: { max: 1, windowMs: 60 * 60 * 1000 },
    audit: { eventType: 'admin.key_rotation', action: 'update', resourceType: 'tenant', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const kek = await getKek();

    logger.info('key_rotation.started', { tenantId: ctx.tenantId, actorId: ctx.userId });

    const result = await rotateWrappedDeks(ctx.tenantId, kek);

    logger.info('key_rotation.completed', { tenantId: ctx.tenantId, rotated: result.rotated });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'admin.key_rotation.completed',
      action: 'update',
      resourceType: 'tenant',
      resourceId: ctx.tenantId,
      result: 'allow',
      metadata: {
        rotatedCount: result.rotated,
        keyVersion: 'rotated',
      },
    });

    return NextResponse.json({
      ok: true,
      rotated: result.rotated,
      message: `Successfully re-wrapped ${result.rotated} document encryption key(s) with the current KEK.`,
    });
  },
);
