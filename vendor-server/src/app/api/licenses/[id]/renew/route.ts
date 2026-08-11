import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateLicenseKey } from '@/lib/license-signing';

const prisma = new PrismaClient();

// Renew/replace a license — generates a new license key with updated expiry
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { expiresAt, seats, storageGb, gracePeriodDays } = body;

  const oldLicense = await prisma.license.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!oldLicense) {
    return NextResponse.json({ error: { code: 'not_found', message: 'License not found' } }, { status: 404 });
  }

  // Mark the old license as replaced
  await prisma.license.update({
    where: { id },
    data: { status: 'replaced' },
  });

  // Generate a new license with updated terms
  const { licenseKey, payload, signature } = generateLicenseKey({
    tenantId: oldLicense.tenantId,
    tenantName: oldLicense.tenantName,
    plan: oldLicense.plan,
    seats: seats || oldLicense.seats,
    storageBytes: storageGb ? BigInt(storageGb * 1024 * 1024 * 1024) : oldLicense.storageBytes,
    features: JSON.parse(oldLicense.features),
    expiresAt: new Date(expiresAt),
    gracePeriodDays: gracePeriodDays || oldLicense.gracePeriodDays,
    issuedBy: 'admin',
  });

  const newLicense = await prisma.license.create({
    data: {
      customerId: oldLicense.customerId,
      licenseKey,
      tenantId: oldLicense.tenantId,
      tenantName: oldLicense.tenantName,
      plan: oldLicense.plan,
      seats: seats || oldLicense.seats,
      storageBytes: storageGb ? BigInt(storageGb * 1024 * 1024 * 1024) : oldLicense.storageBytes,
      features: oldLicense.features,
      expiresAt: new Date(expiresAt),
      gracePeriodDays: gracePeriodDays || oldLicense.gracePeriodDays,
      status: 'active',
      signature,
      nonce: payload.nonce,
      issuedBy: 'admin',
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'license.renewed',
      resourceType: 'license',
      resourceId: newLicense.id,
      details: JSON.stringify({ oldLicenseId: id, expiresAt, seats: seats || oldLicense.seats }),
    },
  });

  return NextResponse.json({ license: newLicense, licenseKey }, { status: 201 });
}
