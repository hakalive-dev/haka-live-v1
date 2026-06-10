import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { creditCoinsInTransaction } from '../wallet/wallet.service';
import { notifyAccountAlert } from '../notifications/notifications.service';
import { resolveUserId } from '../users/users.service';
import {
  getLeaderboard,
  getWeeklyPeriodStart,
  KEYS,
  sumLeaderboardScores,
  updateInviteScore,
} from '../leaderboard/leaderboard.service';

const DEFAULT_INVITE_REWARD_COINS = 100;

/** Stored `code` is `referralId:inviteeId` for uniqueness; expose referral id to clients. */
export function referralCodeFromStoredCode(stored: string): string {
  const sep = stored.lastIndexOf(':');
  return sep === -1 ? stored : stored.slice(0, sep);
}

function storedInviteCode(referralId: string, inviteeId: string): string {
  return `${referralId}:${inviteeId}`;
}

function shareholderBonusForScore(
  score: number,
  totalPoints: number,
  pool: number,
): number {
  if (totalPoints <= 0 || pool <= 0 || score <= 0) return 0;
  return Math.floor((score / totalPoints) * pool);
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a new invite code for the inviter.
 * One active code per inviter is fine — creates a new one each call.
 */
export async function generateInviteCode(inviterId: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Ensure code uniqueness
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 10) throw new AppError('Failed to generate unique code', 500);
  } while (await prisma.inviteCode.findUnique({ where: { code } }));

  return prisma.inviteCode.create({
    data: {
      inviterId,
      code,
      expiresAt,
    },
  });
}

/**
 * Accept an invite by inviter public id (Haka ID or active Special ID).
 * Credits inviter and records a new accepted invite row.
 */
export async function acceptInvite(referralId: string, inviteeId: string) {
  const normalized = referralId.trim();
  if (!normalized) throw new AppError('Haka ID is required', 400);

  const inviterId = await resolveUserId(normalized);

  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { id: true, onboardingComplete: true },
  });
  if (!inviter?.onboardingComplete) {
    throw new AppError('User not found', 404);
  }

  if (inviterId === inviteeId) {
    throw new AppError('You cannot accept your own invite', 400);
  }

  const rewardCoins = DEFAULT_INVITE_REWARD_COINS;
  const code = storedInviteCode(normalized, inviteeId);

  const { result } = await creditCoinsInTransaction({
    userId: inviterId,
    amount: rewardCoins,
    reference: 'invite_reward',
    description: `Invite reward: ${rewardCoins} coins for invite from ${normalized}`,
    timeout: 15_000,
    runInTransaction: async (tx) => {
      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM invite_codes WHERE "inviteeId" = ${inviteeId} FOR UPDATE
      `;
      if (existing.length > 0) {
        throw new AppError('You have already used an invite code', 400);
      }

      return tx.inviteCode.create({
        data: {
          inviterId,
          inviteeId,
          code,
          status: 'accepted',
          rewardClaimed: true,
          rewardCoins,
        },
        include: {
          inviter: { select: { id: true, displayName: true, avatar: true } },
          invitee: { select: { id: true, displayName: true, avatar: true } },
        },
      });
    },
  });

  updateInviteScore(result.inviterId, 1).catch((err) => {
    console.error('invite leaderboard update failed:', err?.message ?? err);
  });

  // Real-time: notify the inviter that their invite was accepted. notifyAccountAlert
  // writes the in-app notification, sends the FCM push, AND emits `notification:new`
  // (type `invite_accepted`) over the socket — the mobile client refreshes the wallet
  // + invite stats off that event. Best-effort — never block the accept transaction.
  const inviteeName = result.invitee?.displayName?.trim() || 'Someone';
  notifyAccountAlert(
    result.inviterId,
    'invite_accepted',
    'Invite accepted 🎉',
    `${inviteeName} joined with your invite. You earned ${rewardCoins} coins!`,
    { type: 'invite_accepted', inviteeDisplayName: inviteeName, rewardCoins },
  ).catch((err) => {
    console.error('invite accepted notification failed:', err?.message ?? err);
  });

  return {
    ...result,
    code: referralCodeFromStoredCode(result.code),
  };
}

/**
 * Get paginated invite codes sent by a user.
 */
export async function getMyInvites(userId: string, page: number, limit: number) {
  const where = { inviterId: userId };
  const [rows, total] = await Promise.all([
    prisma.inviteCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        invitee: {
          select: { id: true, username: true, displayName: true, avatar: true, hakaId: true },
        },
      },
    }),
    prisma.inviteCode.count({ where }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    code: referralCodeFromStoredCode(row.code),
  }));

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Get invite summary stats for a user.
 */
export async function getSummary(userId: string) {
  const [totalInvites, acceptedInvites] = await Promise.all([
    prisma.inviteCode.count({ where: { inviterId: userId } }),
    prisma.inviteCode.count({ where: { inviterId: userId, status: 'accepted' } }),
  ]);

  const rewardResult = await prisma.inviteCode.aggregate({
    where: { inviterId: userId, status: 'accepted', rewardClaimed: true },
    _sum: { rewardCoins: true },
  });

  return {
    totalInvites,
    acceptedInvites,
    totalCoinsEarned: rewardResult._sum.rewardCoins ?? 0,
  };
}

/**
 * Weekly invite shareholder board: leaderboard ranks, total invite points,
 * and proportional share of coins credited for accepted invites this week.
 */
export async function getShareholderRewards(page: number, limit: number) {
  const weekStart = getWeeklyPeriodStart();

  const [leaderboard, totalPoints, poolResult] = await Promise.all([
    getLeaderboard(KEYS.INVITES_WEEKLY, page, limit),
    sumLeaderboardScores(KEYS.INVITES_WEEKLY),
    prisma.inviteCode.aggregate({
      where: {
        status: 'accepted',
        updatedAt: { gte: weekStart },
      },
      _sum: { rewardCoins: true },
    }),
  ]);

  const shareholderBonusPool = poolResult._sum.rewardCoins ?? 0;

  const items = leaderboard.items.map((entry) => ({
    rank: entry.rank,
    score: entry.score,
    shareholderBonus: shareholderBonusForScore(
      entry.score,
      totalPoints,
      shareholderBonusPool,
    ),
    user: entry.user,
  }));

  return {
    period: 'weekly' as const,
    totalPoints,
    shareholderBonusPool,
    items,
    page: leaderboard.page,
    limit: leaderboard.limit,
    hasMore: leaderboard.hasMore,
    total: leaderboard.total,
  };
}
