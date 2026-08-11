#!/usr/bin/env python3
"""Generate all API route files for the 4 new features."""

import os

ROUTES = {
    # =========================================================================
    # FEATURE 1: SECURITY AUDIT
    # =========================================================================
    "src/app/api/security-audit/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createSecurityAudit, COMPLIANCE_CONTROLS } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  framework: z.enum(['iso27001', 'soc2', 'gdpr', 'hipaa', 'dod501502', 'internal']).default('internal'),
  scope: z.enum(['full', 'auth', 'documents', 'billing', 'infrastructure', 'api']).default('full'),
  auditorName: z.string().optional(),
  auditorEmail: z.string().email().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ, rateLimit: { max: 30, windowMs: 60_000 } },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const framework = url.searchParams.get('framework');

    const where: Record<string, unknown> = { tenantId: ctx.targetTenantId };
    if (status) where.status = status;
    if (framework) where.framework = framework;

    const [total, items] = await Promise.all([
      db.securityAudit.count({ where }),
      db.securityAudit.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);

    return NextResponse.json({ items, total });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 10, windowMs: 60_000 },
    audit: { eventType: 'security.audit.create', action: 'create', resourceType: 'security_audit', alwaysAudit: true } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const audit = await createSecurityAudit({
      tenantId: ctx.targetTenantId,
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      initiatedBy: ctx.userId,
    });
    return NextResponse.json({ audit }, { status: 201 });
  },
);

export const OPTIONS = async () => {
  return NextResponse.json({ frameworks: Object.keys(COMPLIANCE_CONTROLS), controls: COMPLIANCE_CONTROLS });
};
''',

    "src/app/api/security-audit/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuditWithFindings, updateAuditStatus, generateAuditReport } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const audit = await getAuditWithFindings(params!.id, ctx.targetTenantId);
    if (!audit) throw ApiError.notFound('audit_not_found', 'Security audit not found');

    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'report') {
      const report = await generateAuditReport(params!.id, ctx.targetTenantId);
      return new NextResponse(report, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="audit-report-${params!.id}.json"` } });
    }

    return NextResponse.json({ audit });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const { status, ...rest } = body;

    const audit = await db.securityAudit.findFirst({ where: { id: params!.id, tenantId: ctx.targetTenantId } });
    if (!audit) throw ApiError.notFound('audit_not_found', 'Security audit not found');

    const updated = await db.securityAudit.update({
      where: { id: params!.id },
      data: { ...rest, ...(status ? { status } : {}) },
    });

    return NextResponse.json({ audit: updated });
  },
);
''',

    "src/app/api/security-audit/[id]/findings/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createFinding } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

const createFindingSchema = z.object({
  findingId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(10),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']).default('medium'),
  cvssScore: z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  affectedComponent: z.string().optional(),
  cweId: z.string().optional(),
  remediation: z.string().optional(),
  evidence: z.array(z.object({ type: z.string(), path: z.string(), hash: z.string().optional() })).optional(),
  controlRefs: z.record(z.array(z.string())).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const findings = await db.securityAuditFinding.findMany({
      where: { auditId: params!.id, tenantId: ctx.targetTenantId },
      orderBy: { severity: 'asc' },
    });
    return NextResponse.json({ items: findings, total: findings.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE, rateLimit: { max: 30, windowMs: 60_000 } },
  async (req, ctx, params) => {
    const body = createFindingSchema.parse(await req.json());
    const finding = await createFinding({
      tenantId: ctx.targetTenantId,
      auditId: params!.id,
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    });
    return NextResponse.json({ finding }, { status: 201 });
  },
);
''',

    "src/app/api/security-audit/[id]/findings/[findingId]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { remediateFinding } from '@/lib/security/audit-framework';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx, params) => {
    const finding = await db.securityAuditFinding.findFirst({
      where: { id: params!.findingId, tenantId: ctx.targetTenantId },
    });
    if (!finding) throw ApiError.notFound('finding_not_found', 'Finding not found');
    return NextResponse.json({ finding });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();

    if (body.status === 'remediated') {
      const finding = await remediateFinding(
        params!.findingId,
        ctx.targetTenantId,
        ctx.userId,
        body.remediation || 'Remediated',
        body.verified || false,
      );
      return NextResponse.json({ finding });
    }

    const finding = await db.securityAuditFinding.update({
      where: { id: params!.findingId },
      data: body,
    });
    return NextResponse.json({ finding });
  },
);
''',

    "src/app/api/security-audit/scan/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { runFullScan, runNpmAuditScan, runSecretScan, runConfigScan } from '@/lib/security/audit-framework';

const scanSchema = z.object({
  scanType: z.enum(['full', 'dependency', 'secret', 'config']).default('full'),
  auditId: z.string().optional(),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_SCAN_RUN, rateLimit: { max: 3, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = scanSchema.parse(await req.json());

    let results;
    if (body.scanType === 'full') {
      results = await runFullScan(ctx.targetTenantId, body.auditId);
    } else if (body.scanType === 'dependency') {
      results = [await runNpmAuditScan(ctx.targetTenantId)];
    } else if (body.scanType === 'secret') {
      results = [await runSecretScan(ctx.targetTenantId)];
    } else {
      results = [await runConfigScan(ctx.targetTenantId)];
    }

    return NextResponse.json({ results }, { status: 201 });
  },
);

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx) => {
    const { prisma } = await import('@/lib/db');
    const scans = await prisma.securityScanResult.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items: scans, total: scans.length });
  },
);
''',

    # =========================================================================
    # FEATURE 2: E-SIGNATURE
    # =========================================================================
    "src/app/api/signatures/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
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
''',

    "src/app/api/signatures/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSignatureRequest } from '@/lib/signatures/signature-service';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ },
  async (req, ctx, params) => {
    const request = await getSignatureRequest(params!.id, ctx.targetTenantId);
    if (!request) throw ApiError.notFound('signature_not_found', 'Signature request not found');
    return NextResponse.json({ request });
  },
);
''',

    "src/app/api/signatures/[id]/void/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { voidSignatureRequest } from '@/lib/signatures/signature-service';

const voidSchema = z.object({ reason: z.string().min(3) });

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_VOID, requireStepUp: true },
  async (req, ctx, params) => {
    const body = voidSchema.parse(await req.json());
    const request = await voidSignatureRequest(params!.id, ctx.targetTenantId, ctx.userId, body.reason);
    return NextResponse.json({ request });
  },
);
''',

    "src/app/api/signatures/[id]/signing-url/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { getSigningUrl } from '@/lib/signatures/signature-service';

