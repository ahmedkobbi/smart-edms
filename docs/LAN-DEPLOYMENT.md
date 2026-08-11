# Smart EDMS — LAN Deployment Guide

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

**Scenario:** Server on a LAN (local access network) with outbound internet access.

</div>

---

## Overview

This guide walks you through deploying Smart EDMS on a single server that sits on your enterprise LAN and has outbound internet access. This is the most common enterprise pattern:

- **Inbound traffic:** Only from LAN users (employees access via `http://smartedms.internal` or an internal IP)
- **Outbound traffic:** The server can reach the internet (for package updates, optional LLM API, optional external SMTP, etc.)
- **External users:** Cannot reach the server (no inbound from the internet required)

This hybrid setup gives you the best of both worlds: the security of an on-premise deployment with the convenience of internet egress for updates and optional cloud services.

### What works in this scenario

| Capability | Status | Notes |
|------------|--------|-------|
| Authentication (password + MFA + SSO) | ✅ Full | Point SSO at your internal IdP (AD FS, Keycloak, Authentik) |
| Document lifecycle, audit, workflows | ✅ Full | No external dependencies |
| AI classification (heuristic + LLM) | ✅ Full | Heuristic always works; LLM calls work via internet egress |
| Email notifications | ✅ Full | Use internal SMTP relay OR external SMTP (Gmail, SendGrid) |
| Search (OpenSearch) | ✅ Full | Runs on the same server |
| Real-time collaboration | ✅ Full | Hocuspocus/Yjs, no external calls |
| OCR, ClamAV malware scanning | ✅ Full | Run locally |
| Package updates, npm install | ✅ Full | Internet egress available |
| Sentry error tracking | ✅ Optional | Works if you set `SENTRY_DSN` |
| Stripe / NowPayments (crypto) | ⚪ Dormant | Not needed for internal deployment — leave env vars empty |
| Public marketing site / self-registration | ⚪ Dormant | Disable via routing or ignore |
| Browser push notifications | ⚠️ Limited | Requires Web Push service (Google FCM); works from internet-connected browsers but may be blocked by corporate proxies. In-app + email notifications always work. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Enterprise LAN                                │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                           │
│  │ Employee │  │ Employee │  │ Admin    │                           │
│  │ Browser  │  │ Browser  │  │ Browser  │                           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                          │
│       │              │              │                                 │
│       └──────────────┴──────────────┘                                │
│                      │                                               │
│                      │ HTTPS (internal CA cert)                      │
│                      ▼                                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Smart EDMS Server (Docker host)                   │ │
│  │                                                                │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │ │
│  │  │ Caddy   │  │ Next.js │  │ Worker  │  │ ClamAV  │          │ │
│  │  │ (TLS)   ├──│  :3000  │  │ (BullMQ)│  │  :3310  │          │ │
│  │  │ :443/:80│  └────┬────┘  └────┬────┘  └─────────┘          │ │
│  │  └────┬────┘       │            │                              │ │
│  │       │       ┌────┴────────────┴────┐                         │ │
│  │       │       │                      │                         │ │
│  │  ┌────▼───┐  ┌▼────────┐  ┌─────────┐  ┌─────────┐            │ │
│  │  │Postgres│  │  Redis  │  │ MinIO   │  │OpenSrch │            │ │
│  │  │  :5432 │  │  :6379  │  │ (S3)    │  │  :9200  │            │ │
│  │  └────────┘  └─────────┘  └─────────┘  └─────────┘            │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                      │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
                                │ Outbound internet (egress)
                                ▼
                  ┌──────────────────────────────┐
                  │  npm registry (updates)      │
                  │  LLM API (AI fallback)        │
                  │  External SMTP (optional)     │
                  │  Sentry (optional)            │
                  │  ClamAV signature updates     │
                  └──────────────────────────────┘
