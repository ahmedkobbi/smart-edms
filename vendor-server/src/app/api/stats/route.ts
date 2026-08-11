import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Revenue from completed payments
  const payments = await prisma.payment.findMany({
    where: { status: 'completed', createdAt: { gte: twelveMonthsAgo } },
    select: { amountUsd: true, createdAt: true, plan: true },
  });

  const totalRevenue = payments.reduce((sum, p) => sum + p.amountUsd, 0);
  const monthlyRevenue = payments
    .filter(p => p.createdAt >= thirtyDaysAgo)
    .reduce((sum, p) => sum + p.amountUsd, 0);

  // Monthly revenue chart data (last 12 months)
  const monthlyData: { month: string; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthRevenue = payments
      .filter(p => p.createdAt >= monthStart && p.createdAt < monthEnd)
      .reduce((sum, p) => sum + p.amountUsd, 0);
    monthlyData.push({
      month: monthStart.toLocaleString('default', { month: 'short' }),
      revenue: Math.round(monthRevenue * 100) / 100,
    });
  }

  // License distribution by plan
  const licenses = await prisma.license.groupBy({
    by: ['plan'],
    _count: { plan: true },
    where: { status: 'active' },
  });

  // Expiring licenses (next 30 days)
  const expiring = await prisma.license.findMany({
    where: {
      status: 'active',
      expiresAt: { lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), gte: now },
    },
    include: { customer: { select: { name: true, email: true } } },
    orderBy: { expiresAt: 'asc' },
  });

  // Heartbeat stats (last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const heartbeats = await prisma.heartbeat.findMany({
    where: { receivedAt: { gte: sevenDaysAgo } },
    select: { receivedAt: true, licenseStatus: true },
  });

  const dailyHeartbeats: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const count = heartbeats.filter(h => h.receivedAt >= dayStart && h.receivedAt < dayEnd).length;
    dailyHeartbeats.push({
      day: dayStart.toLocaleString('default', { weekday: 'short' }),
      count,
    });
  }

  return NextResponse.json({
    revenue: {
      total: Math.round(totalRevenue * 100) / 100,
      monthly: Math.round(monthlyRevenue * 100) / 100,
      chart: monthlyData,
    },
    licenses: {
      byPlan: licenses.map(l => ({ plan: l.plan, count: l._count.plan })),
      expiring,
    },
    heartbeats: {
      chart: dailyHeartbeats,
      total7d: heartbeats.length,
    },
  });
}
