import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error.middleware';

export type RiskFlag = 'freezeCoins' | 'freezeBeans' | 'disableGifts' | 'disableGames' | 'blockChat';

const FLAG_MESSAGES: Record<RiskFlag, string> = {
  freezeCoins:  'Your coin spending has been temporarily frozen. Please contact support.',
  freezeBeans:  'Your bean balance has been temporarily frozen. Please contact support.',
  disableGifts: 'Your ability to send gifts has been temporarily restricted.',
  disableGames: 'Your access to games has been temporarily restricted.',
  blockChat:    'Your chat access has been temporarily restricted.',
};

/**
 * Throws AppError(403) if the user has an active AccountRisk record with
 * any of the specified flags set to true.
 *
 * Call this at the start of any action that should be blocked by risk control.
 * The query is a single indexed lookup — cheap to run before any business logic.
 */
export async function assertNoRiskBlock(userId: string, ...flags: RiskFlag[]): Promise<void> {
  const risk = await prisma.accountRisk.findFirst({
    where: {
      userId,
      isActive: true,
      releasedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: {
      freezeCoins:  true,
      freezeBeans:  true,
      disableGifts: true,
      disableGames: true,
      blockChat:    true,
    },
  });

  if (!risk) return;

  for (const flag of flags) {
    if (risk[flag]) {
      throw new AppError(FLAG_MESSAGES[flag], 403);
    }
  }
}
