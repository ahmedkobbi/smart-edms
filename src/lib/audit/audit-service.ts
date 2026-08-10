/**
 * Smart EDMS — Tamper-evident audit log service
 *
 * Each event is appended with:
 *   - monotonically increasing sequenceNum per tenant
 *   - prevHash = previous event's eventHash
 *   - eventHash = SHA-256(canonical event fields || prevHash)
 *
 * Verification: walk the chain in (tenantId, sequenceNum) order and recompute
 * eventHash for each row; any tampering breaks the chain.
 *
 * Audit events are append-only at the application layer (no UPDATE / DELETE
 * routes exist). DB-level immutability should be enforced by grants in prod.
 */

import { db } from '@/lib/db';
import { sha256 } from '@/lib/auth/crypto';

export interface AuditEventInput {
  tenantId: string;
  eventType: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorIp?: string | null;
  actorUserAgent?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  result?: 'allow' | 'deny' | 'error';
  reason?: string | null;
  correlationId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function canonicalize(input: AuditEventInput, sequenceNum: number, prevHash: string): string {
  const payload = {
    tenantId: input.tenantId,
    sequenceNum,
    eventType: input.eventType,
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorIp: input.actorIp ?? null,
    actorUserAgent: input.actorUserAgent ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    resourceName: input.resourceName ?? null,
    result: input.result ?? 'allow',
    reason: input.reason ?? null,
    correlationId: input.correlationId ?? null,
    sessionId: input.sessionId ?? null,
    metadata: input.metadata ?? {},
    prevHash,
  };
  // Stable key order — JSON.stringify with sorted keys
  return JSON.stringify(sortKeys(payload));
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    out[k] = sortKeys((obj as Record<string, unknown>)[k]);
  }
  return out;
}

function computeEventHash(input: AuditEventInput, sequenceNum: number, prevHash: string): string {
  const canonical = canonicalize(input, sequenceNum, prevHash);
  return sha256(canonical);
}

export async function recordAuditEvent(input: AuditEventInput): Promise<{ id: string; sequenceNum: number; eventHash: string }> {
  // Use a transaction to atomically read the latest sequence + write
  const result = await db.$transaction(async (tx) => {
    const latest = await tx.auditEvent.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { sequenceNum: 'desc' },
      select: { sequenceNum: true, eventHash: true },
    });
    const sequenceNum = (latest?.sequenceNum ?? 0) + 1;
    const prevHash = latest?.eventHash ?? '0'.repeat(64);
    const eventHash = computeEventHash(input, sequenceNum, prevHash);

    const created = await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        sequenceNum,
        eventType: input.eventType,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorIp: input.actorIp ?? null,
        actorUserAgent: input.actorUserAgent ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        resourceName: input.resourceName ?? null,
        result: input.result ?? 'allow',
        reason: input.reason ?? null,
        correlationId: input.correlationId ?? null,
        sessionId: input.sessionId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        prevHash,
        eventHash,
      },
    });

    return { id: created.id, sequenceNum, eventHash };
  });

  return result;
}

export interface AuditVerificationResult {
  ok: boolean;
  brokenAt?: { sequenceNum: number; expectedHash: string; actualHash: string };
  verifiedCount: number;
}

/**
 * Walk the audit chain for a tenant and verify every eventHash matches.
 */
export async function verifyAuditChain(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<AuditVerificationResult> {
  const events = await db.auditEvent.findMany({
    where: { tenantId },
    orderBy: { sequenceNum: 'asc' },
    take: opts.limit ?? 10_000,
    select: {
      sequenceNum: true,
      eventType: true,
      actorId: true,
      actorEmail: true,
      actorIp: true,
      actorUserAgent: true,
      action: true,
      resourceType: true,
      resourceId: true,
      resourceName: true,
      result: true,
      reason: true,
      correlationId: true,
      sessionId: true,
      metadata: true,
      prevHash: true,
      eventHash: true,
    },
  });

  let prevHash = '0'.repeat(64);
  let verifiedCount = 0;
  for (const ev of events) {
    const input: AuditEventInput = {
      tenantId,
      eventType: ev.eventType,
      actorId: ev.actorId,
      actorEmail: ev.actorEmail,
      actorIp: ev.actorIp,
      actorUserAgent: ev.actorUserAgent,
      action: ev.action,
      resourceType: ev.resourceType,
      resourceId: ev.resourceId,
      resourceName: ev.resourceName,
      result: ev.result as 'allow' | 'deny' | 'error',
      reason: ev.reason,
      correlationId: ev.correlationId,
      sessionId: ev.sessionId,
      metadata: JSON.parse(ev.metadata || '{}'),
    };
    const recomputed = computeEventHash(input, ev.sequenceNum, prevHash);
    if (recomputed !== ev.eventHash) {
      return {
        ok: false,
        brokenAt: { sequenceNum: ev.sequenceNum, expectedHash: recomputed, actualHash: ev.eventHash },
        verifiedCount,
      };
    }
    if (ev.prevHash !== prevHash) {
      return {
        ok: false,
        brokenAt: { sequenceNum: ev.sequenceNum, expectedHash: prevHash, actualHash: ev.prevHash },
        verifiedCount,
      };
    }
    prevHash = ev.eventHash;
    verifiedCount++;
  }
  return { ok: true, verifiedCount };
}
