# ADR-017: Security Audit Framework

## Status

Accepted

## Date

2026-08-11

## Context

Smart EDMS needed a third-party security audit preparation framework to support
organizations pursuing ISO 27001, SOC 2, GDPR, HIPAA, and DoD 5015.02
certification. The existing security posture (125+ findings patched, hash-chained
audit log, envelope encryption) was strong but lacked:

1. A structured way to **track audit findings** through their lifecycle
2. **Automated scanning** to catch vulnerabilities before an auditor does
3. **Evidence collection** for auditors (audit chain verification, access reviews)
4. **Compliance mapping** between findings and control frameworks

## Decision

Implement a Security Audit Framework with four layers:

### 1. Data model (3 Prisma models)
- `SecurityAudit` — the audit engagement (framework, scope, status, risk score)
- `SecurityAuditFinding` — individual findings (severity, CVSS, CWE, remediation)
- `SecurityScanResult` — automated scan outputs (npm-audit, secret scan, config scan)

### 2. Automated scanners (3 types)
- **Dependency scan** — wraps `npm audit --json` and maps vulnerabilities to findings
- **Secret scan** — regex-based detection of AWS keys, GitHub tokens, private keys, JWT secrets, etc.
- **Config scan** — validates env vars (NEXTAUTH_SECRET strength, KEK presence, NODE_ENV)

### 3. Evidence collection
- Audit log hash chain verification
- User access review (all users, MFA status, last login)
- Permissions matrix (roles → permissions → user count)
- SHA-256 evidence manifest for tamper-evidence

### 4. Compliance control catalogs
- 6 frameworks with pre-mapped controls (ISO 27001: 15, SOC 2: 18, GDPR: 17, HIPAA: 16, DoD 5015.02: 15, Internal: 6)
- Each finding can reference multiple controls across frameworks

## Consequences

### Positive
- Auditors get structured, machine-readable evidence instead of ad-hoc exports
- Risk score (0-100) provides a single metric for executive reporting
- Automated scans catch issues before an auditor does
- Findings are tracked from `open` → `in_remediation` → `remediated` → `verified`

### Negative
- The secret scanner uses regex (may produce false positives — requires human review)
- `npm audit` requires a running Node.js environment (won't work in air-gapped setups)
- Compliance control catalogs are hardcoded (not customizable per tenant — future work)

## Alternatives Considered

1. **Use an external GRC tool (Drata, Vanta)** — expensive ($10k+/year), SaaS-only, not self-hosted
2. **Manual spreadsheets** — error-prone, no automation, no evidence collection
3. **Open-source (DefectDojo)** — too heavy, separate deployment, not integrated with EDMS audit log
