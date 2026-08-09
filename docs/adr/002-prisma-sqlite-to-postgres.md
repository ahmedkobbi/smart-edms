# ADR-002: Prisma ORM with SQLite (dev) → PostgreSQL (prod)

**Status:** Accepted

## Context

Smart EDMS needs a type-safe ORM that:
- Works for local development without external dependencies
- Scales to PostgreSQL for production
- Supports complex multi-table queries with type inference
- Enables schema-first migrations

## Decision

Use **Prisma 6 ORM** with **SQLite for development** and **PostgreSQL for production**.

The schema is portable — only the `datasource provider` changes:
```prisma
// Dev
datasource db { provider = "sqlite" }

// Prod
datasource db { provider = "postgresql" }
```

## Consequences

### Positive
- Zero-config local development (SQLite file)
- Type-safe queries end-to-end
- Schema-as-source-of-truth with `prisma db push`
- PostgreSQL RLS policies add defense-in-depth

### Negative
- SQLite lacks `BigInt` support (worked around with `BigInt` type + `Number()` in API)
- Some Prisma queries differ between SQLite/PostgreSQL (e.g., `groupBy`)
- No native full-text search in SQLite (uses `contains` — less efficient)

## Alternatives considered

- **Drizzle ORM**: Lighter, but less mature tooling
- **Raw SQL with pg-typed**: Maximum control, but loses type safety
- **MongoDB**: Document model fits EDMS, but RLS + transactions are weaker
