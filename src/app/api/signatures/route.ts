import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createSignatureRequest, getDefaultProvider, isDocuSignConfigured, isAdobeSignConfigured } from '@/lib/signatures/signature-service';
import { db } from '@/lib/db';

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['signer', 'cc', 'certified_deliver', 'agent', 'editor', 'intermediary']).default('signer'),
  routingOrder: z.number().min(1).default(1),
});

const createSchema = z.object({
  documentId: z.string().min(1),
  provider: z.enum(['docusign', 'adobe_sign', 'internal']).default('internal'),
  recipients: z.array(recipientSchema).min(1),
  emailConfig: z.object({
    subject: z.string().min(3),
    message: z.string().optional().default(''),
    expiryDays: z.number().min(1).max(365).default(30),
    reminderDays: z.number().min(1).max(30).optional(),
  }),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const documentId = url.searchParams.get('documentId');

    const where: Record<string, unknown> = { tenantId: ctx.targetTenantId };
    if (status) where.status = status;
    if (documentId) where.documentId = documentId;

    const [total, items] = await Promise.all([
      db.signatureRequest.count({ where }),
      db.signatureRequest.findMany({
        where,
        include: { document: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return NextResponse.json({ items, total });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_CREATE, rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'signature.request.create', action: 'create', resourceType: 'signature_request', alwaysAudit: true } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());

    // Use default provider if not specified
    const provider = body.provider === 'internal' ? getDefaultProvider() : body.provider;

    const request = await createSignatureRequest({
      tenantId: ctx.targetTenantId,
      documentId: body.documentId,
      provider,
      recipients: body.recipients,
      emailConfig: body.emailConfig,
      initiatedBy: ctx.userId,
    });

    return NextResponse.json({ request }, { status: 201 });
  },
);

export const OPTIONS = async () => {
  return NextResponse.json({
    defaultProvider: getDefaultProvider(),
    docusignConfigured: isDocuSignConfigured(),
    adobeSignConfigured: isAdobeSignConfigured(),
  });
};
