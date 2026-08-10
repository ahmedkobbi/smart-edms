# Smart EDMS — Production Dockerfile
# Multi-stage build for minimal final image
#
# Includes:
#   - Node.js 20 (LTS)
#   - Tesseract OCR (eng, ara, fra, spa, deu)
#   - libvips (sharp image processing)
#   - dumb-init (PID 1 signal handling)
#   - undici (SSRF DNS pinning — bundled in Node 20+, explicit dep for Agent API)
#   - Non-root user (smartedms)
#   - Health check via /api/health
#   - Standalone Next.js build (minimal server.js)

# --- Dependencies stage ---
FROM node:20-slim AS deps
WORKDIR /app

# Install system dependencies for argon2 + sharp + tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libvips-dev \
    tesseract-ocr \
    tesseract-ocr-ara \
    tesseract-ocr-fra \
    tesseract-ocr-spa \
    tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install dependencies using npm (more portable than bun in Docker)
RUN npm install --frozen-lockfile || npm install

# --- Build stage ---
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Generate PWA app icons from logo.svg
RUN npx bun run scripts/generate-icons.ts || true

# Build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Runner stage ---
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-ara \
    tesseract-ocr-fra \
    tesseract-ocr-spa \
    tesseract-ocr-deu \
    libvips42 \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r smartedms && useradd -r -g smartedms -s /bin/bash smartedms

# Copy standalone build
COPY --from=builder --chown=smartedms:smartedms /app/.next/standalone ./
COPY --from=builder --chown=smartedms:smartedms /app/.next/static ./.next/static
COPY --from=builder --chown=smartedms:smartedms /app/public ./public
COPY --from=builder --chown=smartedms:smartedms /app/prisma ./prisma
COPY --from=builder --chown=smartedms:smartedms /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=smartedms:smartedms /app/node_modules/@prisma ./node_modules/@prisma
# SECURITY: undici is required for SSRF DNS pinning (ssrf-safe-fetch.ts)
COPY --from=builder --chown=smartedms:smartedms /app/node_modules/undici ./node_modules/undici

# Create storage directory
RUN mkdir -p /app/storage /app/db && chown -R smartedms:smartedms /app/storage /app/db

USER smartedms

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check — verifies the app is serving and DB is connected
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
