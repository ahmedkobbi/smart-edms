import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { signToken, setSessionCookie } from '@/lib/auth';
import { z } from 'zod';
import { compare } from 'bcryptjs';

const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = loginSchema.parse(await req.json());

  const admin = await prisma.adminUser.findUnique({
    where: { email: body.email.toLowerCase() },
  });

  if (!admin) {
    return NextResponse.json({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } }, { status: 401 });
  }

  const valid = await compare(body.password, admin.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } }, { status: 401 });
  }

  const token = await signToken({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  await setSessionCookie(token);

  return NextResponse.json({ user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
}
