/**
 * Admin-configurable rewards for the Agent / Activity ranking boards.
 *
 * Mirrors the State-Star reward model's safeguards (see state-ranking.service.ts):
 *   - super-admin sets reward tiers per board; ships DISABLED (no payout until enabled)
 *   - settled at period close by the leaderboard reset job, BEFORE the window resets
 *   - idempotent: a unique (board, period, periodDate, user) row + in-tx existence check
 *     means a re-run never double-pays
 *   - pays in Beans via the shared wallet ledger (creditBeansInTx)
 *
 * NOTE: the Agent board ranks by *lifetime* coins sold (no daily window exists), so a
 * daily payout would pay the same leaders every day. Agent settlement is intentionally a
 * no-op until a daily-delta source is added; its config row exists but stays disabled.
 */
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { creditBeansInTx } from '../wallet/wallet.service';
import { mergeAndRank, getActiveHouseEntries } from './house-entries.service';

export type RankingRewardTier = { rankMin: number; rankMax: number; amount: number };
export type RewardBoard = 'agent' | 'creator';
export type RewardPeriod = 'daily' | 'weekly' | 'monthly';

export const REWARD_BOARDS: readonly RewardBoard[] = ['agent', 'creator'];
export const REWARD_PERIODS: readonly RewardPeriod[] = ['daily', 'weekly', 'monthly'];

/** Hard ceiling: never pay beyond this many ranks regardless of how tiers are configured. */
const SETTLE_TOP_N = 100;

/** Reward amount for a 1-based rank from tiers, or 0 if no tier covers it. */
export function rewardForRank(rank: number, tiers: RankingRewardTier[]): number {
  for (const t of tiers) {
    if (rank >= t.rankMin && rank <= t.rankMax) return Math.max(0, Math.floor(t.amount));
  }
  return 0;
}

/** Coerce stored JSON into validated, well-formed tiers (drops malformed entries). */
export function parseTiers(json: unknown): RankingRewardTier[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter(
      (t): t is RankingRewardTier =>
        !!t &&
        typeof t === 'object' &&
        Number.isFinite((t as RankingRewardTier).rankMin) &&
        Number.isFinite((t as RankingRewardTier).rankMax) &&
        Number.isFinite((t as RankingRewardTier).amount),
    )
    .map((t) => ({ rankMin: Number(t.rankMin), rankMax: Number(t.rankMax), amount: Number(t.amount) }));
}

export async function getRankingRewardConfig(board: RewardBoard) {
  const existing = await prisma.rankingRewardConfig.findUnique({ where: { id: board } });
  if (existing) return existing;
  return prisma.rankingRewardConfig.create({
    data: { id: board, enabled: false, period: 'daily', rewardTiers: [], requireFaceVerification: true },
  });
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Top-N {id, score} for a board's CURRENT window (read before the reset clears it). */
async function readBoardTop(
  board: RewardBoard,
  period: RewardPeriod,
  limit: number,
): Promise<Array<{ id: string; score: number }>> {
  if (board === 'creator') {
    const raw = await redis.zrevrange(`leaderboard:creators:${period}`, 0, limit - 1, 'WITHSCORES');
    const out: Array<{ id: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ id: raw[i]!, score: Number(raw[i + 1]) });
    }
    return out;
  }
  return []; // agent — lifetime cumulative, no per-period window yet
}

/**
 * Credit Beans to the top rankers of `board` for the just-closed `period`. No-op unless the
 * board is enabled, configured for this period, and has tiers. Returns how many users paid.
 */
export async function settleRankingRewards(
  board: RewardBoard,
  period: RewardPeriod,
  periodDate: Date,
): Promise<number> {
  const config = await getRankingRewardConfig(board);
  if (!config.enabled || config.period !== period) return 0;

  if (board === 'agent') {
    console.warn('[ranking-rewards] agent board has no per-period window yet — skipping settlement');
    return 0;
  }

  const tiers = parseTiers(config.rewardTiers as unknown);
  if (tiers.length === 0) return 0;

  const maxRank = Math.min(SETTLE_TOP_N, Math.max(...tiers.map((t) => t.rankMax)));

  // Merge admin-seeded house entries so payouts follow the SAME displayed ranks users see.
  // House entries occupy ranks (pushing real users down → smaller payouts) but are NEVER paid.
  const house = await getActiveHouseEntries(board);
  const realTop = await readBoardTop(board, period, maxRank + house.length);
  const { entries } = mergeAndRank(
    realTop.map((e) => ({ userId: e.id, score: e.score })),
    house,
    maxRank,
  );
  if (entries.length === 0) return 0;

  let credited = 0;
  for (const entry of entries) {
    const amount = rewardForRank(entry.rank, tiers);
    if (amount <= 0) continue;
    if (entry.isHouse) continue; // house accounts occupy the rank but are never credited

    if (config.requireFaceVerification) {
      const user = await prisma.user.findUnique({
        where: { id: entry.userId },
        select: { faceVerificationStatus: true },
      });
      if (user?.faceVerificationStatus !== 'approved') continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.rankingReward.findUnique({
          where: { board_period_periodDate_userId: { board, period, periodDate, userId: entry.userId } },
        });
        if (existing) return; // already paid this period — idempotent

        const walletTx = await creditBeansInTx(
          tx,
          entry.userId,
          amount,
          `ranking_reward:${board}:${period}:${dateKey(periodDate)}:${entry.rank}`,
          `${board === 'creator' ? 'Activity' : 'Agent'} ranking reward — rank #${entry.rank}`,
        );

        await tx.rankingReward.create({
          data: {
            userId: entry.userId,
            board,
            period,
            periodDate,
            rank: entry.rank,
            score: Math.floor(entry.score),
            rewardAmount: amount,
            walletTxId: walletTx ? String(walletTx.id) : null,
          },
        });
      });
      credited++;
    } catch (err) {
      console.error(
        `[ranking-rewards] ${board}/${period} rank ${entry.rank} failed:`,
        (err as Error)?.message ?? err,
      );
    }
  }
  return credited;
}