const schema = z.object({ email: z.string().email() });

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.SIGNATURE_READ },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const url = await getSigningUrl(params!.id, ctx.targetTenantId, body.email);
    return NextResponse.json({ url });
  },
);
''',

    "src/app/api/signatures/webhooks/docusign/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { verifyDocusignWebhookSignature, processSignatureWebhook } from '@/lib/signatures/signature-service';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

// Webhook endpoints are NOT behind createApiHandler — they use HMAC verification instead.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-docusign-signature') || '';

    const verified = verifyDocusignWebhookSignature(rawBody, signature);
    if (!verified) {
      logger.warn('DocuSign webhook signature verification failed', { ip: req.headers.get('x-forwarded-for') });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = {
      eventType: payload.event || 'unknown',
      envelopeId: payload.data?.envelopeId || payload.envelopeId,
      tenantId: payload.data?.tenantId || payload.tenantId,
      payload,
      signature,
      verified: true,
    };

    await processSignatureWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error('DocuSign webhook processing failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
''',

    # =========================================================================
    # FEATURE 3: BPMN WORKFLOW DESIGNER
    # =========================================================================
    "src/app/api/bpmn/definitions/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { saveBpmnDefinition, listBpmnDefinitions } from '@/lib/bpmn/bpmn-engine';

const saveSchema = z.object({
  processKey: z.string().min(2).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  name: z.string().min(3),
  description: z.string().optional(),
  bpmnXml: z.string().min(50),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as any;
    const definitions = await listBpmnDefinitions(ctx.targetTenantId, status);
    return NextResponse.json({ items: definitions, total: definitions.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = saveSchema.parse(await req.json());
    const definition = await saveBpmnDefinition({
      tenantId: ctx.targetTenantId,
      ...body,
      createdBy: ctx.userId,
    });
    return NextResponse.json({ definition }, { status: 201 });
  },
);
''',

    "src/app/api/bpmn/definitions/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getBpmnDefinition } from '@/lib/bpmn/bpmn-engine';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx, params) => {
    const definition = await getBpmnDefinition(params!.id, ctx.targetTenantId);
    if (!definition) throw ApiError.notFound('definition_not_found', 'BPMN definition not found');
    return NextResponse.json({ definition });
  },
);
''',

    "src/app/api/bpmn/definitions/[id]/publish/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { publishBpmnDefinition } from '@/lib/bpmn/bpmn-engine';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const definition = await publishBpmnDefinition(params!.id, ctx.targetTenantId, ctx.userId);
    return NextResponse.json({ definition });
  },
);
''',

    "src/app/api/bpmn/definitions/[id]/instances/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { startBpmnInstance } from '@/lib/bpmn/bpmn-engine';
import { db } from '@/lib/db';

const startSchema = z.object({ documentId: z.string().optional() });

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx, params) => {
    const instances = await db.bpmnProcessInstance.findMany({
      where: { definitionId: params!.id, tenantId: ctx.targetTenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items: instances, total: instances.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_INSTANCE_MANAGE },
  async (req, ctx, params) => {
    const body = startSchema.parse(await req.json());
    const instance = await startBpmnInstance(params!.id, ctx.targetTenantId, body.documentId, ctx.userId);
    return NextResponse.json({ instance }, { status: 201 });
  },
);
''',

    "src/app/api/bpmn/definitions/template/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { getDefaultBpmnTemplate } from '@/lib/bpmn/bpmn-engine';

