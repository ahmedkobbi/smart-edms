import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { licenses: true, heartbeats: true } },
      licenses: { select: { id: true, status: true, expiresAt: true, tenantName: true }, take: 5, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ items: customers, total: customers.length });
}

export async function POST(req: NextRequest) {
  const body = createSchema.parse(await req.json());

  const existing = await prisma.customer.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: { code: 'exists', message: 'Customer with this email already exists' } }, { status: 409 });
  }

  const customer = await prisma.customer.create({
    data: { ...body, email: body.email.toLowerCase() },
  });

  await prisma.auditLog.create({
    data: {
      action: 'customer.created',
      resourceType: 'customer',
      resourceId: customer.id,
      details: JSON.stringify({ name: body.name, email: body.email }),
    },
  });

  return NextResponse.json({ customer }, { status: 201 });
}
