import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateLicenseKey } from '@/lib/license-signing';
import { z } from 'zod';

const prisma = new PrismaClient();

const createSchema = z.object({
  customerId: z.string().min(1),
  tenantId: z.string().min(1),
  tenantName: z.string().min(1),
  plan: z.string().default('enterprise'),
  seats: z.number().min(1).default(25),
  storageGb: z.number().min(1).default(5),
  features: z.array(z.string()).default(['records_management', 'signatures', 'bpmn_designer', 'security_audit']),
  expiresAt: z.string().datetime(),
  gracePeriodDays: z.number().min(0).max(365).default(30),
  issuedBy: z.string().default('admin'),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const customerId = url.searchParams.get('customerId');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;

  const licenses = await prisma.license.findMany({
    where,
    include: { customer: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ items: licenses, total: licenses.length });
}

export async function POST(req: NextRequest) {
  const body = createSchema.parse(await req.json());

  // Verify the customer exists
  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) {
    return NextResponse.json({ error: { code: 'customer_not_found', message: 'Customer not found' } }, { status: 404 });
  }

  // Generate the license key with Ed25519 signing
  const { licenseKey, payload, signature } = generateLicenseKey({
    tenantId: body.tenantId,
    tenantName: body.tenantName,
    plan: body.plan,
    seats: body.seats,
    storageBytes: BigInt(body.storageGb * 1024 * 1024 * 1024),
    features: body.features,
    expiresAt: new Date(body.expiresAt),
    gracePeriodDays: body.gracePeriodDays,
    issuedBy: body.issuedBy,
  });

  // Store in the registry
  const license = await prisma.license.create({
    data: {
      customerId: body.customerId,
      licenseKey,
      tenantId: body.tenantId,
      tenantName: body.tenantName,
      plan: body.plan,
      seats: body.seats,
      storageBytes: BigInt(body.storageGb * 1024 * 1024 * 1024),
      features: JSON.stringify(body.features),
      expiresAt: new Date(body.expiresAt),
      gracePeriodDays: body.gracePeriodDays,
      status: 'active',
      signature,
      nonce: payload.nonce,
      issuedBy: body.issuedBy,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'license.issued',
      resourceType: 'license',
      resourceId: license.id,
      details: JSON.stringify({ tenantName: body.tenantName, plan: body.plan, seats: body.seats, expiresAt: body.expiresAt }),
    },
  });

  return NextResponse.json({ license, licenseKey }, { status: 201 });
}
