# ADR-007: RBAC + ABAC hybrid authorization

**Status:** Accepted

## Context

Authorization must support:
- **Roles** (RBAC): coarse-grained permissions (admin, user, viewer)
- **Contextual rules** (ABAC): e.g., "deny download of HS documents outside business hours"
- **Relationships** (ReBAC): e.g., "user can edit documents they own"
- **Deny-by-default**: explicit allow required

## Decision

Implement a **hybrid RBAC + ABAC** model:

### Layer 1: RBAC (roles + permissions)
- 6 system roles: `tenant_admin`, `records_manager`, `security_officer`, `compliance_auditor`, `end_user`, `viewer`
- Custom roles with granular permission lists (`domain:action` format)
- Wildcard support: `document:*` matches `document:read`, `document:write`, etc.
- Global wildcard `*` matches everything

### Layer 2: ABAC (policies)
- Allow/deny rules with priority ordering (higher priority evaluated first)
- Conditions: classification, tags, time-of-day, IP range, device trust
- Deny wins at the same priority level
- Applied server-side on every API route via `createApiHandler`

### Enforcement
Every API route declares `requiredPermission`. The handler:
1. Checks session is authenticated
2. Checks `hasPermission(session.permissions, requiredPermission)`
3. Evaluates applicable ABAC policies
4. Audit-logs both allow AND deny decisions

## Consequences

### Positive
- Familiar RBAC model for simple cases
- ABAC handles complex contextual rules without code changes
- Policies are data (not code) — admins can modify without deployment
- Full audit trail of authorization decisions

### Negative
- Two systems to understand (roles + policies)
- Policy evaluation adds latency (~1-2ms per request)
- Debugging "why was this denied?" requires checking both layers

## Alternatives considered

- **RBAC only**: Simple, but can't express contextual rules (e.g., "HS docs not downloadable at night")
- **ABAC only**: Flexible, but harder to administer for simple role-based access
- **ReBAC (Google Zanzibar-style)**: Powerful for relationships, but adds significant complexity