```

### Why Caddy?

Caddy is the reverse proxy recommended for LAN deployments because it:
- **Automatically provisions TLS certificates** from an internal CA (or Let's Encrypt if you have a public domain + DNS)
- **Requires zero configuration** for basic HTTPS — just give it a hostname
- **Handles HTTP→HTTPS redirect** automatically
- **Is a single static binary** — no dependencies, easy to audit

For air-gapped networks (no internet at all), you'd use a self-signed cert with Nginx instead. But since your server has internet access, Caddy is the simplest path.

---

## Prerequisites

### Hardware (minimum for ~50 concurrent users)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 100 GB SSD | 500 GB SSD (for document storage) |
| Network | 1 Gbps LAN | 1 Gbps LAN + internet egress |

### Software (on the host)

- **Docker Engine 24+** — [install instructions](https://docs.docker.com/engine/install/)
- **Docker Compose v2+** — bundled with modern Docker Engine
- **Git** — to clone the repository
- **OpenSSL** — to generate secrets (pre-installed on most Linux distros)

### Network

- A **static LAN IP** for the server (e.g., `192.168.1.100`)
- An **internal DNS hostname** pointing to that IP (e.g., `smartedms.internal.company.dz`) — optional but strongly recommended. If you don't have internal DNS, employees can use the IP directly, but HTTPS certificates are easier with a hostname.
- **Outbound internet access** on ports 80/443 (for package updates, LLM API, optional SMTP, ClamAV signature updates)
- **Inbound access from LAN** on ports 80/443 (for employees)
- **No inbound access from the internet** (unless you deliberately want remote access — see the "Remote Access" section below)

---

## Step 1: Clone and configure

```bash
# On the server, clone the repository
git clone https://github.com/ahmedkobbi/smart-edms.git
cd smart-edms

# Copy the LAN environment template
cp .env.lan.template .env

# Generate the required secrets
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "SMART_EDMS_KEK=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
echo "METRICS_TOKEN=$(openssl rand -hex 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
echo "WS_INTERNAL_SECRET=$(openssl rand -hex 32)"

# Fill in the .env file with the generated values
nano .env
```

### Critical environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXTAUTH_URL` | The URL employees use to access EDMS | `https://smartedms.internal.company.dz` |
| `NEXTAUTH_SECRET` | JWT signing secret (32+ bytes) | `openssl rand -base64 32` |
| `SMART_EDMS_KEK` | Key Encryption Key for envelope encryption (32 bytes hex) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -hex 16` |
| `DATABASE_URL` | PostgreSQL connection string (auto-set in compose) | — |
| `REDIS_URL` | Redis connection string (auto-set in compose) | — |

> ⚠️ **Never commit the `.env` file.** It is in `.gitignore` by default. Back it up to a secure location (password manager, encrypted USB) — losing `SMART_EDMS_KEK` means losing access to all encrypted secrets (MFA, SSO client secrets, backup codes).

---

## Step 2: Configure TLS (HTTPS)

HTTPS is **mandatory** — Smart EDMS uses `secure` cookies and the `__Secure-` cookie prefix, which only work over HTTPS.

### Option A: Internal DNS hostname (recommended)

If you have internal DNS (e.g., `smartedms.internal.company.dz` resolves to your server's LAN IP):

1. Add the hostname to your internal DNS server.
2. Caddy will automatically provision a certificate. For internal hostnames that aren't publicly resolvable, Caddy uses its internal CA (trusted by the server, but not by employee browsers by default).

To make employee browsers trust the Caddy internal CA, you have two choices:

**Choice 1 — Distribute the Caddy root CA certificate (easiest):**

```bash
# After starting Caddy for the first time, the root CA is at:
# /data/caddy/pki/authorities/local/root.crt
# Distribute this certificate to employee machines via Group Policy (AD)
# or MDM, installing it in the "Trusted Root Certification Authorities" store.
```

**Choice 2 — Use your enterprise CA (most enterprises already have one):**

If your organization already runs an internal CA (Active Directory Certificate Services, etc.), request a certificate for `smartedms.internal.company.dz` and configure Caddy to use it:

```caddyfile
# Caddyfile (place at ./Caddyfile)
smartedms.internal.company.dz {
    tls /certs/fullchain.pem /certs/privkey.pem
    reverse_proxy app:3000
}
```

### Option B: LAN IP only (no internal DNS)

If you don't have internal DNS, use the server's LAN IP directly:

1. Set `NEXTAUTH_URL=https://192.168.1.100` in `.env`
2. Generate a self-signed certificate for that IP
3. Configure Caddy with the self-signed cert

