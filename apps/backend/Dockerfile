FROM node:20-slim AS base

WORKDIR /app

# Install OpenSSL (required by Prisma on Debian slim)
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# ── builder stage ──────────────────────────────────────────────────────────
FROM base AS builder

COPY . .
RUN npm run build

# ── production stage ───────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/admin-dist ./admin-dist

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "node dist/scripts/prisma-recover.js && npx prisma migrate deploy && node dist/server.js"]
