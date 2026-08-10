# Smart EDMS — Deployment Guide

This guide covers deploying Smart EDMS to production using Docker + PostgreSQL + S3 + SMTP + WebSocket.

## Prerequisites

- Docker 24+ and Docker Compose v2
- Domain name with DNS access
- TLS certificate (Let's Encrypt or commercial)
- PostgreSQL 16+ (or use the included Docker service)
- S3-compatible storage (AWS S3, MinIO, Cloudflare R2)
- SMTP relay (Gmail, SendGrid, Postmark, or self-hosted Postfix)

## Quick Start (Docker Compose)

### 1. Clone and configure

```bash
git clone https://github.com/ahmedkobbi/smart-edms.git
cd smart-edms

cp .env.example .env
```

Edit `.env` with production values:

```bash
# Required — generate each with: openssl rand -hex 32
NEXTAUTH_SECRET=$(openssl rand -base64 32)
SMART_EDMS_KEK=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)

# Database
DATABASE_URL=postgresql://smartedms:STRONG_PASSWORD@postgres:5432/smartedms?schema=public
POSTGRES_PASSWORD=STRONG_PASSWORD

# Public URL
NEXTAUTH_URL=https://app.yourdomain.com

# S3 storage
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=your-smartedms-bucket
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false

# SMTP for email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG....
SMTP_FROM=Smart EDMS <noreply@yourdomain.com>

# WebSocket service
WS_SERVICE_URL=http://app:3003
```

### 2. Start services

```bash
docker compose up -d postgres
docker compose up -d app
```

### 3. Run migrations + seed

```bash
# Push schema to PostgreSQL
docker compose exec app npx prisma db push

# Apply RLS policies
docker compose exec app psql $DATABASE_URL -f scripts/rls-policies.sql

# Seed initial data (creates default tenant + admin user)
docker compose exec app npm run seed
```

### 4. Verify

```bash
# Health check
curl https://app.yourdomain.com/api/health

# Should return:
# {"status":"healthy","checks":{"database":{"status":"ok"},...}}
```

### 5. Log in

Navigate to `https://app.yourdomain.com` and sign in with:
- Email: `admin@smartedms.local` (or your configured `SEED_ADMIN_EMAIL`)
- Password: `ChangeMe!2025` (or your configured `SEED_ADMIN_PASSWORD`)

**⚠️ Change the admin password immediately after first login.**

---

## Production Checklist

### Security
- [ ] Generate strong `NEXTAUTH_SECRET` (32+ bytes)
- [ ] Generate strong `SMART_EDMS_KEK` (32 bytes hex)
- [ ] Set `NEXTAUTH_URL` to HTTPS URL
- [ ] Configure TLS at load balancer / reverse proxy
- [ ] Enable HSTS (included in Next.js config)
- [ ] Configure CSP headers (included in `next.config.ts`)
- [ ] Rotate the seed admin password
- [ ] Enable MFA on all admin accounts
- [ ] Review default policies and classifications

### Database
- [ ] PostgreSQL 16+ with connection pooling (PgBouncer recommended)
- [ ] Apply RLS policies (`scripts/rls-policies.sql`)
- [ ] Configure automated daily backups (`pg_dump` + S3)
- [ ] Test backup restore procedure
- [ ] Set up point-in-time recovery (PITR)

### Recovery Point Objective (RPO) / Recovery Time Objective (RTO)

**Design targets** (configure infrastructure to meet these):

| Component | RPO Target | RTO Target | Strategy |
|-----------|-----------|-----------|----------|
| Database (PostgreSQL) | 15 minutes | 1 hour | WAL archiving + PITR; daily `pg_dump` to S3; automated restore test weekly |
| Object storage (S3) | 0 (versioned) | 30 minutes | S3 bucket versioning + Object Lock; cross-region replication |
| Redis (job queues) | Acceptable loss | 5 minutes | No persistence required (jobs are best-effort; re-enqueue from Prisma Job model) |
| OpenSearch index | 1 hour | 2 hours | Rebuild from PostgreSQL via `POST /api/admin/search/reindex?scope=all` |
| Application config | 0 (Git-tracked) | 5 minutes | Deploy from CI/CD pipeline; rollback via previous Docker image tag |

**Backup schedule:**
- PostgreSQL: WAL archive every 5 min + daily full `pg_dump` at 02:00 UTC
- S3: Continuous versioning + cross-region replication (1 min lag)
- Restore drill: Automated weekly test (restore to staging, verify row count + hash chain)

**Disaster recovery runbook:**
1. Provision new infrastructure from IaC (Terraform/CloudFormation)
2. Restore PostgreSQL from latest PITR point (`pg_basebackup` + WAL replay)
3. Switch S3 bucket to replica (or promote cross-region replica)
4. Rebuild OpenSearch index: `POST /api/admin/search/reindex?scope=all`
5. Deploy app + worker containers
6. Verify: health check, audit chain integrity, tenant isolation test
7. Switch DNS to new infrastructure
8. Estimated total RTO: 2-4 hours (depending on database size)

### Storage
- [ ] S3 bucket with versioning enabled
- [ ] Bucket lifecycle policy for old versions
- [ ] Cross-region replication (for DR)
- [ ] Block public access on the bucket
- [ ] Encryption at rest (SSE-S3 or SSE-KMS)

### Email
- [ ] Configure SMTP relay
- [ ] Set up SPF, DKIM, DMARC DNS records
- [ ] Test email delivery
- [ ] Monitor bounce/complaint rates

### WebSocket
- [ ] Start notifications mini-service
- [ ] Configure Caddy/nginx to forward WS upgrades
- [ ] Test real-time notification delivery

### Monitoring
- [ ] Forward logs to SIEM (Datadog, Splunk, ELK)
- [ ] Set up alerts for: `audit.verify` failures, failed login spikes, disk usage
- [ ] Monitor `/api/health` endpoint
- [ ] Configure uptime monitoring (Pingdom, UptimeRobot)

### Backups
- [ ] Database: daily `pg_dump` → S3 with 30-day retention
- [ ] Storage: S3 versioning + cross-region replication
- [ ] KEK: stored in KMS / HSM (NOT in Git)
- [ ] Test restore procedure quarterly

---

## Reverse Proxy (Caddy)

Smart EDMS includes a `Caddyfile` template for automatic TLS:

```caddyfile
app.yourdomain.com {
    reverse_proxy localhost:3000

    # WebSocket upgrade
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websockets localhost:3003

    # Security headers
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

---

## Scaling

### Horizontal scaling

The main Next.js app is stateless and can be scaled horizontally. Requirements:
- Shared database (PostgreSQL)
- Shared object storage (S3)
- Shared KEK (KMS / environment)
- Sticky sessions NOT required (JWT-based)

```bash
# Scale the app service
docker compose up -d --scale app=3
```

### WebSocket service

The WebSocket service maintains in-memory connections. For multi-instance:
- Use Redis adapter for Socket.IO (pub/sub across instances)
- Or run a single WS instance (sufficient for most tenants)

### Rate limiting

The in-memory rate limiter does NOT work across instances. For production:
- Replace with Redis-based rate limiter
- Or use API gateway rate limiting (Caddy, Kong, AWS API Gateway)

---

## Upgrading

```bash
git pull origin main
docker compose build app
docker compose up -d app

# Run any new migrations
docker compose exec app npx prisma db push

# Verify
curl https://app.yourdomain.com/api/health
```

---

## Troubleshooting

### Database connection refused
```bash
# Check PostgreSQL is running
docker compose ps postgres
docker compose logs postgres

# Test connection
docker compose exec app psql $DATABASE_URL -c "SELECT 1"
```

### File upload fails
- Check S3 credentials and bucket permissions
- Verify `STORAGE_DRIVER=s3` and all `S3_*` env vars
- Check file size (< 100MB limit)
- Check file type is in the allowlist

### Email not sending
- Check SMTP credentials
- Verify `SMTP_HOST` is set
- Check app logs: `docker compose logs app | grep email`
- In dev mode, emails are logged to console

### WebSocket not connecting
- Verify notifications service is running: `curl http://localhost:3003/health`
- Check Caddy/nginx WS upgrade configuration
- Browser console will show `[ws] Connection error`

### Audit chain verification fails
- This indicates potential tampering — investigate immediately
- Check `audit.verify` audit events
- Compare last known good receipt hash