```bash
# Generate a self-signed cert for the LAN IP
openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out fullchain.pem \
  -days 3650 -nodes -subj "/CN=192.168.1.100" \
  -addext "subjectAltName=IP:192.168.1.100"

# Move to the certs directory
mkdir -p certs
mv privkey.pem fullchain.pem certs/
```

Employees will see a browser warning on first visit — they must click "Advanced → Proceed". This is acceptable for small deployments but not ideal for larger ones.

### Option C: Helper script

Use the included helper script to set up TLS:

```bash
chmod +x scripts/setup-lan-tls.sh
./scripts/setup-lan-tls.sh smartedms.internal.company.dz
# or for an IP:
./scripts/setup-lan-tls.sh 192.168.1.100
```

---

## Step 3: Start the stack

```bash
# Build and start all services
docker compose -f docker-compose.lan.yml up -d --build

# Check that all services are healthy
docker compose -f docker-compose.lan.yml ps

# View logs (follow)
docker compose -f docker-compose.lan.yml logs -f app

# Run database migrations
docker compose -f docker-compose.lan.yml exec app npx prisma migrate deploy

# Seed the database (creates default tenant, admin user, roles, classifications)
docker compose -f docker-compose.lan.yml exec app bun run seed
```

### Default admin credentials

```
URL:      https://smartedms.internal.company.dz
Email:    admin@smartedms.local
Password: ChangeMe!2025
```

> ⚠️ **Change the admin password immediately after first login.** Go to Settings → Profile → Change Password.

---

## Step 4: Post-deployment configuration

### 4.1 Configure email (SMTP)

Smart EDMS sends email notifications for password changes, MFA resets, workflow assignments, and anomaly alerts. Point it at your internal SMTP relay or an external service:

```env
# Internal SMTP relay (most enterprises have one)
SMTP_HOST=mail.internal.company.dz
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smartedms@company.dz
SMTP_PASS=your-smtp-password
SMTP_FROM="Smart EDMS <smartedms@company.dz>"

# Or external SMTP (works because server has internet egress)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Smart EDMS <your-gmail@gmail.com>"
```

### 4.2 Configure SSO (optional but recommended)

If your enterprise uses Active Directory, Keycloak, Authentik, or another IdP:

1. Register Smart EDMS as a relying party in your IdP.
2. Configure the OIDC or SAML settings in the admin console under Settings → SSO.
3. Set the email domain allowlist to your company domain (e.g., `company.dz`) to enable JIT provisioning.

### 4.3 Configure AI (optional)

The heuristic classifier works out of the box. To enable the LLM fallback (which calls an external API — works because your server has internet egress):

```env
AI_API_KEY=your-llm-api-key
AI_LLM_ENABLED=true
```

If your corporate proxy blocks outbound API calls, leave `AI_LLM_ENABLED=false` — the heuristic engine handles classification on its own.

### 4.4 Configure ClamAV

ClamAV starts automatically and downloads signature updates via internet egress. No configuration needed. To verify it's working:

```bash
docker compose -f docker-compose.lan.yml exec clamav clamav-cli ping
```

### 4.5 Disable unused features

For an internal deployment, you likely don't need the SaaS tier (billing, public signup, marketing site). You can leave these dormant (empty env vars = disabled) or explicitly disable them:

- **Stripe/NowPayments:** Leave env vars empty — the billing routes return 404 if not configured.
- **Public signup:** Set `NEXT_PUBLIC_ENABLE_SIGNUP=false` (if you want to hide the signup page) or simply don't share the `/signup` URL.
- **Marketing site:** The `/` route shows the marketing page. To redirect directly to login, modify `src/app/page.tsx` to redirect to `/login`.

---

## Step 5: Backup strategy

### 5.1 What to back up

