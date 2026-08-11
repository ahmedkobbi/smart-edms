# E-Signature Integration (DocuSign / Adobe Sign)

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

## Overview

Smart EDMS integrates with **DocuSign** (primary) and **Adobe Sign** (fallback)
for legally binding electronic signatures. A unified API abstracts both
providers, with an "internal" fallback for non-configured deployments.

## Features

### Provider abstraction
- `docusign` — full JWT auth, envelope creation, signing URLs, webhook events
- `adobe_sign` — OAuth client credentials, agreement creation
- `internal` — in-app signing page (for testing / non-configured deployments)

### Security
- **No API keys exposed to client** — all calls server-side
- **HMAC-SHA256 webhook verification** (timing-safe comparison)
- **SSRF DNS pinning** on all outbound provider API calls (undici)
- **Step-up auth** required for voiding signature requests
- **Hash-chained audit trail** for every signature event

### Webhook processing
- DocuSign webhooks verified via `DOCUSIGN_WEBHOOK_SECRET`
- Events mapped to internal status: `sent` → `delivered` → `completed` / `declined` / `voided`
- All webhook payloads stored in `SignatureEnvelope` for replay protection
- Initiator notified on completion

## Configuration

### DocuSign

```env
DOCUSIGN_INTEGRATION_KEY=       # From https://admindemo.docusign.com/api-and-integrations
DOCUSIGN_USER_ID=               # Your DocuSign user ID
DOCUSIGN_ACCOUNT_ID=            # Your DocuSign account ID
DOCUSIGN_ACCOUNT_BASE_URL=      # e.g., https://demo.docusign.net
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY=           # RSA private key (multi-line, \n escaped)
DOCUSIGN_WEBHOOK_SECRET=        # HMAC secret for webhook verification
```

### Adobe Sign

```env
ADOBE_SIGN_CLIENT_ID=
ADOBE_SIGN_CLIENT_SECRET=
ADOBE_SIGN_API_BASE=            # e.g., https://api.na1.adobesign.com
```

## API Endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `GET` | `/api/signatures` | `signature:read` | List signature requests |
| `POST` | `/api/signatures` | `signature:create` | Create signature request |
| `GET` | `/api/signatures/:id` | `signature:read` | Get signature request |
| `POST` | `/api/signatures/:id/void` | `signature:void` | Void request (step-up auth) |
| `POST` | `/api/signatures/:id/signing-url` | `signature:read` | Get signing URL for recipient |
| `POST` | `/api/signatures/webhooks/docusign` | — | DocuSign webhook (HMAC verified) |

## UI

- **Admin → E-Signatures** — request list with status badges and void action
- **Create form** — select document, add recipients (name + email + role), set expiry

## See Also

- [ADR-018: E-Signature Integration](./adr/018-e-signature-integration.md)
