import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(['admin', 'superadmin']).default('admin'),
});

export async function GET() {
  const users = await prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ items: users, total: users.length });
}

export async function POST(req: NextRequest) {
  const body = createSchema.parse(await req.json());

  const existing = await prisma.adminUser.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: { code: 'exists', message: 'Admin user already exists' } }, { status: 409 });
  }

  const passwordHash = await hash(body.password, 12);
  const user = await prisma.adminUser.create({
    data: { email: body.email.toLowerCase(), name: body.name, passwordHash, role: body.role },
  });

  await prisma.auditLog.create({
    data: { action: 'admin.user_created', resourceType: 'admin_user', resourceId: user.id, details: JSON.stringify({ email: body.email, role: body.role }) },
  });

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }, { status: 201 });
}