| Component | What | Frequency | Retention |
|-----------|------|-----------|-----------|
| PostgreSQL | Database dump (`pg_dump`) | Daily (or hourly for high-churn) | 30 days + monthly archives |
| Document storage | MinIO bucket / `app_storage` volume | Daily (rsync or MinIO replication) | 90 days |
| Redis | BullMQ job queue (optional) | Not required — jobs are idempotent | — |
| `.env` file | Secrets (KEK, NEXTAUTH_SECRET, etc.) | On every change | Indefinitely (encrypted) |
| Caddy certs | TLS certificates | On renewal | Current only |

### 5.2 Automated backup script

Use the included backup script:

```bash
# Daily database + storage backup to a LAN share
chmod +x scripts/backup.sh
# Edit the script to point at your LAN backup share (NFS, SMB, or rsync target)
crontab -e
# Add: 0 2 * * * /home/admin/smart-edms/scripts/backup.sh >> /var/log/smartedms-backup.log 2>&1
```

### 5.3 Restore procedure

See [`docs/OPERATIONS-RUNBOOK.md`](./OPERATIONS-RUNBOOK.md) for the full restore procedure. The short version:

```bash
# Stop the app
docker compose -f docker-compose.lan.yml stop app worker

# Restore PostgreSQL
gunzip -c /backups/smartedms-2026-08-11.sql.gz | \
  docker compose -f docker-compose.lan.yml exec -T postgres psql -U smartedms -d smartedms

# Restore document storage
rsync -avz /backups/storage/ /var/lib/docker/volumes/smartedms_app_storage/_data/

# Restart
docker compose -f docker-compose.lan.yml up -d
```

---

## Step 6: Monitoring

### 6.1 Health check

Smart EDMS exposes a health endpoint:

```bash
curl https://smartedms.internal.company.dz/api/health
# {"status":"ok","db":"ok","redis":"ok","storage":"ok"}
```

Set up a monitoring check (Uptime Kuma, Nagios, Zabbix) against this endpoint.

### 6.2 Metrics

Prometheus-format metrics are available at `/api/metrics` (requires bearer token):

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  https://smartedms.internal.company.dz/api/metrics
```

Point your Prometheus instance at this endpoint to collect metrics in Grafana.

### 6.3 Logs

```bash
# Follow app logs
docker compose -f docker-compose.lan.yml logs -f app

# Follow worker logs (OCR, webhooks, background jobs)
docker compose -f docker-compose.lan.yml logs -f worker

# All services
docker compose -f docker-compose.lan.yml logs -f
```

For centralized logging, configure Docker's logging driver to forward to your SIEM (ELK, Loki, Splunk).

---

## Security hardening checklist

- [ ] **Change the admin password** immediately after first login
- [ ] **Enable MFA** on all admin accounts (TOTP mandatory for `tenant_admin`)
- [ ] **Back up the `.env` file** to a secure location (the KEK is irreplaceable)
- [ ] **Configure the firewall** to only allow inbound 80/443 from LAN subnets
- [ ] **Restrict outbound traffic** to only required destinations (npm registry, LLM API, SMTP, ClamAV updates) if your corporate policy requires it
- [ ] **Set up the backup cron job** and test a restore
- [ ] **Distribute the TLS root CA certificate** to employee machines (if using Caddy's internal CA)
- [ ] **Configure SSO** so employees use their corporate credentials
- [ ] **Review audit log alerts** — configure notifications for `result=deny` spikes and `audit.verify` failures
- [ ] **Disable unused features** (Stripe, NowPayments, public signup) if not needed
- [ ] **Apply OS security updates** on a schedule (`unattended-upgrades` for security patches)
- [ ] **Restrict SSH access** to the server (key-only auth, fail2ban, non-root user)

---

## Remote access (optional)

If employees need to access Smart EDMS from outside the LAN (e.g., remote work):

### Option A: VPN (recommended)

Set up WireGuard or OpenVPN on the server (or a dedicated VPN gateway). Employees connect to the VPN first, then access Smart EDMS as if they were on the LAN. This is the most secure option — no inbound ports opened to the internet.

### Option B: Reverse VPN tunnel (Cloudflare Tunnel, Tailscale)

If you don't want to manage a VPN server:

- **Tailscale** — install on the server, employees install the Tailscale client, access via the Tailscale IP. Zero inbound ports.
- **Cloudflare Tunnel** — exposes the server via Cloudflare's network. Requires a public domain. Smart EDMS is then accessible at `https://smartedms.yourdomain.com` with Cloudflare's TLS.

