# ADR-012: HMAC-signed URLs for file access

**Status:** Accepted

## Context

Document files are stored in object storage (S3 or local FS). Direct public access to storage is unacceptable. Options:
1. **Proxy all downloads through the app** — app reads file, streams to client
2. **Generate signed URLs** — client downloads directly from storage
3. **Pre-signed S3 URLs** — S3 generates time-limited URLs

## Decision

Use **HMAC-signed URLs** with short expiry (60 seconds):

### Local FS adapter
- App generates URL: `/api/storage/resolve?key=...&exp=...&sig=...`
- `sig = HMAC-SHA256(key|exp|filename, NEXTAUTH_SECRET)`
- The `/api/storage/resolve` endpoint verifies signature + expiry, then streams the file (decrypting with DEK if needed)

### S3 adapter
- App generates S3 presigned URL using `@aws-sdk/s3-request-presigner`
- Client downloads directly from S3 (no app proxy needed)
- Decryption must happen client-side or via a proxy (S3 adapter doesn't decrypt)

## Consequences

### Positive
- Short expiry (60s) limits window of URL sharing
- HMAC signature prevents tampering with key/expiry/filename
- Local adapter handles decryption transparently
- S3 adapter offloads bandwidth from app server

### Negative
- 60-second window still allows URL sharing within that window (mitigated by audit logging)
- Local adapter adds latency (app reads + decrypts + streams)
- S3 adapter doesn't decrypt — files stored encrypted, client must have DEK (future work)

## Security measures
- URLs are audit-logged on generation AND access
- View count tracked for shares
- HS/Restricted classifications require admin permission for download
- Watermark text embedded in URL metadata

## Alternatives considered

- **Always proxy through app**: Maximum control, but app server becomes bandwidth bottleneck
- **Long-lived presigned URLs**: Convenient, but URL leakage is catastrophic
- **Client-side decryption**: Most secure, but requires shipping DEK to client (complex key management)
