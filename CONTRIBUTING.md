# Contributing to Smart EDMS

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

**🌐 Read this guide in:** [English](./CONTRIBUTING.md) · [العربية](./CONTRIBUTING.ar.md)

</div>

---

## Important: Proprietary Project

Smart EDMS is a **proprietary project** licensed under a proprietary evaluation-and-authorized-deployment license (see [`LICENSE`](./LICENSE)). It is **not** open-source. However, the Author welcomes high-quality contributions from the community — including bug reports, security disclosures, documentation improvements, and feature pull requests — subject to the terms below.

By submitting a contribution, you agree that your work will be governed by the project's proprietary license and that you grant the Author a perpetual, irrevocable, worldwide, royalty-free license to use, modify, and redistribute your contribution as part of the Software, without further attribution or compensation.

---

## How Can I Contribute?

### Reporting bugs

Bugs are tracked as [GitHub Issues](https://github.com/ahmedkobbi/smart-edms/issues). Before opening a new issue:

1. **Search existing issues** to avoid duplicates.
2. **Reproduce on `main`** — confirm the bug exists on the latest `main` branch, not just an old fork.
3. **Collect context**: Node/Bun version, OS, browser, database driver (SQLite vs PostgreSQL), Redis version, and the smallest possible reproduction steps.
4. **Include logs**: redact secrets, but include relevant `dev.log` / `server.log` excerpts and any audit-event IDs.
5. **Use the bug report template** if one is provided in the issue tracker.

A good bug report includes: a one-line summary, the expected vs. actual behavior, minimal reproduction steps, the environment, and the severity (does it block a workflow, leak data, or is it cosmetic?).

### Reporting security vulnerabilities

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email the Author directly via GitHub or open a **private security advisory** on the repository. The Author commits to:

- Acknowledging receipt within 72 hours.
- Providing an initial assessment within 7 days.
- Coordinating disclosure timing with you once a fix is available.

Please include: a clear description of the vulnerability, the affected component(s), a proof-of-concept or reproduction steps, the impact, and any suggested remediation. See [`docs/SECURITY.md`](./docs/SECURITY.md) for the project's threat model and security architecture.

### Suggesting enhancements

Enhancements are also tracked as GitHub Issues with the `enhancement` label. When suggesting an enhancement:

1. Describe the **problem** the enhancement solves before describing the solution.
2. List existing alternatives and why they fall short.
3. Propose the smallest viable scope — features that can land incrementally are preferred over monolithic redesigns.
4. Reference any relevant ADRs in [`docs/adr/`](./docs/adr/) — if your enhancement contradicts an existing ADR, call this out explicitly.

### Pull requests

Pull requests are welcome for bug fixes, documentation, test coverage, and well-scoped features. Before opening a PR:

1. **Open an issue first** for any non-trivial change (more than ~50 lines of logic). This avoids wasted effort if the direction doesn't align with the project's roadmap.
2. **Branch from `main`** and target `main` in your PR.
3. **Keep PRs small and focused** — one logical change per PR is ideal. If a change spans multiple concerns, split it into a stack of dependent PRs.
4. **Write tests** for any new logic. Bug-fix PRs must include a regression test that fails before the fix and passes after.
5. **Update documentation** — if your change affects the API, update `docs/openapi.json`, the relevant ADR, and the README if needed.
6. **Ensure CI passes locally** before pushing:
   ```bash
   bun run lint
   bun run test
   npx tsc --noEmit
   bun run check:translations
   ```
7. **Use the project's commit message style** (see below).

---

## Development Setup

### Prerequisites

- **Node.js 20+** or **Bun** (recommended)
- **SQLite** (dev) or **PostgreSQL 15+** (prod)
- **Redis 7+** (required for rate limiting, queues, session stores)
- **ClamAV** (optional — for malware scanning; heuristic fallback if absent)

### Bootstrap

```bash
git clone https://github.com/ahmedkobbi/smart-edms.git
cd smart-edms
bun install
cp .env.example .env
# Edit .env — set NEXTAUTH_SECRET, SMART_EDMS_KEK, DATABASE_URL
bun run db:push
bun run seed
bun run dev          # in one terminal
bun run worker       # in another terminal (optional, for background jobs)
```

The app boots at `http://localhost:3000`. Default admin credentials:

```
Email:    admin@smartedms.local
Password: ChangeMe!2025
```

**Change the admin password immediately after first login.**

### Running the test suite

```bash
# Unit tests (Vitest) — no DB required
bun run test
bun run test:watch
bun run test:coverage

# End-to-end tests (Playwright) — requires running dev server
bun run test:e2e
bun run test:e2e:ui

# Load test
node tests/load/load-test.js

# Cross-tenant isolation suite
bun run scripts/test-isolation.ts

# Translation completeness check
bun run check:translations
```

### Code style

- **TypeScript strict mode** — `tsc --noEmit` must pass with zero errors. Type errors are treated as bugs, not warnings.
- **ESLint** — `bun run lint` must pass. The config extends `eslint-config-next` with accessibility rules via `eslint-plugin-jsx-a11y`.
- **No `any`** without a comment explaining why. Prefer `unknown` + narrowing.
- **No client-side secrets** — any value that must remain server-side lives in `src/lib/` (server-only) and is never imported from `src/app/` client components.
- **i18n everywhere** — every user-facing string flows through `t()` from `next-intl`. Hard-coded English strings in components are bugs; the `check:translations` script catches missing keys.
- **Audit-log every sensitive action** — any route that mutates auth state, documents, classifications, or payments must call the audit service with both allow and deny outcomes.
- **Test every security control** — add a regression test to `tests/unit/security-regression.test.ts` for any security-sensitive change.

### Commit message conventions

The project uses [Conventional Commits](https://www.conventionalcommits.org/) with a scope:

```
<type>(<scope>): <short description>

<optional body — wrap at 72 chars>

<optional footer>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `security`

**Scopes (examples):** `auth`, `documents`, `audit`, `billing`, `i18n`, `pwa`, `api`, `db`, `k8s`, `deps`

Examples from the project's history:

```
feat: production load test — 10 VUs, 177 requests, 1.13% error rate
fix(C1-C9): patch all critical penetration test vulnerabilities
docs: weave Algerian identity into README + package.json metadata
security(billing): enforce 12-rule payment security model
chore(deps): bump undici to 8.10 for SSRF DNS pinning
```

Keep the subject line under 72 characters, imperative mood ("add" not "added"), lowercase first letter, no trailing period. Use the body to explain **why** — the diff already shows **what**.

---

## Code of Conduct

Be excellent to each other. The project is built by an Algerian engineer and welcomes contributors from every background, nationality, and skill level. Discrimination, harassment, or hostility of any kind — toward the Author, maintainers, or other contributors — will not be tolerated. Disagreements about technical direction are normal and welcome; personal attacks are not.

If you witness or experience unacceptable behavior, contact the Author privately via GitHub.

---

## Recognition

Contributors who land meaningful improvements (bug fixes, features, docs, or tests) will be acknowledged — either in the commit history itself, or in a future `CONTRIBUTORS.md` if the project grows. The Author values craftsmanship over volume: one well-tested, well-documented PR is worth more than ten rushed ones.

---

## Questions?

- **Bugs & features:** [GitHub Issues](https://github.com/ahmedkobbi/smart-edms/issues)
- **Security:** Private GitHub security advisory (do NOT use public issues)
- **Architecture:** See the [16 ADRs](./docs/adr/) and [`docs/SECURITY.md`](./docs/SECURITY.md)
- **General:** The Author's GitHub profile: [ahmedkobbi](https://github.com/ahmedkobbi)

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.*

🇩🇿

</div>
