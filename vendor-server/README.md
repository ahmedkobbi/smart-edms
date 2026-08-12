# Smart EDMS Vendor Server

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.* 🇩🇿

The vendor-side licensing and administration server for Smart EDMS.
Issues Ed25519-signed licenses, monitors on-premise deployments via heartbeats,
and manages customers.

</div>

---

## Architecture

```
VENDOR SERVER (You)                    ON-PREM CUSTOMERS
┌──────────────────────┐               ┌──────────────────┐
│  License Registry     │   Heartbeat   │  Smart EDMS App   │
│  Customer Manager     │ ◄─────────── │  (license verify)  │
│  Heartbeat Monitor    │   (24h)      │  (public key only) │
│  Revocation System    │              └──────────────────┘
│  Dashboard (Mantine)  │
│                       │
│  Ed25519 PRIVATE KEY  │  ← NEVER leaves this server
│  (in environment)     │
└──────────────────────┘
```

## Features

- **License issuance** — Generate Ed25519-signed licenses from the web UI
- **Customer management** — Track organizations, contacts, and deployments
- **Heartbeat monitoring** — Real-time deployment health (active users, document count, integrity status)
- **Remote revocation** — Revoke a license → next heartbeat locks the on-prem server
- **Tamper detection** — Clock rollback and integrity violations flagged in heartbeat dashboard
- **Audit trail** — All administrative actions logged
- **Mantine UI** — Premium dark-mode dashboard with glassmorphism

## Setup

```bash
cd vendor-server
npm install

# Generate Ed25519 key pair (run ONCE)
cp .env.example .env
bun run src/gen-keys.ts
# → Copy the private key to VENDOR_ED25519_PRIVATE_KEY
# → Copy the public key to VENDOR_ED25519_PUBLIC_KEY
# → Also update VENDOR_PUBLIC_KEY in the main app's anti-crack.ts

# Initialize database
npx prisma db push --schema=prisma/schema.prisma --accept-data-loss

# Start the server
bun run dev
# → Opens at http://localhost:3001
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard` | Dashboard stats (customers, licenses, heartbeats) |
| `GET` | `/api/licenses` | List all licenses |
| `POST` | `/api/licenses` | Issue a new license (Ed25519-signed) |
| `POST` | `/api/licenses/:id/revoke` | Revoke a license |
| `GET` | `/api/customers` | List customers |
| `POST` | `/api/customers` | Create a customer |
| `POST` | `/api/heartbeat` | On-prem phone-home endpoint |
| `GET` | `/api/heartbeat` | List recent heartbeats |

## Security Model

- The Ed25519 **private key** lives ONLY on this server (in the environment)
- The on-prem customer server has ONLY the **public key** — it can verify but NOT generate licenses
- Even if a customer compromises their own server, they cannot forge new licenses
- Heartbeats are authenticated by the license key itself (which is Ed25519-signed)
- Remote revocation propagates on the next heartbeat (24h max delay, or immediate if online)

## UI

Built with [Mantine](https://mantine.dev) v7 — premium dark-mode dashboard with:
- Dashboard with stats, recent heartbeats, and recent licenses
- License management with issue/revoke and copy-to-clipboard
- Customer management with create form
- Heartbeat monitoring with integrity/tamper indicators
