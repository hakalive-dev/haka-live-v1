import { PrismaClient } from '@prisma/client';

// Singleton — prevents multiple PrismaClient instances in dev (hot reload).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function buildDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? '';
  // Append Prisma connection pool params if not already present.
  // connection_limit=20  — enough headroom for concurrent API + socket handlers
  // pool_timeout=15      — fail fast when pool is exhausted instead of waiting indefinitely
  if (url.includes('connection_limit=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=20&pool_timeout=15`;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
