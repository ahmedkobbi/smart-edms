# Security Policy

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

## Supported Versions

Smart EDMS is under active development. Security fixes are applied to the
`main` branch and included in the next tagged release. There is no LTS
(long-term support) branch today — downstream deployments are expected to
track `main` or pin to a recent tag and rebase onto security fixes.

| Version | Supported | Notes |
|---------|-----------|-------|
| `main` (latest) | ✅ Active | All security fixes land here first |
| Tagged releases (`1.0.x`) | ✅ Best-effort | Backports applied when feasible |
| Older tags | ❌ Unsupported | Upgrade to `main` or a recent tag |
| Forks / detached HEADs | ❌ Unsupported | Only the canonical `ahmedkobbi/smart-edms` repository is in scope |

If you are running a fork, you are responsible for tracking upstream
security fixes. The Author does not issue advisories for forks.

---

## Reporting a Vulnerability

### Do NOT open a public GitHub issue

Security vulnerabilities **must** be reported privately so that live
deployments are not exposed to attack before a fix is available. Public
issue reports describing exploitable flaws will be deleted on sight, and
the reporter will be asked to re-file privately.

### How to report

**Preferred — open a private security advisory:**

> https://github.com/ahmedkobbi/smart-edms/security/advisories/new

GitHub's private advisory workflow supports CVSS scoring, CWE tagging,
credit attribution, and coordinated disclosure (CVE assignment is
available through GitHub's CNA partnership if the issue qualifies).

**Alternative — direct email:** contact the Author via the email listed
on their [GitHub profile](https://github.com/ahmedkobbi). If you do not
receive a response within 72 hours, follow up by opening a *metadata-only*
issue (no vulnerability details) asking the Author to check their inbox.

### What to include in your report

Please provide as much of the following as possible — the more complete
the report, the faster the fix:

1. **Description** — a clear, concise description of the vulnerability and
   the affected component(s) (e.g., `src/lib/billing/`, the TUS upload
   endpoint, the audit hash chain).
2. **Affected versions** — confirm the issue reproduces on the latest
   `main`. If you tested older tags, note which ones.
3. **Proof of concept** — step-by-step reproduction, a minimal failing
   test, or a code snippet. The PoC should be self-contained and runnable
   against a clean dev environment (`bun run dev`).
4. **Impact** — what an attacker could achieve (data leak, privilege
   escalation, authentication bypass, RCE, audit-log tampering, payment
   forgery, etc.) and the prerequisites (auth required? tenant context?
   specific configuration? network position?).
5. **Suggested remediation** — if you have a proposed fix, include it.
6. **Disclosure plans** — whether you intend to publish the details
   publicly, and on what timeline, so the Author can coordinate disclosure.

### What NOT to include

- **No real production credentials** — API keys, tokens, KEK values,
  NextAuth secrets, database passwords, or webhook signing secrets.
- **No real document content or PII** from a production database. Use
  synthetic data in your PoC.
- **No active exploit code** that could be run as-is against a live
  deployment. Obfuscate or gate destructive steps behind a `--i-know-what-im-doing`
  flag.

---

## Response Commitments

The Author (an individual, not a security team) commits to the following
service levels for vulnerability reports received through private channels:

| Milestone | Target |
|-----------|--------|
| **Acknowledgement of receipt** | within 72 hours |
| **Initial assessment** (confirm/deny the issue, triage severity) | within 7 days |
| **Status update** (for issues taking longer to fix) | every 14 days until resolved |
| **Fix on `main`** | severity-dependent (see below) |
| **Coordinated disclosure** | mutually agreed timeline, default 90 days |

### Severity-based fix targets

| Severity | Fix target |
|----------|------------|
| **Critical** (RCE, auth bypass, data leak, audit tampering) | within 7 days of confirmation |
| **High** (privilege escalation, SSRF, payment bypass) | within 14 days |
| **Medium** (info disclosure, DoS, weak crypto) | within 30 days |
| **Low** (hardening, defense-in-depth gaps) | next minor release |

These targets assume the Author is not blocked by external dependencies
(third-party libraries, infrastructure providers). If a fix depends on an
upstream patch, the Author will coordinate with the upstream maintainer
and disclose the issue with a workaround recommendation.

### Coordinated disclosure

The Author prefers **coordinated disclosure**: the reporter and the Author
agree on a publication date (default 90 days from report), and the
advisory is published on GitHub's Security Advisories page with credit to
the reporter (unless they request anonymity).

If a reporter intends to publish before a fix is available (e.g., at a
conference), the Author asks for at least 14 days' notice to prepare a
fix and notify downstream deployments.

---

## Scope

### In scope

The canonical repository at **`ahmedkobbi/smart-edms`**, including:

- All source code under `src/`
- The Prisma schema and migrations under `prisma/`
- The Dockerfile and Kubernetes manifests
- CI/CD pipeline configuration under `.github/`
- The published OpenAPI spec at `docs/openapi.json`
- Documentation under `docs/`

Vulnerability classes of particular interest:

- Authentication or authorization bypass (any login path, RBAC/ABAC, SSO, passkeys)
- Cross-tenant data access or tenant-scoping bypass
- Audit-log tampering or hash-chain breakage
- Cryptographic weaknesses (Argon2id, AES-256-GCM, HMAC, TOTP, signed URLs)
- SSRF, path traversal, or file-validation bypass
- Payment-security bypass (Stripe or NowPayments flows, webhook forgery, replay)
- SQL injection or other Prisma-query bypass
- XSS, CSRF, or CSP bypass in the web UI
- Secrets exposure in client bundles, logs, or error messages
- Race conditions in security-critical paths (step-up tokens, MFA, idempotency)

### Out of scope

- **Third-party hosted infrastructure** — GitHub, npm, Docker Hub, or your
  cloud provider's own vulnerabilities. Report those to the respective
  provider.
- **Social engineering** of the Author, contributors, or users.
- **Physical attacks** on data centers or end-user devices.
- **DoS requiring resources exceeding a single mid-tier VPS** — the
  platform is designed to be rate-limited, but sustained volumetric
  attacks are an infrastructure concern, not an application bug.
- **Findings from automated scanners** (Snyk, Dependabot, Snyk Code,
  GitHub CodeQL) that have **already** been triaged and either fixed or
  documented as accepted risk. Duplicate reports of known issues will be
  closed as duplicates.
- **Theoretical issues** with no reproduction — "this *might* be
  vulnerable because..." reports without a concrete attack path.
- **Issues in forks** or non-canonical deployments — only the
  `ahmedkobbi/smart-edms` repository is in scope.
- **Bugs that do not have security impact** — functional bugs belong in
  regular GitHub Issues, not security advisories.

### Reward / recognition

Smart EDMS is a proprietary project without a bug bounty program. The
Author cannot offer monetary rewards. Recognized reporters will be:

- **Credited** in the GitHub Security Advisory (unless they request anonymity).
- **Listed** in a future `docs/SECURITY-HALL-OF-FAME.md` if the volume of
  quality reports justifies it.
- **Thanked publicly** in the release notes of the fix release.

---

## Security Architecture Reference

This policy covers **how to report** vulnerabilities. For the project's
**security architecture, threat model, and control set**, see:

| Document | Scope |
|----------|-------|
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model, encryption, audit integrity, anomaly detection |
| [`docs/adr/`](./docs/adr/) | 16 Architecture Decision Records covering key security design choices |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Development security practices (audit-log every sensitive action, test every control) |
| [`LICENSE`](./LICENSE) | Proprietary license — Algerian governing law (Law No. 18-07 referenced) |

### Highlights of the security posture

- **125+ findings patched** across 5 severity levels (9 CRITICAL, 15 HIGH, 63 MEDIUM, 38 LOW, 5 infrastructure)
- **Hash-chained audit log** — SHA-256, append-only, one-click integrity verification
- **Zero client trust** — security-critical fields re-derived server-side
- **AES-256-GCM envelope encryption** for secrets at rest, with crypto-shredding support
- **SSRF DNS pinning** via `undici` on all outbound requests
- **12-rule payment security model** (ADRs 015 + 016) for Stripe and NowPayments
- **Race-safe step-up tokens** — atomic `updateMany WHERE usedAt=null`
- **Replay-protected MFA** — `mfaLastTimestep` per RFC 6238 §5.2
- **Account lockout on all login paths** — password, SSO, and passkeys

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.* 🇩🇿

</div>
