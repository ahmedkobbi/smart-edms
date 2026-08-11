# ADR-020: DoD 5015.02 Records Management

## Status

Accepted

## Date

2026-08-11

## Context

The U.S. Department of Defense 5015.02-STD ("Electronic Records Management
Software Applications Design Criteria Standard") is the de facto standard for
records management software in government and regulated industries. While
Smart EDMS is an Algerian project, many potential enterprise customers —
particularly in defense, aerospace, and government sectors — require DoD
5015.02 compliance as a procurement prerequisite.

Smart EDMS already had several records management capabilities:
- Document lifecycle (draft → active → record → archived → disposed)
- Retention schedules
- Legal hold
- Disposition records
- Version control with checksums
- Tamper-evident audit log
- Full-text search
- Redaction

But these capabilities were not organized into a formal DoD 5015.02 file plan
structure, and there was no compliance reporting.

## Decision

Implement a DoD 5015.02 records management layer on top of the existing
document infrastructure.

### 1. Data model (4 Prisma models)
- `RecordCategory` — hierarchical file plan (parent/child, disposition, retention, vital flag)
- `RecordFolder` — time-bounded folders within categories (fiscal year, date range, cutoff, dispose)
- `VitalRecord` — designation for essential/important/useful records with backup verification
- `DispositionAuthority` — the legal basis for retention (NARA GRS, NARA SF, agency-specific, court order)

### 2. File plan hierarchy
- Record categories support parent/child relationships (infinite depth)
- Each category has a disposition (permanent | temporary | unscheduled)
- Retention: active years + semi-active years + disposition action (destroy | transfer)
- Folders are time-bounded (fiscal year, date range) and cut off before disposition

### 3. Folder lifecycle
```
open → cutoff → disposed
                ├── destroyed
                └── transferred
```
- Legal hold blocks disposition (checked before dispose)
- Step-up auth required for cutoff and dispose actions
- Disposition records created for audit trail

### 4. Vital records
- Three types: essential (priority 1), important (priority 2-3), useful (priority 4-5)
- Review cycles (default 12 months) with due-for-review dashboard
- Backup verification tracking
- Four reasons: operational, legal, financial, historical

### 5. Compliance reporting
- 15 DoD 5015.02 requirements mapped (C2.1-C2.9 core, C3.1-C3.6 optional)
- Each requirement has: title, description, implementation status, evidence
- JSON compliance report endpoint for auditors

### 6. Disposition authorities
- Four types: NARA General Records Schedules, NARA Standard Forms, agency-specific, court orders
- Retention instructions as JSON (active years, semi-active years, disposition action)
- Approval workflow (approvedBy, approvedAt)

## Consequences

### Positive
- Opens government/defense/aerospace market (DoD 5015.02 is a procurement gate)
- Formalizes existing records capabilities into a recognized framework
- Compliance dashboard provides executive-level visibility
- Vital records tracking ensures business continuity
- Disposition authorities provide legal defensibility

### Negative
- DoD 5015.02 is U.S.-centric (may not map cleanly to other countries' frameworks)
- Full DoD 5015.02 certification requires an external audit (this implementation
  provides the functional requirements but not the certification)
- The compliance report is JSON-only (PDF generation is future work)

## Alternatives Considered

1. **Skip DoD 5015.02** — closes government/defense market
2. **Integrate an external RM tool** — adds operational complexity, licensing cost
3. **Implement only core requirements (C2.x)** — leaves gaps vs. competitors

## Future Work

- DoD 5015.02 formal certification (requires external audit)
- PDF compliance report generation
- File plan import/export (XML, CSV)
- Automated disposition cron job
- Vital record review notification emails
