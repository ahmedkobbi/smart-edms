# ADR-011: Tenant scoping via application + RLS

**Status:** Accepted

## Context

Multi-tenant isolation must ensure:
- Tenant A cannot read Tenant B's data
- Even if application code has a bug (missing `WHERE tenantId = ?`), the database blocks the leak
- Cross-tenant access attempts are logged and alerted

## Decision

Implement **defense-in-depth tenant isolation**:

### Layer 1: Application-level scoping (always)
- Every Prisma query includes `tenantId` in the `WHERE` clause
- `createApiHandler` binds `ctx.tenantId` from the JWT session
- Cross-tenant isolation tests (`scripts/test-isolation.ts`) verify this layer

### Layer 2: Row-Level Security (PostgreSQL only)
- RLS policies on all 40+ tenant-scoped tables
- Policy: `USING ("tenantId" = current_tenant_id())`
- The `app.tenant_id` session variable is set per request via `SET LOCAL`
- Even if a query omits `tenantId`, RLS blocks cross-tenant access

## Consequences

### Positive
- Two independent layers — application bug alone can't leak data
- RLS is enforced at the database engine level — can't be bypassed by application code
- Test suite verifies both layers
- Auditors can verify RLS policies are in place via SQL queries

### Negative
- RLS only works on PostgreSQL (SQLite dev has application-level only)
- `SET LOCAL app.tenant_id` adds one round-trip per request (mitigated by connection pooling)
- RLS policies must be maintained as schema changes

## Implementation

```sql
-- Enable RLS
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY tenant_isolation ON "Document"
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
```

```typescript
// Per-request: set tenant context
await db.$executeRaw`SET LOCAL app.tenant_id = ${ctx.tenantId}`;
```

## Alternatives considered

- **Application-only scoping**: Simpler, but a single missing `WHERE` clause leaks all tenants
- **Separate database per tenant**: Strongest isolation, but operationally expensive at scale
- **Schema-per-tenant**: Middle ground, but schema migrations become complex
