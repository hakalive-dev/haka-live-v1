import { execSync } from 'child_process';
import { Client } from 'pg';

/**
 * Jest globalSetup: runs ONCE before any test file.
 * 1. Ensures the test database exists.
 * 2. Applies all Prisma migrations.
 * 3. Seeds reference tables (gifts catalogue, tiers, bonus singleton).
 *
 * Uses TEST_DATABASE_URL if set, else a local docker-compose default.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.SKIP_TEST_GLOBAL_SETUP === '1') {
    process.stderr.write('[jest] SKIP_TEST_GLOBAL_SETUP=1 — skipping migrate deploy and prisma seed\n');
    return;
  }

  const url = process.env.TEST_DATABASE_URL
    ?? 'postgresql://hakalive:hakalive@localhost:5433/hakalive_test';
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  // Ensure the test DB exists. Always close the admin connection, even on error,
  // so a failing CREATE DATABASE doesn't stall Jest with a dangling pg socket.
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  // Apply migrations + seed against the test DB.
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx ts-node prisma/seed.ts',  { stdio: 'inherit', env });
}
