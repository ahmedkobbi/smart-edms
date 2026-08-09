/**
 * Smart EDMS — Audit receipts (signed periodic snapshots)
 *
 * POST /api/admin/audit-receipts                 generate receipt for last 24h
 * GET  /api/admin/audit-receipts                 list receipts
 * GET  /api/admin/audit-receipts/:id             verify a receipt
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler, ApiError } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { sha256 } from '@/lib/auth/crypto';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { z } from 'zod';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.AUDIT_READ },
  async (req: NextRequest, ctx) => {
    const items = await db.auditReceipt.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { periodEnd: 'desc' },
      take: 50,
    });
    return NextResponse.json({ items });
  },
);

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.AUDIT_EXPORT,
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: { eventType: 'audit.receipt.generate', action: 'create', resourceType: 'audit-receipt', alwaysAudit: true },
  },
  async (req: NextRequest, ctx) => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 24 * 3600_1000);

    const events = await db.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { sequenceNum: 'asc' },
      select: { sequenceNum: true, eventHash: true, eventType: true, result: true },
    });

    if (events.length === 0) {
      throw ApiError.badRequest('no_events', 'No audit events in the last 24h');
    }

    const lastEvent = events[events.length - 1];
    const summary = {
      tenantId: ctx.tenantId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      eventCount: events.length,
      lastSequenceNum: lastEvent.sequenceNum,
      lastEventHash: lastEvent.eventHash,
      eventTypes: events.reduce((acc, e) => {
        acc[e.eventType] = (acc[e.eventType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      results: events.reduce((acc, e) => {
        acc[e.result] = (acc[e.result] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    const receiptHash = sha256(JSON.stringify(summary));
    const receiptKey = process.env.NEXTAUTH_SECRET || 'dev-only-secret';
    const signature = sha256(receiptHash + receiptKey + ctx.tenantId);

    const receipt = await db.auditReceipt.create({
      data: {
        tenantId: ctx.tenantId,
        periodStart,
        periodEnd,
        eventCount: events.length,
        lastSequenceNum: lastEvent.sequenceNum,
        lastEventHash: lastEvent.eventHash,
        receiptHash,
        signature,
      },
    });

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'audit.receipt.generated',
      action: 'create',
      resourceType: 'audit-receipt',
      resourceId: receipt.id,
      result: 'allow',
      metadata: { periodStart, periodEnd, eventCount: events.length, receiptHash },
    });

    return NextResponse.json({ receipt, summary }, { status: 201 });
  },
);
