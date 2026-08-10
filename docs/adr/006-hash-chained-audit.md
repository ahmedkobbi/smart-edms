# ADR-006: SHA-256 hash-chained audit log

**Status:** Accepted

## Context

The audit log must be:
- **Tamper-evident**: Any modification is detectable
- **Append-only**: No UPDATE or DELETE operations
- **Verifiable**: Third parties can confirm integrity
- **Performant**: Must handle high write volume

## Decision

Implement a **per-tenant SHA-256 hash chain**:

Each audit event stores:
- `sequenceNum`: Monotonic per-tenant counter
- `prevHash`: SHA-256 hash of the previous event
- `eventHash`: SHA-256 of `canonical(event_fields || prevHash)`

```
Event #1: hash₁ = SHA256(event₁ || 0×64)
Event #2: hash₂ = SHA256(event₂ || hash₁)
Event #3: hash₃ = SHA256(event₃ || hash₂)
...
```

Verification: walk the chain, recompute each hash, compare with stored value. Any tampering breaks the chain.

## Consequences

### Positive
- Tampering with any field (actor, action, timestamp, metadata) breaks the chain
- Per-tenant chains are independent — no global bottleneck
- No external dependency (no blockchain, no Merkle tree service)
- Verifiable by auditors with a single SQL query + hash recomputation
- Signed receipts (HMAC) provide periodic integrity snapshots

### Negative
- Sequential write pattern (each event needs the previous hash) — limits parallel writes
- No deletion possible (even for GDPR right-to-be-forgotten) — must redact PII at write time
- Hash chain doesn't prevent deletion of entire events — requires append-only DB constraints

## Mitigations

- **Append-only enforcement**: Application layer never issues UPDATE/DELETE on AuditEvent. Production should add DB-level triggers.
- **Signed receipts**: Daily HMAC-signed snapshots of the chain tip provide a checkpoint.
- **Audit-aware logging**: PII is masked before writing to audit metadata.

## Alternatives considered

- **Blockchain (private)**: Decentralized tamper-evidence, but massive overhead
- **Merkle tree**: Efficient verification, but complex to implement and update
- **Append-only table with no chaining**: Simpler, but can't detect reordering
- **Signed individual events**: Each event signed, but can't detect deletion
