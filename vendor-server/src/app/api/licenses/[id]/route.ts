import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, country: true } },
      heartbeats: { orderBy: { receivedAt: 'desc' }, take: 30 },
      _count: { select: { heartbeats: true, payments: true } },
    },
  });

  if (!license) {
    return NextResponse.json({ error: { code: 'not_found', message: 'License not found' } }, { status: 404 });
  }

  return NextResponse.json({ license });
}
