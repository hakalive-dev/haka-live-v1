import { PrismaClient } from '@prisma/client';

type PrismaMigrationsRow = {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
};

type RecoveryRule =
  | {
      migrationName: string;
      action: 'mark_applied';
      reason: string;
      precondition: (prisma: PrismaClient) => Promise<boolean>;
    }
  | {
      migrationName: string;
      action: 'mark_rolled_back';
      reason: string;
      precondition: (prisma: PrismaClient) => Promise<boolean>;
    };

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  return (
    (
      await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
      ) as "exists"
    `
    )?.[0]?.exists ?? false
  );
}

async function columnExists(
  prisma: PrismaClient,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  return (
    (
      await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
      ) as "exists"
    `
    )?.[0]?.exists ?? false
  );
}

const RECOVERY_RULES: RecoveryRule[] = [
  {
    migrationName: '20260508185200_add_room_members',
    action: 'mark_applied',
    reason: 'room_members already exists',
    precondition: (prisma) => tableExists(prisma, 'room_members'),
  },
  {
    migrationName: '20260609120000_admin_password_snapshot',
    action: 'mark_rolled_back',
    reason: 'admin_users.passwordSnapshot was never added (failed on wrong table name)',
    precondition: async (prisma) => !(await columnExists(prisma, 'admin_users', 'passwordSnapshot')),
  },
];

async function getFailedMigration(
  prisma: PrismaClient,
  migrationName: string,
): Promise<PrismaMigrationsRow | null> {
  const row = (
    await prisma.$queryRaw<PrismaMigrationsRow[]>`
      SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations"
      WHERE migration_name = ${migrationName}
      ORDER BY started_at DESC
      LIMIT 1
    `
  )?.[0];

  if (!row) return null;

  const isFailed = row.finished_at === null && row.rolled_back_at === null && !!row.started_at;
  return isFailed ? row : null;
}

async function applyRecovery(prisma: PrismaClient, rule: RecoveryRule): Promise<void> {
  const failed = await getFailedMigration(prisma, rule.migrationName);
  if (!failed) return;

  const shouldRecover = await rule.precondition(prisma);
  if (!shouldRecover) return;

  const logLine = `\n[auto-recover] ${rule.action} ${rule.migrationName}: ${rule.reason}.\n`;

  if (rule.action === 'mark_applied') {
    await prisma.$executeRaw`
      UPDATE "_prisma_migrations"
      SET finished_at = NOW(),
          applied_steps_count = GREATEST(applied_steps_count, 1),
          logs = COALESCE(logs, '') || ${logLine}
      WHERE migration_name = ${rule.migrationName}
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "_prisma_migrations"
    SET rolled_back_at = NOW(),
        logs = COALESCE(logs, '') || ${logLine}
    WHERE migration_name = ${rule.migrationName}
      AND finished_at IS NULL
      AND rolled_back_at IS NULL
  `;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    for (const rule of RECOVERY_RULES) {
      await applyRecovery(prisma, rule);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // If this script fails, we want deploy to fail rather than masking real migration issues.
  // eslint-disable-next-line no-console
  console.error('[prisma-recover] failed', err);
  process.exit(1);
});