### Option C: Direct internet exposure (not recommended)

If you must expose Smart EDMS directly to the internet:
- Use a real domain name with Let's Encrypt (Caddy handles this automatically)
- Put it behind a WAF (Cloudflare, AWS WAF)
- Enable rate limiting at the edge
- Restrict access by IP if possible
- This pattern loses the "LAN-only" security benefit — only do this if you have a strong perimeter defense

---

## Troubleshooting

### Employees see a TLS warning

This means the Caddy internal CA isn't trusted on their machine. Solutions:
1. Distribute the root CA certificate via Group Policy (AD) or MDM
2. Use your enterprise CA instead of Caddy's internal CA
3. Use a real domain name + Let's Encrypt (requires public DNS)

### "Database connection refused"

```bash
# Check if PostgreSQL is healthy
docker compose -f docker-compose.lan.yml ps postgres
# Check logs
docker compose -f docker-compose.lan.yml logs postgres
# Common cause: POSTGRES_PASSWORD mismatch between .env and the volume
# Reset: docker compose -f docker-compose.lan.yml down -v  # WARNING: deletes data
```

### Uploads fail with "storage error"

```bash
# Check if the storage volume is writable
docker compose -f docker-compose.lan.yml exec app ls -la /app/storage
# Check disk space
df -h
# If using MinIO, check its console at http://server-ip:9001
```

### ClamAV uses too much memory

ClamAV is memory-hungry (~1 GB). If your server is constrained:
- Disable ClamAV in `docker-compose.lan.yml` (comment out the service)
- Set `CLAMAV_HOST=` (empty) in `.env`
- The heuristic malware scanner will still run as a fallback

### OpenSearch won't start

OpenSearch requires elevated `vm.max_map_count`. On the host:

```bash
sudo sysctl -w vm.max_map_count=262144
# Persist: echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

---

## Upgrading

```bash
cd smart-edms

# Pull the latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.lan.yml up -d --build

# Run any new migrations
docker compose -f docker-compose.lan.yml exec app npx prisma migrate deploy

# Check the changelog for breaking changes
cat CHANGELOG.md
```

Always back up the database before upgrading. See [`CHANGELOG.md`](../CHANGELOG.md) for release notes and breaking changes.

---

## FAQ

### Can I run Smart EDMS without internet access at all?

Yes — see the "Air-gapped deployment" notes throughout this guide. The main changes:
- Disable LLM AI fallback (`AI_LLM_ENABLED=false`)
- Use internal SMTP only
- Disable Sentry (`SENTRY_DSN=`)
- Vendor `node_modules` or use an internal npm registry (Verdaccio, Nexus)
- ClamAV signature updates must be manually imported
- Use Nginx with a self-signed cert instead of Caddy (Caddy tries to phone home for ACME)

### Can I use SQLite instead of PostgreSQL?

Yes, for small deployments (< 20 concurrent users). Set `DATABASE_URL=file:/app/data/smartedms.db` in `.env`. PostgreSQL is recommended for anything larger because it supports Row-Level Security and concurrent writes better.

### How many users can one server handle?

Rough estimates based on the load test (10 VUs, 1.13% error rate, dashboard p99 188ms):
- **50 concurrent users:** Comfortable on 4 cores / 8 GB RAM
- **100 concurrent users:** Comfortable on 8 cores / 16 GB RAM
- **200+ concurrent users:** Add a second app server behind a load balancer, and separate PostgreSQL/Redis onto dedicated servers

### Is the billing tier usable on LAN?

Technically yes, but it requires inbound webhooks from Stripe/NowPayments, which means exposing the server to the internet. For internal deployments, leave the billing env vars empty — the routes return 404 and the SaaS tier is dormant. You'd typically run a single "internal" tenant and not charge per-seat.

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.* 🇩🇿

</div>
