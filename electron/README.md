# Smart EDMS Desktop — Electron Application

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.* 🇩🇿

The on-premise desktop application for Smart EDMS.
No web server. No open ports. No Docker. No .env file.
Encrypted database. OS keychain. Ed25519 license verification.

</div>

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Smart EDMS Desktop (Electron)             │
│                                                        │
│  ┌──────────────────────┐  ┌────────────────────────┐ │
│  │  Main Process (Node)  │  │  Renderer Process       │ │
│  │                       │  │  (Chromium, hardened)   │ │
│  │  • PGlite/SQLCipher   │  │                         │ │
│  │  • OS Keychain        │  │  • Next.js static export│ │
│  │  • License verifier   │  │  • Mantine UI          │ │
│  │  • Ed25519 public key │  │  • All 51 pages         │ │
│  │  • Auto-updater       │  │  • All 68 components    │ │
│  │  • Heartbeat sender   │  │  • bpmn-js              │ │
│  │  • IPC bridge         │  │  • Glassmorphism CSS    │ │
│  └──────────┬────────────┘  └──────────┬──────────────┘ │
│             │                          │                │
│             └────── IPC (secure) ──────┘                │
│             (contextBridge, no Node access)             │
└──────────────────────────────────────────────────────────┘
```

## Security Hardening

| Setting | Value | Why |
|---------|-------|-----|
| `devTools` | `false` (production) | No F12, no Inspector |
| `nodeIntegration` | `false` | Renderer can't access Node.js |
| `contextIsolation` | `true` | Isolated context |
| `sandbox` | `true` | OS-level sandbox |
| `webSecurity` | `true` | Same-origin policy |
| `webviewTag` | `false` | No webview tags |
| `allowRunningInsecureContent` | `false` | No mixed content |
| Menu bar | Removed | No Developer Tools menu |
| External navigation | Blocked | No phishing |
| New windows | Denied | No popups |
| Single instance | Enforced | One instance only |

## Secrets Management

ALL secrets stored in the OS keychain (TPM/Secure Enclave backed):
- **KEK** (Key Encryption Key) — for AES-256-GCM envelope encryption
- **JWT Secret** — for session tokens
- **DB Encryption Key** — for SQLCipher/PGlite
- **License Key** — the Ed25519-signed license

No `.env` file. No plaintext config. No secrets on disk.

## Database

- **Primary:** PGlite (WASM PostgreSQL) — in-process, no server, no ports
  - Row-Level Security (tenant isolation at DB layer)
  - Audit triggers (append-only enforcement at DB layer)
  - pgcrypto (column-level encryption)
  - Full-text search with Arabic analyzers
- **Fallback:** better-sqlite3 with SQLCipher — if PGlite is unavailable

## License Verification

1. License key retrieved from OS keychain
2. Ed25519 signature verified using vendor's PUBLIC key (only)
3. Expiry date checked
4. Hardware fingerprint verified (license bound to this machine)
5. Clock rollback detected (high-water mark)
6. Database integrity hash verified (detects DB tampering)

The private key is NEVER on this machine. It's on the vendor server only.

## Heartbeat

Every 24 hours, the desktop app phones home to the vendor server:
- Sends: version, active users, document count, storage used, license status
- Receives: action (none/read_only/lock)
- If `lock`: application locks immediately (revocation propagation)
- If air-gapped: heartbeat skipped (offline license verification still works)

## Auto-Update

- Checks vendor server for updates
- Downloads signed updates (code signature verified)
- Installs on app quit
- Uses electron-updater with Windows Authenticode

## Build

```bash
cd electron
npm install
npm run build
npm run dist
# → Creates Windows MSI installer in release/
```

## Files

```
electron/
├── package.json              ← Electron + builder config (MSI + NSIS)
├── tsconfig.json
├── .gitignore
├── resources/
│   └── locked.html           ← License locked screen
└── src/
    ├── main.ts               ← Main process (hardened BrowserWindow)
    ├── preload.ts            ← Secure contextBridge (renderer API)
    ├── crypto/
    │   └── keychain.ts       ← OS keychain (KEK, JWT, DB key, license)
    ├── db/
    │   └── database.ts       ← PGlite/SQLCipher init + RLS + triggers
    ├── license/
    │   ├── verify.ts         ← Ed25519 verification + hardware fingerprint
    │   └── heartbeat.ts      ← Phone-home to vendor server
    ├── ipc/
    │   └── handlers.ts       ← All IPC handlers (DB, files, crypto, license)
    └── updater/
        └── index.ts          ← Auto-update with code signing
```
