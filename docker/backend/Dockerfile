# syntax=docker/dockerfile:1.4
# Build context: apps/backend/

FROM node:20-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY package.json package-lock.json ./
# Cache mount: resume partial downloads on retry. npm ci: exact tree from lockfile (fewer round-trips than npm install).
# ECONNRESET is still fundamentally a network/registry issue — if this keeps failing, try another network, VPN off, or Docker DNS (see CLAUDE.md / compose comments).
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 15 \
    && npm config set fetch-retry-mintimeout 30000 \
    && npm config set fetch-retry-maxtimeout 300000 \
    && npm config set fetch-timeout 900000 \
    && npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ── development stage ──────────────────────────────────────────────────────────
FROM base AS development

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── backend builder stage ─────────────────────────────────────────────────────
FROM base AS builder

COPY . .
RUN npx tsc

# Embed admin SPA inside dist/ so it travels with the one COPY that we know works
RUN cp -r ./admin-dist ./dist/admin-dist

# ── production stage ───────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 15 \
    && npm config set fetch-retry-mintimeout 30000 \
    && npm config set fetch-retry-maxtimeout 300000 \
    && npm config set fetch-timeout 900000 \
    && npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

# Single copy from builder — dist/ now contains both compiled JS and admin-dist/
COPY --from=builder /app/dist ./dist

RUN test -f ./dist/admin-dist/index.html || \
    (echo "BUILD FAILED: dist/admin-dist/index.html missing" && exit 1)

EXPOSE 3000

# API: migrate then HTTP. For a separate worker dyno use: `node dist/scripts/prisma-recover.js && npx prisma migrate deploy && node dist/worker.js`
CMD ["sh", "-c", "node dist/scripts/prisma-recover.js && npx prisma migrate deploy && node dist/server.js"]
