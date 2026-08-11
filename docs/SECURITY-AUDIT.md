# Security Audit Framework

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

## Overview

Smart EDMS includes a built-in **Security Audit Framework** that automates audit
preparation, evidence collection, and compliance mapping for organizations
pursuing ISO 27001, SOC 2, GDPR, HIPAA, and DoD 5015.02 certification.

## Features

### Audit management
- Create audits scoped by framework and component area
- Track finding lifecycle: `open` → `in_remediation` → `remediated` → `verified`
- Auto-calculated risk score (0-100) based on open findings
- Assign findings to team members with due dates

### Automated scanners
| Scanner | What it detects | CWE mapping |
|---------|----------------|-------------|
| **npm-audit** | Vulnerable dependencies | CWE-1035 (deprecated) |
| **Secret scanner** | AWS keys, GitHub tokens, private keys, JWT secrets, Stripe keys | CWE-798, CWE-321 |
| **Config scanner** | Weak NEXTAUTH_SECRET, missing KEK, wrong NODE_ENV | CWE-1188 |

### Evidence collection
- Audit log hash chain verification (SHA-256)
- User access review (all users, MFA status, last login)
- Permissions matrix (roles → permissions → user count)
- SHA-256 evidence manifest for tamper-evidence

### Compliance frameworks
| Framework | Controls | Coverage |
|-----------|----------|----------|
| ISO 27001 | 15 | A.5-A.18 |
| SOC 2 | 18 | CC1-CC9 |
| GDPR | 17 | Art. 5-35 |
| HIPAA | 16 | §164.308-312 |
| DoD 5015.02 | 15 | C2.1-C3.6 |
| Internal | 6 | INT-001-006 |

## API Endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `GET` | `/api/security-audit` | `security:audit.read` | List audits |
| `POST` | `/api/security-audit` | `security:audit.manage` | Create audit |
| `GET` | `/api/security-audit/:id` | `security:audit.read` | Get audit with findings |
| `PATCH` | `/api/security-audit/:id` | `security:audit.manage` | Update audit |
| `GET` | `/api/security-audit/:id/findings` | `security:audit.read` | List findings |
| `POST` | `/api/security-audit/:id/findings` | `security:audit.manage` | Create finding |
| `PATCH` | `/api/security-audit/:id/findings/:findingId` | `security:audit.manage` | Remediate finding |
| `POST` | `/api/security-audit/scan` | `security:scan.run` | Run automated scan |
| `GET` | `/api/security-audit/scan` | `security:audit.read` | List scan results |

## UI

- **Admin → Security Audit** — audit list with risk scores and finding counts
- **Audit detail** — findings management with remediate action and report export

## Environment Variables

```env
# Optional — directory for evidence collection output
SECURITY_AUDIT_EVIDENCE_DIR=/tmp/smartedms-evidence
```

## See Also

- [ADR-017: Security Audit Framework](./adr/017-security-audit-framework.md)
- [Security Architecture](./SECURITY.md) — threat model and controls
