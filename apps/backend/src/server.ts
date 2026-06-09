// Load env validation before anything else.
import './config/env';

import http from 'http';
import bcrypt from 'bcryptjs';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { initSocketServer } from './sockets';
import { startLeaderboardResetJobs } from './jobs/leaderboard-reset.job';
import { startCurrencySyncJob } from './jobs/currency-sync.job';
import { startSpecialIdExpiryJob } from './jobs/special-id-expiry.job';
import { startCalculatorCleanupJob } from './jobs/calculator-cleanup.job';
import { startBanExpiryJob } from './jobs/ban-expiry.job';
import { ROLE_PERMISSIONS } from './shared-types/roles';

const PORT = parseInt(env.PORT, 10);

/**
 * Auto-seed the initial admin user if none exists.
 * Safe to run on every startup — skips if admin already present.
 */
async function seedAdmin() {
  const email = env.ADMIN_INITIAL_EMAIL;
  const password = env.ADMIN_INITIAL_PASSWORD;

  const existing = await prisma.adminUser.findFirst();
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: { email, passwordHash, displayName: 'Super Admin', role: 'super_admin', roles: ['super_admin'] },
  });
  console.log(`🔑 Initial admin seeded: ${email}`);
}

const PNG_TAG_NAMES = new Set(['super_admin', 'admin', 'cs', 'bd', 'bdm']);

function tagIconUrl(name: string): string {
  const ext = PNG_TAG_NAMES.has(name) ? 'png' : 'svg';
  return `/tag-icons/${name}.${ext}`;
}

const BUILT_IN_TAGS = [
  { name: 'super_admin', displayName: 'Super Admin', color: '#F59E0B', sortOrder: 0 },
  { name: 'admin',       displayName: 'Admin',       color: '#7B4FFF', sortOrder: 1 },
  { name: 'cs',          displayName: 'CS',          color: '#8B5CF6', sortOrder: 2 },
  { name: 'moderator',   displayName: 'Moderator',   color: '#3B82F6', sortOrder: 3 },
  { name: 'assistant',   displayName: 'Assistant',   color: '#6B7280', sortOrder: 4 },
  { name: 'operator',    displayName: 'Operator',    color: '#10B981', sortOrder: 5 },
  { name: 'bd',          displayName: 'BD',          color: '#0EA5E9', sortOrder: 6 },
  { name: 'bdm',         displayName: 'BDM',         color: '#059669', sortOrder: 7 },
];

async function seedAdminTags() {
  for (const tag of BUILT_IN_TAGS) {
    await prisma.adminTag.upsert({
      where: { name: tag.name },
      update: {
        displayName: tag.displayName,
        color: tag.color,
        iconUrl: tagIconUrl(tag.name),
        permissions: ROLE_PERMISSIONS[tag.name] ?? [],
        isBuiltIn: true,
        sortOrder: tag.sortOrder,
      },
      create: {
        name: tag.name,
        displayName: tag.displayName,
        color: tag.color,
        iconUrl: tagIconUrl(tag.name),
        permissions: ROLE_PERMISSIONS[tag.name] ?? [],
        isBuiltIn: true,
        sortOrder: tag.sortOrder,
      },
    });
  }
}

async function bootstrap() {
  // Verify DB connectivity on startup.
  await prisma.$connect();
  console.log('✅ Database connected');

  // Auto-seed admin user if none exists (non-fatal)
  await seedAdmin().catch((err) => {
    console.warn('⚠️  Admin seed skipped (will retry next deploy):', err.message);
  });

  // Seed built-in admin tags (non-fatal, idempotent)
  await seedAdminTags().catch((err) => {
    console.warn('⚠️  Admin tags seed skipped:', err.message);
  });

  // Create HTTP server and attach Socket.io
  const server = http.createServer(app);
  initSocketServer(server);

  // Schedule leaderboard resets (daily / weekly / monthly)
  if (env.ENABLE_SCHEDULER === 'true') {
    startLeaderboardResetJobs();

    // Seed + daily sync of FX currency rates
    startCurrencySyncJob();

    // Hourly sweep for expired Special IDs
    startSpecialIdExpiryJob();

    // Minute-by-minute sweep for expired Calculator sessions
    startCalculatorCleanupJob();

    // Per-minute sweep that auto-expires temporary bans + device bans
    startBanExpiryJob();
  }

  server.listen(PORT, () => {
    console.log(`🚀 Haka Live API running on port ${PORT} [${env.NODE_ENV}]`);
    console.log(`📄 Swagger docs: http://localhost:${PORT}/api/docs`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
