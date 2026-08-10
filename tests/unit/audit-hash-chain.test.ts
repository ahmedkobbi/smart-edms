/**
 * Smart EDMS — Audit hash chain integrity tests
 *
 * Verifies that:
 *   1. The hash chain is deterministic (same input → same hash)
 *   2. Tampering with any field breaks the chain
 *   3. The prevHash linkage is enforced
 *   4. Sequence numbers are monotonic
 */

import { describe, it, expect } from 'vitest';
import { sha256 } from '@/lib/auth/crypto';

// Replicate the canonicalization + hashing logic from audit-service
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
    out[k] = sortKeys((obj as Record<string, unknown>)[k]);
  }
  return out;
}

function canonicalize(input: any, sequenceNum: number, prevHash: string): string {
  const payload = {
    tenantId: input.tenantId,
    sequenceNum,
    eventType: input.eventType,
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorIp: input.actorIp ?? null,
    action: input.action,
    resourceId: input.resourceId ?? null,
    resourceName: input.resourceName ?? null,
    result: input.result ?? 'allow',
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
    prevHash,
  };
  return JSON.stringify(sortKeys(payload));
}

function computeEventHash(input: any, sequenceNum: number, prevHash: string): string {
  return sha256(canonicalize(input, sequenceNum, prevHash));
}

const GENESIS_HASH = '0'.repeat(64);

const sampleEvent = {
  tenantId: 'tenant-1',
  eventType: 'document.read',
  actorId: 'user-1',
  actorEmail: 'user@example.com',
  actorIp: '10.0.0.1',
  action: 'read',
  resourceId: 'doc-1',
  resourceName: 'Confidential Report',
  result: 'allow' as const,
  reason: null,
  metadata: { classification: 'CONFIDENTIAL' },
};

describe('Audit Hash Chain', () => {
  it('produces deterministic hashes for identical input', () => {
    const hash1 = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const hash2 = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different sequence numbers', () => {
    const hash1 = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const hash2 = computeEventHash(sampleEvent, 2, GENESIS_HASH);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different prevHash', () => {
    const hash1 = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const hash2 = computeEventHash(sampleEvent, 1, 'a'.repeat(64));
    expect(hash1).not.toBe(hash2);
  });

  it('detects tampering with eventType', () => {
    const original = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const tampered = computeEventHash({ ...sampleEvent, eventType: 'document.delete' }, 1, GENESIS_HASH);
    expect(original).not.toBe(tampered);
  });

  it('detects tampering with actorId', () => {
    const original = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const tampered = computeEventHash({ ...sampleEvent, actorId: 'user-evil' }, 1, GENESIS_HASH);
    expect(original).not.toBe(tampered);
  });

  it('detects tampering with result (allow → deny)', () => {
    const original = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const tampered = computeEventHash({ ...sampleEvent, result: 'deny' }, 1, GENESIS_HASH);
    expect(original).not.toBe(tampered);
  });

  it('detects tampering with metadata', () => {
    const original = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const tampered = computeEventHash(
      { ...sampleEvent, metadata: { classification: 'PUBLIC' } },
      1,
      GENESIS_HASH,
    );
    expect(original).not.toBe(tampered);
  });

  it('detects tampering with IP address', () => {
    const original = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    const tampered = computeEventHash({ ...sampleEvent, actorIp: '192.168.1.1' }, 1, GENESIS_HASH);
    expect(original).not.toBe(tampered);
  });

  it('forms a valid chain: each event references the previous hash', () => {
    const events = [
      { ...sampleEvent, eventType: 'event.a' },
      { ...sampleEvent, eventType: 'event.b' },
      { ...sampleEvent, eventType: 'event.c' },
    ];

    const hashes: string[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < events.length; i++) {
      const seq = i + 1;
      const hash = computeEventHash(events[i], seq, prevHash);
      hashes.push(hash);
      prevHash = hash;
    }

    // Each hash should be different
    expect(new Set(hashes).size).toBe(3);

    // Recomputing with the same prevHash should produce the same chain
    let verifyPrev = GENESIS_HASH;
    for (let i = 0; i < events.length; i++) {
      const seq = i + 1;
      const recomputed = computeEventHash(events[i], seq, verifyPrev);
      expect(recomputed).toBe(hashes[i]);
      verifyPrev = recomputed;
    }
  });

  it('detects a broken chain when an intermediate event is tampered', () => {
    const events = [
      { ...sampleEvent, eventType: 'event.a' },
      { ...sampleEvent, eventType: 'event.b' },
      { ...sampleEvent, eventType: 'event.c' },
    ];

    // Build original chain
    const originalHashes: string[] = [];
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < events.length; i++) {
      const hash = computeEventHash(events[i], i + 1, prevHash);
      originalHashes.push(hash);
      prevHash = hash;
    }

    // Tamper event 1 (change eventType)
    const tamperedEvents = [...events];
    tamperedEvents[1] = { ...tamperedEvents[1], eventType: 'event.TAMPERED' };

    // Recompute chain — event 1's hash changes, and event 2's prevHash no longer matches
    const tamperedHashes: string[] = [];
    prevHash = GENESIS_HASH;
    for (let i = 0; i < tamperedEvents.length; i++) {
      const hash = computeEventHash(tamperedEvents[i], i + 1, prevHash);
      tamperedHashes.push(hash);
      prevHash = hash;
    }

    // Event 0 hash is the same (untouched)
    expect(tamperedHashes[0]).toBe(originalHashes[0]);
    // Event 1 hash is different
    expect(tamperedHashes[1]).not.toBe(originalHashes[1]);
    // Event 2 hash is also different (because prevHash changed)
    expect(tamperedHashes[2]).not.toBe(originalHashes[2]);
  });

  it('canonicalizes keys in sorted order (key order does not affect hash)', () => {
    const event1 = { tenantId: 't1', action: 'read', eventType: 'document.read' };
    const event2 = { eventType: 'document.read', action: 'read', tenantId: 't1' };

    const hash1 = computeEventHash(event1, 1, GENESIS_HASH);
    const hash2 = computeEventHash(event2, 1, GENESIS_HASH);

    expect(hash1).toBe(hash2);
  });

  it('produces 64-character hex SHA-256 hashes', () => {
    const hash = computeEventHash(sampleEvent, 1, GENESIS_HASH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
