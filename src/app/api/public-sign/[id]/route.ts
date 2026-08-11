import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { logger } from '@/lib/config/logger';
import { createHash } from 'crypto';

const signSchema = z.object({
  email: z.string().email(),
  signatureText: z.string().min(2),
});

// Public endpoint — no createApiHandler, no auth required.
// External signers access this via /shared/sign/[id]?email=...
// Security: the email must match a recipient in the signature request.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = signSchema.parse(await req.json());

    const request = await db.signatureRequest.findFirst({
      where: { id: params.id },
    });
    if (!request) {
      return NextResponse.json({ error: { code: 'not_found', message: 'Signature request not found' } }, { status: 404 });
    }
    if (request.status === 'completed') {
      return NextResponse.json({ error: { code: 'already_signed', message: 'This document has already been signed' } }, { status: 409 });
    }
    if (request.status === 'voided' || request.status === 'expired') {
      return NextResponse.json({ error: { code: 'request_inactive', message: `Cannot sign: request is ${request.status}` } }, { status: 409 });
    }

    // Verify the email is in the recipient list
    const recipients = JSON.parse(request.recipients) as Array<{
      email: string; name: string; role: string; status?: string; signedAt?: string;
    }>;
    const recipient = recipients.find(r => r.email === body.email);
    if (!recipient) {
      return NextResponse.json({ error: { code: 'not_authorized', message: 'You are not an authorized recipient' } }, { status: 403 });
    }

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
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    const updateData: Record<string, unknown> = {
      recipients: JSON.stringify(recipients),
      auditTrail: JSON.stringify(auditTrail),
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
      tenantId: request.tenantId,
      eventType: 'signature.signed',
      action: 'update',
      resourceType: 'signature_request',
      resourceId: request.id,
      metadata: { email: body.email, allSigned, attestationHash },
    });

    logger.info('Document signed via public endpoint', {
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
  } catch (err: any) {
    logger.error('Public signing failed', { error: err.message });
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Signing failed' } },
      { status: 500 },
    );
  }
}

// Public GET — returns minimal signature request info for the signing page
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const request = await db.signatureRequest.findFirst({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      completedAt: true,
      recipients: true,
      documentId: true,
      document: { select: { id: true, title: true } },
    },
  });

  if (!request) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  }

  return NextResponse.json({
    request: {
      ...request,
      recipients: JSON.parse(request.recipients),
    },
  });
}
