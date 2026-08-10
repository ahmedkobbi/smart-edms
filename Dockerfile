# Smart EDMS — Production Dockerfile
# Multi-stage build for minimal final image

# --- Dependencies stage ---
FROM node:20-slim AS deps
WORKDIR /app

# Install system dependencies for argon2 + sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libvips-dev \
    tesseract-ocr \
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

# Build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Runner stage ---
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
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

# Create storage directory
RUN mkdir -p /app/storage /app/db && chown -R smartedms:smartedms /app/storage /app/db

USER smartedms

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
