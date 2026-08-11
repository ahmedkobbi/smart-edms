import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';
import { createHash } from 'crypto';

const signSchema = z.object({
  email: z.string().email(),
  signatureText: z.string().min(2),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ, rateLimit: { max: 5, windowMs: 60_000 } },
  async (req, ctx, params) => {
    const body = signSchema.parse(await req.json());

    const request = await db.signatureRequest.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
    });
    if (!request) throw ApiError.notFound('signature_not_found', 'Signature request not found');
    if (request.status === 'completed') throw ApiError.conflict('already_signed', 'This document has already been signed');
    if (request.status === 'voided' || request.status === 'expired') {
      throw ApiError.conflict('request_inactive', `Cannot sign: request is ${request.status}`);
    }

    // Verify the email is in the recipient list
    const recipients = JSON.parse(request.recipients) as Array<{ email: string; name: string; role: string; status?: string; signedAt?: string }>;
    const recipient = recipients.find(r => r.email === body.email);
    if (!recipient) throw ApiError.forbidden('not_authorized', 'You are not an authorized recipient for this signature request');

    // Create a signature attestation hash
    const attestationHash = createHash('sha256')
      .update(`${request.id}|${body.email}|${body.signatureText}|${new Date().toISOString()}`)
      .digest('hex');

    // Update the recipient's status
    recipient.status = 'signed';
    recipient.signedAt = new Date().toISOString();

    // Check if all signers have signed
    const allSigned = recipients.filter(r => r.role === 'signer').every(r => r.status === 'signed');

    // Update the audit trail
    const auditTrail = JSON.parse(request.auditTrail || '[]');
    auditTrail.push({
      event: 'recipient-signed',
      timestamp: new Date().toISOString(),
      email: body.email,
      signatureText: body.signatureText,
      attestationHash,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const updateData: Record<string, unknown> = {
      recipients: JSON.stringify(recipients) as any,
      auditTrail: JSON.stringify(auditTrail) as any,
    };

    if (allSigned) {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
    } else if (request.status === 'sent') {
      updateData.status = 'delivered';
      updateData.deliveredAt = new Date();
    }

    const updated = await db.signatureRequest.update({
      where: { id: request.id },
      data: updateData,
    });

    await recordAuditEvent({
      tenantId: ctx.targetTenantId,
      eventType: 'signature.signed',
      action: 'update',
      resourceType: 'signature_request',
      resourceId: request.id,
      metadata: { email: body.email, allSigned, attestationHash },
    });

    logger.info('Document signed via internal provider', {
      requestId: request.id,
      email: body.email,
      allSigned,
    });

    return NextResponse.json({
      signed: true,
      completed: allSigned,
      attestationHash,
      request: updated,
    });
  },
);
