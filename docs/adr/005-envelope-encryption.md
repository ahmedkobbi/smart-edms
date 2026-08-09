# ADR-005: Per-document envelope encryption

**Status:** Accepted

## Context

Document content must be encrypted at rest. Options:
1. **Server-side storage encryption** (S3 SSE, disk encryption) — protects against physical theft only
2. **Application-level encryption** — protects against DB/storage compromise
3. **Per-document encryption** — enables per-document key rotation and crypto-shredding

## Decision

Use **envelope encryption**:
- Each document gets its own **Data Encryption Key (DEK)** — AES-256-GCM
- DEKs are wrapped (encrypted) by the tenant **Key Encryption Key (KEK)**
- The KEK is loaded from environment (`SMART_EDMS_KEK`) or KMS in production
- File content is encrypted with the DEK before storage

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  KEK    │────▶│ wrap(DEK)│────▶│ Database │
│ (env)   │     └──────────┘     └──────────┘
└─────────┘           │
                      ▼
┌─────────┐     ┌──────────┐     ┌──────────┐
│  DEK    │────▶│ encrypt( │────▶│ Storage  │
│ (random)│     │ content) │     │ (S3/FS)  │
└─────────┘     └──────────┘     └──────────┘
```

## Consequences

### Positive
- **Crypto-shredding**: Delete the DEK → content is permanently unrecoverable
- **Key rotation**: Re-wrap DEKs with new KEK without re-encrypting content
- **Least privilege**: KEK never leaves KMS/secure storage
- **Per-document granularity**: Compromise of one DEK doesn't affect others

### Negative
- Extra DB write per document (DEK storage)
- Two decryption operations per file access (unwrap DEK + decrypt content)
- KEK management is critical — if lost, ALL documents are unrecoverable

## KEK Management

- **Dev**: Auto-generated at `.kek` file (insecure — dev only)
- **Production**: Must be supplied via `SMART_EDMS_KEK` env var (32 bytes hex)
- **Future**: Integrate with AWS KMS / HashiCorp Vault for KEK storage

## Alternatives considered

- **S3 SSE-S3 only**: Simpler, but doesn't protect against storage credential compromise
- **Single application-wide key**: Faster, but no crypto-shredding or per-doc rotation
- **Client-side encryption**: Most secure, but breaks server-side processing (OCR, redaction)
