import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'suspended', 'churned']).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      licenses: { orderBy: { createdAt: 'desc' } },
      heartbeats: { orderBy: { receivedAt: 'desc' }, take: 50 },
      _count: { select: { licenses: true, heartbeats: true, payments: true } },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Customer not found' } }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = patchSchema.parse(await req.json());

  const customer = await prisma.customer.update({
    where: { id },
    data: body,
  });

  await prisma.auditLog.create({
    data: {
      action: 'customer.updated',
      resourceType: 'customer',
      resourceId: id,
      details: JSON.stringify(body),
    },
  });

  return NextResponse.json({ customer });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.customer.update({
    where: { id },
    data: { status: 'churned' },
  });

  await prisma.auditLog.create({
    data: {
      action: 'customer.churned',
      resourceType: 'customer',
      resourceId: id,
    },
  });

  return NextResponse.json({ ok: true });
}
