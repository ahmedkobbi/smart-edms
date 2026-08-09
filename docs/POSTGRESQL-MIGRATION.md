# Smart EDMS — PostgreSQL Migration Guide

This guide covers migrating from SQLite (dev) to PostgreSQL (production) with
Row-Level Security (RLS) for defense-in-depth tenant isolation.

## 1. Provision PostgreSQL

```bash
# Using Docker
docker run -d \
  --name smartedms-postgres \
  -e POSTGRES_DB=smartedms \
  -e POSTGRES_USER=smartedms \
  -e POSTGRES_PASSWORD=<strong-password> \
  -p 5432:5432 \
  postgres:16-alpine

# Or using docker-compose
docker compose up -d postgres
```

## 2. Update environment

```bash
# .env (production)
DATABASE_URL=postgresql://smartedms:<password>@localhost:5432/smartedms?schema=public
```

## 3. Update Prisma datasource

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## 4. Push schema

```bash
npx prisma db push
# or create a migration
npx prisma migrate dev --name init
```

## 5. Apply Row-Level Security (RLS)

RLS ensures that even if a query forgets the `tenantId` filter, the database
itself blocks cross-tenant access. Run the SQL in `scripts/rls-policies.sql`.

## 6. Set tenant_id per request

In your API handler, set the PostgreSQL session variable before queries:

```typescript
await db.$executeRaw`SET LOCAL app.tenant_id = ${ctx.tenantId}`;
```

## 7. Seed production

```bash
SEED_ADMIN_EMAIL=admin@yourcompany.com \
SEED_ADMIN_PASSWORD=<strong-password> \
SEED_TENANT_NAME="Your Company" \
npm run seed
```

## 8. Verify

```bash
npm test
bun run scripts/test-isolation.ts
```

## Backup strategy

```bash
pg_dump $DATABASE_URL --no-owner --clean --if-exists | gzip > backup-$(date +%Y%m%d).sql.gz
gunzip -c backup-20250101.sql.gz | psql $DATABASE_URL
```