const schema = z.object({
  processKey: z.string().min(2),
  name: z.string().min(3),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.BPMN_DESIGN_VIEW },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const xml = getDefaultBpmnTemplate(body.processKey, body.name);
    return NextResponse.json({ xml });
  },
);
''',

    # =========================================================================
    # FEATURE 4: DoD 5015.02 RECORDS MANAGEMENT
    # =========================================================================
    "src/app/api/records/categories/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createRecordCategory, DOD_REQUIREMENTS } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  parentId: z.string().optional(),
  disposition: z.enum(['permanent', 'temporary', 'unscheduled']).default('temporary'),
  retentionActiveYears: z.number().min(0).optional(),
  retentionSemiActiveYears: z.number().min(0).optional(),
  dispositionAction: z.enum(['destroy', 'transfer_to_nara', 'transfer_to_agency']).optional(),
  isVital: z.boolean().default(false),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx) => {
    const categories = await db.recordCategory.findMany({
      where: { tenantId: ctx.targetTenantId },
      include: { folders: { select: { id: true, title: true, status: true } } },
      orderBy: { code: 'asc' },
    });
    return NextResponse.json({ items: categories, total: categories.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const category = await createRecordCategory({ tenantId: ctx.targetTenantId, ...body, approvedBy: ctx.userId });
    return NextResponse.json({ category }, { status: 201 });
  },
);

export const OPTIONS = async () => {
  return NextResponse.json({ requirements: DOD_REQUIREMENTS });
};
''',

    "src/app/api/records/categories/tree/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getRecordCategoryTree } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx) => {
    const tree = await getRecordCategoryTree(ctx.targetTenantId);
    return NextResponse.json({ tree });
  },
);
''',

    "src/app/api/records/categories/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    const category = await db.recordCategory.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { folders: true, children: true },
    });
    if (!category) throw ApiError.notFound('category_not_found', 'Record category not found');
    return NextResponse.json({ category });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const category = await db.recordCategory.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ category });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_CATEGORY_MANAGE },
  async (req, ctx, params) => {
    await db.recordCategory.delete({ where: { id: params!.id } });
    return NextResponse.json({ deleted: true });
  },
);
''',

    "src/app/api/records/folders/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createRecordFolder } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const createSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  fiscalYear: z.string().optional(),
  dateRangeStart: z.string().datetime().optional(),
  dateRangeEnd: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const categoryId = url.searchParams.get('categoryId');

    const where: Record<string, unknown> = { tenantId: ctx.targetTenantId };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    const folders = await db.recordFolder.findMany({
      where,
      include: { category: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items: folders, total: folders.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = createSchema.parse(await req.json());
    const folder = await createRecordFolder({
      tenantId: ctx.targetTenantId,
      ...body,
      dateRangeStart: body.dateRangeStart ? new Date(body.dateRangeStart) : undefined,
      dateRangeEnd: body.dateRangeEnd ? new Date(body.dateRangeEnd) : undefined,
    });
    return NextResponse.json({ folder }, { status: 201 });
  },
);
''',

    "src/app/api/records/folders/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx, params) => {
    const folder = await db.recordFolder.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { category: true },
    });
    if (!folder) throw ApiError.notFound('folder_not_found', 'Record folder not found');
    return NextResponse.json({ folder });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const folder = await db.recordFolder.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ folder });
  },
);
''',

    "src/app/api/records/folders/[id]/cutoff/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { cutoffFolder } from '@/lib/records/records-management';

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_FOLDER_MANAGE, requireStepUp: true },
  async (req, ctx, params) => {
    const folder = await cutoffFolder(params!.id, ctx.targetTenantId, ctx.userId);
    return NextResponse.json({ folder });
  },
);
''',

    "src/app/api/records/folders/[id]/dispose/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { disposeFolder } from '@/lib/records/records-management';

const schema = z.object({
  method: z.enum(['destroyed', 'transferred']),
  notes: z.string().optional(),
});

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_APPROVE, requireStepUp: true },
  async (req, ctx, params) => {
    const body = schema.parse(await req.json());
    const folder = await disposeFolder(params!.id, ctx.targetTenantId, ctx.userId, body.method, body.notes);
    return NextResponse.json({ folder });
  },
);
''',

    "src/app/api/records/vital/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { designateVitalRecord } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const schema = z.object({
  documentId: z.string().min(1),
  categoryId: z.string().optional(),
  vitalReason: z.enum(['operational', 'legal', 'financial', 'historical']).default('operational'),
  recordType: z.enum(['essential', 'important', 'useful']).default('important'),
  recoveryPriority: z.number().min(1).max(5).default(3),
  reviewCycleMonths: z.number().min(1).max(36).default(12),
  notes: z.string().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx) => {
    const records = await db.vitalRecord.findMany({
      where: { tenantId: ctx.targetTenantId },
      include: { document: { select: { id: true, title: true, state: true } } },
      orderBy: { nextReviewAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ items: records, total: records.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE, rateLimit: { max: 20, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const vital = await designateVitalRecord({ tenantId: ctx.targetTenantId, ...body, designatedBy: ctx.userId });
    return NextResponse.json({ vital }, { status: 201 });
  },
);
''',

    "src/app/api/records/vital/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { verifyVitalRecordBackup } from '@/lib/records/records-management';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx, params) => {
    const vital = await db.vitalRecord.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
      include: { document: true },
    });
    if (!vital) throw ApiError.notFound('vital_not_found', 'Vital record not found');
    return NextResponse.json({ vital });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    if (body.verifyBackup) {
      const vital = await verifyVitalRecordBackup(params!.id, ctx.targetTenantId, ctx.userId);
      return NextResponse.json({ vital });
    }
    const vital = await db.vitalRecord.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ vital });
  },
);
''',

    "src/app/api/records/vital/due-review/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getVitalRecordsDueForReview } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_VITAL_MANAGE },
  async (req, ctx) => {
    const records = await getVitalRecordsDueForReview(ctx.targetTenantId);
    return NextResponse.json({ items: records, total: records.length });
  },
);
''',

    "src/app/api/records/authorities/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import { createDispositionAuthority } from '@/lib/records/records-management';
import { db } from '@/lib/db';

const schema = z.object({
  authorityType: z.enum(['nara_grs', 'nara_sf', 'agency_specific', 'court_order']).default('agency_specific'),
  authorityNumber: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional(),
  authorityDocumentUrl: z.string().url().optional(),
  retentionInstructions: z.object({
    active: z.number().min(0).optional(),
    semiActive: z.number().min(0).optional(),
    disposition: z.enum(['destroy', 'transfer_to_nara', 'transfer_to_agency']).optional(),
  }).default({}),
  effectiveDate: z.string().datetime().optional(),
});

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx) => {
    const authorities = await db.dispositionAuthority.findMany({
      where: { tenantId: ctx.targetTenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items: authorities, total: authorities.length });
  },
);

export const POST = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE, rateLimit: { max: 10, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = schema.parse(await req.json());
    const authority = await createDispositionAuthority({
      tenantId: ctx.targetTenantId,
      ...body,
      effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
      approvedBy: ctx.userId,
    });
    return NextResponse.json({ authority }, { status: 201 });
  },
);
''',

    "src/app/api/records/authorities/[id]/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    const authority = await db.dispositionAuthority.findFirst({
      where: { id: params!.id, tenantId: ctx.targetTenantId },
    });
    if (!authority) throw ApiError.notFound('authority_not_found', 'Disposition authority not found');
    return NextResponse.json({ authority });
  },
);

export const PATCH = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    const body = await req.json();
    const authority = await db.dispositionAuthority.update({ where: { id: params!.id }, data: body });
    return NextResponse.json({ authority });
  },
);

export const DELETE = createApiHandler(
  { requiredPermission: PERMISSIONS.RECORD_DISPOSITION_AUTHORITY_MANAGE },
  async (req, ctx, params) => {
    await db.dispositionAuthority.update({ where: { id: params!.id }, data: { status: 'retired' } });
    return NextResponse.json({ retired: true });
  },
);
''',

    "src/app/api/records/compliance-report/route.ts": '''import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { generateComplianceReport } from '@/lib/records/records-management';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.SECURITY_AUDIT_READ },
  async (req, ctx) => {
    const report = await generateComplianceReport(ctx.targetTenantId);
    return NextResponse.json(report);
  },
);
''',
}

for filepath, content in ROUTES.items():
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  ✅ {filepath}")

print(f"\n✅ {len(ROUTES)} API routes created")
