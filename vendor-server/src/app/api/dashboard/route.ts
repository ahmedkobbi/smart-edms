import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    activeCustomers,
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    revokedLicenses,
    expiringLicenses,
    recentHeartbeats,
    recentLicenses,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'active' } }),
    prisma.license.count(),
    prisma.license.count({ where: { status: 'active' } }),
    prisma.license.count({ where: { status: 'expired' } }),
    prisma.license.count({ where: { status: 'revoked' } }),
    prisma.license.count({
      where: {
        status: 'active',
        expiresAt: { lte: thirtyDaysFromNow, gte: now },
      },
    }),
    prisma.heartbeat.findMany({
      where: { receivedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      include: {
        license: { select: { tenantName: true, status: true } },
        customer: { select: { name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
    prisma.license.findMany({
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalCustomers,
      activeCustomers,
      totalLicenses,
      activeLicenses,
      expiredLicenses,
      revokedLicenses,
      expiringLicenses,
      heartbeats24h: recentHeartbeats.length,
    },
    recentHeartbeats,
    recentLicenses,
  });
}
