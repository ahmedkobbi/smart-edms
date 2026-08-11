# Smart EDMS — Operations Runbook

## 1. Secrets Management

### 1.1 Secrets Inventory

| Secret | Purpose | Min Length | Where to Rotate |
|--------|---------|------------|-----------------|
| `NEXTAUTH_SECRET` | JWT signing/encryption | 32 chars | Generate new → update env → restart → all sessions invalidated |
| `SMART_EDMS_KEK` | Tenant KEK for envelope encryption | 32 bytes (64 hex) | See KEK Rotation below |
| `CRON_SECRET` | Cron endpoint authentication | 32 chars | Generate new → update env + cron scheduler |
| `METRICS_TOKEN` | /api/metrics bearer token | 32 chars | Generate new → update env + Prometheus scraper config |
| `WS_INTERNAL_SECRET` | WS /notify authentication | 32 chars | Generate new → update env + WS service config |
| `STRIPE_SECRET_KEY` | Stripe API access | `sk_live_` or `sk_test_` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | `whsec_` | Stripe Dashboard → Developers → Webhooks |
| `NOWPAYMENTS_API_KEY` | NowPayments API access | 10+ chars | NowPayments Dashboard → Settings |
| `NOWPAYMENTS_IPN_SECRET` | NowPayments webhook verification | 10+ chars | NowPayments Dashboard → Settings |
| `REDIS_URL` | Redis connection | `redis://` or `rediss://` | Redis provider (rotate password) |
| `DATABASE_URL` | Database connection | `postgresql://` | Database provider (rotate password) |
| `SMTP_PASS` | Email delivery | — | Email provider (rotate credentials) |

### 1.2 Secret Generation

```bash
# General-purpose 32-char secrets (NEXTAUTH_SECRET, CRON_SECRET, METRICS_TOKEN, WS_INTERNAL_SECRET)
openssl rand -base64 32

# KEK (32 bytes hex)
openssl rand -hex 32

# UUID for idempotency keys (client-side)
python3 -c "import uuid; print(uuid.uuid4())"
```

### 1.3 KEK Rotation Procedure

Rotating `SMART_EDMS_KEK` requires re-wrapping every document DEK with the new KEK. This is a zero-downtime operation but should be performed during a maintenance window.

```bash
# 1. Set the NEW KEK as SMART_EDMS_KEK_NEW (keep the old one as SMART_EDMS_KEK)
export SMART_EDMS_KEK=<old-kek>
export SMART_EDMS_KEK_NEW=<new-kek>

# 2. Run the rotation script (re-wraps all DEKs)
npx bun run scripts/rotate-kek.ts

# 3. Verify: try downloading a document from each tenant
# 4. Update the env to use only the new KEK
export SMART_EDMS_KEK=<new-kek>
unset SMART_EDMS_KEK_NEW

# 5. Restart the application
# 6. Verify audit log: search for 'kek.rotated' events
```

### 1.4 NEXTAUTH_SECRET Rotation

