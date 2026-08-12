import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ items: logs, total: logs.length });
}
