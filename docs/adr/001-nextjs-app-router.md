# ADR-001: Use Next.js 16 App Router

**Status:** Accepted
**Date:** 2025-01-01

## Context

Smart EDMS needs a full-stack framework that supports:
- Server-side rendering for initial page load performance
- API routes co-located with the frontend
- TypeScript throughout
- Edge runtime compatibility for future deployment flexibility
- Strong ecosystem and long-term support

## Decision

Use **Next.js 16 with App Router** as the full-stack framework.

## Consequences

### Positive
- Single codebase for frontend + API (no separate backend service)
- Server Components reduce client bundle size
- App Router enables streaming and nested layouts
- Built-in middleware for auth + security headers
- Standalone output mode for minimal Docker images

### Negative
- App Router is newer — some third-party libraries have compatibility gaps
- Turbopack (default bundler) has occasional dev-time issues
- Vercel-optimized features (Edge Functions) need adaptation for self-hosting

## Alternatives considered

- **Remix**: Excellent data loading, but smaller ecosystem and less SSR maturity
- **SvelteKit**: Fast, but TypeScript ecosystem smaller than React
- **Separate frontend (React/Vite) + backend (Fastify/NestJS)**: More flexible but doubles deployment complexity
