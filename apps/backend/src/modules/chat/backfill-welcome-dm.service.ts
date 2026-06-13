import { prisma } from '../../config/prisma';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { sendWelcomeDm } from './haka-team-welcome.service';

export const WELCOME_DM_BACKFILL_PREFIX = 'Welcome to Haka Live!';

export type WelcomeDmBackfillOptions = {
  dryRun?: boolean;
  /** When false (default), inbox only — no push/in-app notify. */
  notify?: boolean;
  limit?: number;
};

export type WelcomeDmBackfillResult = {
  onboardedCount: number;
  alreadySentCount: number;
  candidateCount: number;
  sent: number;
  failed: number;
};

export async function runWelcomeDmBackfill(
  opts: WelcomeDmBackfillOptions = {},
): Promise<WelcomeDmBackfillResult> {
  const { dryRun = false, notify = false, limit } = opts;
  const hakaTeamId = getHakaTeamUserId();

  const [onboardedUsers, existingWelcome] = await Promise.all([
    prisma.user.findMany({
      where: {
        onboardingComplete: true,
        deletedAt: null,
        id: { not: hakaTeamId },
      },
      select: { id: true, displayName: true, username: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.directMessage.findMany({
      where: {
        senderId: hakaTeamId,
        content: { startsWith: WELCOME_DM_BACKFILL_PREFIX },
      },
      select: { recipientId: true },
      distinct: ['recipientId'],
    }),
  ]);

  const alreadySent = new Set(existingWelcome.map((r) => r.recipientId));
  let candidates = onboardedUsers.filter((u) => !alreadySent.has(u.id));
  if (limit) candidates = candidates.slice(0, limit);

  let sent = 0;
  let failed = 0;

  for (const user of candidates) {
    if (dryRun) {
      sent++;
      continue;
    }

    try {
      await sendWelcomeDm(user.id, { skipRecipientNotify: !notify });
      sent++;
    } catch {
      failed++;
    }
  }

  return {
    onboardedCount: onboardedUsers.length,
    alreadySentCount: alreadySent.size,
    candidateCount: candidates.length,
    sent,
    failed,
  };
}
