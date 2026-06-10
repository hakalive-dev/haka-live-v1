import { PrismaClient } from '@prisma/client';

// Singleton — prevents multiple PrismaClient instances in dev (hot reload).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function buildDatabaseUrl(): string {
  let url = process.env.DATABASE_URL ?? '';
  const params = new URLSearchParams(
    url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
  );
  const base = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;

  // Supabase / PgBouncer pooler (port 6543): Prisma needs pgbouncer=true in transaction mode.
  const usesPooler =
    base.includes(':6543/') ||
    base.includes('.pooler.supabase.com') ||
    process.env.DATABASE_USE_POOLER === 'true';
  if (usesPooler && !params.has('pgbouncer')) {
    params.set('pgbouncer', 'true');
  }

  // Keep per-process pool small — total slots = limit × (API instances + worker).
  // Override with PRISMA_CONNECTION_LIMIT (e.g. "5" on Render + Supabase pooler).
  if (!params.has('connection_limit')) {
    const fromEnv = process.env.PRISMA_CONNECTION_LIMIT;
    const limit =
      fromEnv && /^\d+$/.test(fromEnv)
        ? fromEnv
        : process.env.NODE_ENV === 'production'
          ? '5'
          : '10';
    params.set('connection_limit', limit);
  }

  if (!params.has('pool_timeout')) {
    params.set('pool_timeout', '15');
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
