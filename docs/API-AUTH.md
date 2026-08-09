# Smart EDMS — API Authentication & Authorization Guide

## Authentication Methods

### 1. Session Cookie (Browser)

Used by the web UI. After login via `/api/auth/signin`, a JWT session cookie (`smart_edms_session`) is set automatically.

```bash
# Login
curl -c cookies.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=admin@smartedms.local&password=ChangeMe!2025"

# Use session cookie for subsequent requests
curl -b cookies.txt http://localhost:3000/api/documents
```

### 2. API Key (Programmatic)

For integrations and automation. Create via Admin → API Keys.

```bash
# Create API key (returns raw key ONCE)
curl -b cookies.txt -X POST http://localhost:3000/api/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name":"CI/CD","scopes":["document:read","document:download"]}'

# Response: { "key": "se_abc123...", "warning": "Store securely..." }

# Use API key
curl -H "Authorization: Bearer se_abc123..." http://localhost:3000/api/documents
```

### 3. Service Account (Automation)

For non-human identities (CI/CD, integrations, bots). Create via Admin → Service Accounts.

```bash
# Create service account
curl -b cookies.txt -X POST http://localhost:3000/api/admin/service-accounts \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-runner","scopes":["document:create","document:read"]}'

# Use service account key
curl -H "Authorization: Bearer sa_xyz789..." http://localhost:3000/api/documents
```

---

## Authorization Model

### Permission Format

Permissions follow `domain:action` format:

```
document:create    document:read    document:delete
admin:users.manage  admin:roles.manage
audit:read         audit:export     audit:verify
```

### Wildcards

- `document:*` — matches all document actions
- `*` — matches everything (use with caution)

### System Roles

| Role | Key Permissions |
|------|-----------------|
| `tenant_admin` | All permissions |
| `records_manager` | Retention, legal hold, record declaration |
| `security_officer` | Classifications, policies, audit verify |
| `compliance_auditor` | Read-only audit + export |
| `end_user` | Own document CRUD, search, share |
| `viewer` | Read-only document access |

### ABAC Policies

Policies are evaluated alongside RBAC. Example policy:

```json
{
  "name": "deny-download-hs",
  "effect": "deny",
  "action": "document:download",
  "resource": "document:*",
  "conditions": { "classification": ["HS"], "requireRole": ["tenant_admin", "security_officer"] },
  "priority": 200
}
```

**Evaluation order**: highest priority first. Deny wins at same priority.

---

## Step-Up Authentication

Some actions require re-authentication even with a valid session:

1. **Request step-up token**: `POST /api/me/step-up` with TOTP or password
2. **Receive token**: Valid for 5 minutes
3. **Include in privileged requests**: `X-Step-Up-Token: <token>`

```bash
# Get step-up token
curl -b cookies.txt -X POST http://localhost:3000/api/me/step-up \
  -H "Content-Type: application/json" \
  -d '{"challenge":"totp","token":"123456"}'

# Response: { "token": "abc...", "expiresAt": "..." }

# Use step-up token
curl -b cookies.txt -H "X-Step-Up-Token: abc..." \
  -X POST http://localhost:3000/api/admin/break-glass \
  -d '{"reason":"Emergency access","justification":"..."}'
```

---

## Rate Limiting

All endpoints are rate-limited. Limits vary by endpoint type:

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Login | 10 per IP+email | 60s |
| General API | 100 per user | 60s |
| Upload | 30 per user | 60s |
| AI operations | 10-20 per user | 60s |
| Break-glass | 3 per user | 1 hour |

Rate-limited responses return `429` with `Retry-After` header.

---

## Error Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Missing permission: document:delete"
  }
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `unauthenticated` | 401 | No session |
| `forbidden` | 403 | Missing permission |
| `not_found` | 404 | Resource doesn't exist |
| `rate_limited` | 429 | Too many requests |
| `invalid_file` | 400 | File validation failed |
| `malware_detected` | 400 | File contained malware |
| `legal_hold_blocks_delete` | 403 | Document under legal hold |
| `internal_error` | 500 | Unexpected error |

---

## Audit Trail

Every API request is audit-logged with:

- Actor identity (user ID, email, IP, user agent)
- Action (HTTP method + resource type)
- Resource (ID, name)
- Result (allow / deny / error)
- Reason (for denies)
- Correlation ID (for tracing)
- Timestamp
- Hash chain linkage

Access the audit log:
```bash
# Search audit events
curl -b cookies.txt "http://localhost:3000/api/audit?eventType=document.read&result=deny"

# Verify chain integrity
curl -b cookies.txt http://localhost:3000/api/audit/verify

# Export as CSV
curl -b cookies.txt http://localhost:3000/api/audit/export -o audit.csv
```

---

## Webhooks

Configure outbound webhooks via Admin → Webhooks. Payloads are HMAC-signed:

```bash
# Verify webhook signature (recipient side)
signature=$(echo -n "$body" | openssl dgst -sha256 -hmac "$secret" | sed 's/.* //')

# Compare with X-Smart-EDMS-Signature header
if [ "$signature" = "$header_signature" ]; then
  echo "Valid"
fi
```

Webhook events:
- `document.created`, `document.updated`, `document.deleted`
- `share.created`, `share.viewed`, `share.revoked`
- `workflow.created`, `workflow.approved`, `workflow.rejected`
- `classification.changed`, `legalhold.created`, `legalhold.released`
- `audit.anomaly`, `user.created`, `user.suspended`
