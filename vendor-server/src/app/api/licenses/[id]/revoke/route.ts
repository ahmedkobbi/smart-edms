import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Revoke a license — the next heartbeat from the on-prem server will
// propagate the revocation, locking the deployment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const reason = body.reason || 'Revoked by vendor';

  const license = await prisma.license.findUnique({ where: { id } });
  if (!license) {
    return NextResponse.json({ error: { code: 'not_found', message: 'License not found' } }, { status: 404 });
  }

  if (license.status === 'revoked') {
    return NextResponse.json({ error: { code: 'already_revoked', message: 'License is already revoked' } }, { status: 409 });
  }

  const updated = await prisma.license.update({
    where: { id },
    data: {
      status: 'revoked',
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'license.revoked',
      resourceType: 'license',
      resourceId: id,
      details: JSON.stringify({ reason, tenantName: license.tenantName }),
    },
  });

  return NextResponse.json({ license: updated });
}