Rotating `NEXTAUTH_SECRET` invalidates ALL active sessions (JWTs signed with the old secret can't be verified). All users must re-login.

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Update env
export NEXTAUTH_SECRET=$NEW_SECRET

# 3. Restart the application
# 4. Notify users: "All sessions have been invalidated for security. Please log in again."
# 5. Verify: check audit log for spike in 'auth.login' events
```

---

## 2. Redis Failover Runbook

### 2.1 What Happens When Redis Goes Down

When Redis becomes unavailable, the following systems degrade gracefully:

| System | Behavior | Impact |
|--------|----------|--------|
| **Rate limiting** | Falls back to in-memory (per-instance) | Multi-instance rate limits not enforced globally until Redis recovers. Each instance has its own bucket. |
| **Challenge stores** (SSO, MFA, passkey) | Falls back to in-memory (per-instance) | SSO/MFA/passkey flows fail 50% of the time on multi-instance deploys (load balancer may route callback to different instance than init). |
| **BullMQ job queues** (OCR, webhooks, evidence, reindex) | Jobs not processed | Background jobs stall. Documents not OCR'd, webhooks not delivered. Jobs already in Redis resume when Redis recovers. |
| **WebSocket notifications** | Polling fallback (client polls every 30s) | Real-time notifications delayed. |

### 2.2 Detection

- **Application logs**: `redis.disconnected`, `redis.error`, `rate_limiter.redis_unavailable_using_memory`, `challenge_store.using_memory` (when Redis was expected)
- **Health check**: `GET /api/health` → `checks.database.status` (PostgreSQL only; add Redis check if not present)
- **Metrics**: `smart_edms_uptime_seconds` — no Redis-specific metric yet (TODO: add `smart_edms_redis_connected` gauge)

### 2.3 Recovery Procedure

1. **Verify Redis is back**: `redis-cli -u $REDIS_URL ping` → should return `PONG`
2. **Application auto-recovers**: the rate limiter and challenge store re-check Redis availability every 30s. No restart needed.
3. **BullMQ auto-recovers**: ioredis reconnects automatically with exponential backoff (max 5s between retries).
4. **Verify**: check logs for `redis.connected` + `rate_limiter.using_redis` + `challenge_store.using_redis`
5. **If BullMQ didn't recover**: restart the worker process (`npm run worker`)

### 2.4 Manual Failover (if Redis is permanently lost)

If Redis data is lost (not just temporarily unavailable):

1. **Rate limits**: auto-rebuild as new requests come in. No action needed.
2. **Challenge stores**: auto-rebuild. In-flight SSO/MFA/passkey flows will fail — users must restart the flow.
3. **BullMQ jobs**: jobs in Redis are lost. Check the `Job` table in PostgreSQL for job records — failed jobs can be retried via `POST /api/admin/jobs/:id/retry`.
4. **Verify**: monitor for spike in `auth.login` failures (SSO users retrying).

---

## 3. Stripe Setup

### 3.1 Initial Configuration

1. **Create Stripe account**: https://dashboard.stripe.com/register
2. **Get API keys**: Dashboard → Developers → API Keys
   - `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` for sandbox)
3. **Create webhook endpoint**:
   - URL: `https://your-domain.com/api/billing/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the signing secret: `STRIPE_WEBHOOK_SECRET` = `whsec_...`
4. **Create products + prices** for each plan:
   - Dashboard → Products → Add product
   - Create monthly + annual prices for starter, business, enterprise
   - Copy price IDs: `STRIPE_PRICE_STARTER=price_...`, etc.
5. **Set env vars** and restart

### 3.2 Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local dev server
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger a test subscription
stripe trigger customer.subscription.created
```

### 3.3 Webhook Verification

Verify the webhook is receiving events:
1. Stripe Dashboard → Developers → Webhooks → click your endpoint
2. Check "Recent events" — should show `200 OK` responses
3. If `400 Invalid signature`: verify `STRIPE_WEBHOOK_SECRET` matches
4. If `503 Service Unavailable`: application not running or `STRIPE_WEBHOOK_SECRET` not set

---

## 4. NowPayments Setup

### 4.1 Initial Configuration

1. **Create NowPayments account**: https://account.nowpayments.io/
2. **Get API key**: Dashboard → Settings → API Keys
   - `NOWPAYMENTS_API_KEY` = your API key
3. **Get IPN secret**: Dashboard → Settings → IPN
   - `NOWPAYMENTS_IPN_SECRET` = your IPN secret
4. **Configure webhook URL**:
   - URL: `https://your-domain.com/api/billing/webhook/nowpayments`
   - The webhook is configured per-invoice (we pass it as `ipn_callback_url` in the API call)
5. **Get IP allowlist** (recommended):
   - Contact NowPayments support for current source IP ranges
   - Set `NOWPAYMENTS_ALLOWED_IPS=ip1,ip2,...`
6. **Set env vars** and restart

### 4.2 Testing

NowPayments provides a sandbox API at `https://api-sandbox.nowpayments.io/v1`:

```bash
# Set sandbox URL
export NOWPAYMENTS_API_BASE=https://api-sandbox.nowpayments.io/v1
export NOWPAYMENTS_API_KEY=<sandbox-key>
export NOWPAYMENTS_IPN_SECRET=<sandbox-secret>

# Create a test invoice via the checkout API
curl -X POST http://localhost:3000/api/billing/checkout \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"plan":"starter","billingCycle":"monthly","payCurrency":"btc","idempotencyKey":"test-uuid-1"}'
```

### 4.3 Webhook Verification

1. Check application logs for `nowpayments.webhook_received` events
2. If `nowpayments.webhook_signature_failed`: verify `NOWPAYMENTS_IPN_SECRET` matches
3. If `nowpayments.webhook_ip_blocked`: add the source IP to `NOWPAYMENTS_ALLOWED_IPS` or remove the allowlist
4. Check audit log for `payment.status.confirmed` events

### 4.4 Cron Reconciliation

Schedule an hourly cron job to hit `GET /api/cron/billing-reconcile`:

```bash
# Add to crontab
0 * * * * curl -s -H "X-Cron-Secret: $CRON_SECRET" https://your-domain.com/api/cron/billing-reconcile > /dev/null
```

---

## 5. Monitoring Alerts

### 5.1 Critical Alerts (page on-call)

| Alert | Condition | Detection |
|-------|-----------|-----------|
| **Redis down** | Redis connection lost | Log: `redis.disconnected` |
| **DB down** | Database connection lost | Health check: `checks.database.status = error` |
| **Cron failure** | Cron task failed | Log: `cron.<task>.failed` + notification sent to all tenant_admins |
| **Webhook signature failure** | Invalid webhook signature | Log: `nowpayments.webhook_signature_failed` or Stripe equivalent |
| **Billing self-upgrade attempt** | Non-platform-admin attempted billing change | Audit event: `security.billing_self_upgrade_blocked` |
| **Break-glass access** | Break-glass activated | Audit event: `breakglass.active` + notification sent to all admins |
| **CSP violation spike** | >10 CSP violations in 5 min | Log: `csp.violation` (aggregate via log analysis) |

### 5.2 Warning Alerts (email security team)

| Alert | Condition | Detection |
|-------|-----------|-----------|
| **Rate limit Redis fallback** | Redis unavailable, using memory | Log: `rate_limiter.redis_unavailable_using_memory` |
| **Suspicious billing transition** | Multi-tier plan upgrade | Audit event: `security.billing_suspicious_upgrade` |
| **Mass download** | ≥50 downloads by single user in 1h | Anomaly: `detectAnomalies()` |
| **Burst failed logins** | ≥10 failed logins from same IP in 1h | Anomaly: `detectAnomalies()` |
| **SSRF blocked** | Outbound URL blocked by SSRF guard | Log: `ssrf_safe_fetch.blocked_ip` or `nowpayments.webhook_ip_blocked` |
| **Payment underpayment** | Crypto payment < amount due | Log: `nowpayments.underpayment` |

### 5.3 Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| `smart_edms_uptime_seconds` | `/api/metrics` | < 60 (just restarted) |
| `smart_edms_audit_events_24h{result="deny"}` | `/api/metrics` | > 1000 (attack in progress) |
| `smart_edms_active_legal_holds` | `/api/metrics` | sudden spike (litigation event) |
| API p99 latency | APM (Datadog/New Relic) | > 500ms (performance degradation) |
| Redis connection count | Redis INFO | > 100 (connection leak) |
| BullMQ failed jobs | `/api/admin/jobs` | > 10 (worker issue) |

---

## 6. Incident Response

### 6.1 Account Compromise

**Symptom**: Unusual activity from a user account (mass downloads, admin actions the user wouldn't perform).

**Response**:
1. Suspend the user: `PATCH /api/admin/users/:id { status: 'suspended' }` (requires step-up)
2. This revokes all JWTs + API keys + step-up tokens for the user
3. Review audit log: `GET /api/audit?actorId=<user-id>&from=<suspected-time>`
4. Check for privilege escalation: `GET /api/audit?eventType=authz.deny&actorId=<user-id>`
5. If the user is an admin: rotate `NEXTAUTH_SECRET` (invalidates ALL sessions)
6. Notify the user: `sendSecurityIncidentAlert()` (TODO: add template)

### 6.2 Webhook URL Compromise

**Symptom**: Attacker has configured a malicious webhook URL (SSF target).

**Response**:
1. Disable the webhook: `PATCH /api/admin/webhooks/:id { enabled: false }` (requires step-up)
2. Review webhook delivery logs: `GET /api/audit?eventType=webhook.delivered`
3. Check for data exfiltration: review the webhook's `lastStatus` history
4. Rotate `NEXTAUTH_SECRET` if the webhook was used to steal session data
5. Block the attacker's IP in the firewall

### 6.3 Payment Fraud

**Symptom**: Suspicious billing activity (self-upgrade attempt, price mismatch, underpayment).

**Response**:
1. Check audit log: `GET /api/audit?eventType=security.billing_*`
2. If subscription was fraudulently activated: `PATCH /api/admin/billing` to downgrade (requires platform admin)
3. If payment was confirmed but fraudulent: `POST /api/billing/refund` (requires platform admin + step-up)
4. Review the invoice: `GET /api/billing/status/:invoiceId`
5. Contact the payment provider to dispute the charge if needed

### 6.4 Redis Outage

**Symptom**: SSO/MFA/passkey login failures, rate limits not enforced globally.

**Response**:
1. Check Redis: `redis-cli -u $REDIS_URL ping`
2. If Redis is down: restart it. Application auto-recovers within 30s.
3. If Redis data is lost: see §2.4 (Manual Failover)
4. Monitor for SSO login failures: `GET /api/audit?eventType=auth.login&result=deny&reason=sso_state_expired`
5. If failures persist after Redis recovery: restart the application

---

## 7. Deployment Checklist

### Pre-Deployment

- [ ] All env vars set (see `.env.example` for full list)
- [ ] `NEXTAUTH_SECRET` ≥ 32 chars
- [ ] `SMART_EDMS_KEK` = 64 hex chars (32 bytes)
- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite) in production
- [ ] `STORAGE_DRIVER=s3` + S3 credentials configured
- [ ] `REDIS_URL` set (required for multi-instance)
- [ ] `CRON_SECRET` ≥ 32 chars
- [ ] `METRICS_TOKEN` ≥ 32 chars (or restrict /api/metrics to loopback)
- [ ] `WS_INTERNAL_SECRET` ≥ 32 chars
- [ ] `NODE_ENV=production`
- [ ] `NEXTAUTH_URL` uses HTTPS
- [ ] `productionBrowserSourceMaps` = false (verified in next.config.ts)

### Post-Deployment

- [ ] `GET /api/health` returns 200 with all checks `ok`
- [ ] `GET /api/metrics` returns 401 without token (or 200 from loopback)
- [ ] Login works: `POST /api/auth/callback/credentials` returns 302
- [ ] Audit log records the login: `GET /api/audit` shows `auth.login` event
- [ ] File upload works: create a document and verify it's encrypted at rest
- [ ] Webhook delivery works: create a test webhook and verify delivery
- [ ] Stripe webhook (if configured): `stripe trigger customer.subscription.created` → check audit log
- [ ] NowPayments (if configured): create a test invoice and verify the payment page loads
- [ ] Cron endpoint: `curl -H "X-Cron-Secret: $CRON_SECRET" /api/cron/escalate` → 200
- [ ] CSP report endpoint: `curl -X POST -H "Content-Type: application/csp-report" -d '{"csp-report":{}}' /api/csp-report` → 204

### Security Verification

- [ ] Run `npx eslint .` → 0 errors
- [ ] Run `npx tsc --noEmit` → 0 errors
- [ ] Run `npx vitest run` → all tests pass
- [ ] Run `npx playwright test` → all non-skipped tests pass
- [ ] Run `npm audit` → no high/critical vulnerabilities
- [ ] Verify rate limiting: `for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/callback/credentials -X POST -d '{"email":"test","password":"test"}' -H "Content-Type: application/json"; done` → should see 429 after 10 attempts
