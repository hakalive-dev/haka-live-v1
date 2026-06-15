import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';
import { prisma } from '../../../config/prisma';
import { ok } from '../../../utils/response';
import { AppError } from '../../../middleware/error.middleware';
import {
  getRankingRewardConfig,
  parseTiers,
  REWARD_BOARDS,
  REWARD_PERIODS,
  type RewardBoard,
} from '../../leaderboard/ranking-rewards.service';
import {
  listHouseEntries,
  upsertHouseEntry,
  setHouseEntryActive,
  deleteHouseEntry,
  isHouseBoard,
  type HouseBoard,
} from '../../leaderboard/house-entries.service';
import type { Prisma } from '@prisma/client';

const router = Router();
const superAdmin = requireAdminRole('super_admin');

function boardParam(value: string): RewardBoard {
  if (!(REWARD_BOARDS as readonly string[]).includes(value)) {
    throw new AppError('Unknown ranking board', 404);
  }
  return value as RewardBoard;
}

/** GET /admin/ranking-rewards/:board/config — the reward config for a board. */
router.get('/:board/config', superAdmin, async (req, res, next) => {
  try {
    const row = await getRankingRewardConfig(boardParam(req.params.board));
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

/** PATCH /admin/ranking-rewards/:board/config — update enable/period/tiers/eligibility. */
router.patch('/:board/config', superAdmin, async (req, res, next) => {
  try {
    const board = boardParam(req.params.board);
    const { enabled, period, rewardTiers, requireFaceVerification } = req.body as Record<string, unknown>;

    if (period !== undefined && !(REWARD_PERIODS as readonly string[]).includes(String(period))) {
      throw new AppError('Invalid period', 400);
    }
    // Validate/normalize tiers before persisting so a malformed payload can't poison payouts.
    const normalizedTiers =
      rewardTiers !== undefined ? parseTiers(rewardTiers) : undefined;

    const row = await prisma.rankingRewardConfig.upsert({
      where: { id: board },
      create: {
        id: board,
        enabled: Boolean(enabled ?? false),
        period: period !== undefined ? String(period) : 'daily',
        rewardTiers: (normalizedTiers ?? []) as unknown as Prisma.InputJsonValue,
        requireFaceVerification: Boolean(requireFaceVerification ?? true),
      },
      update: {
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(period !== undefined ? { period: String(period) } : {}),
        ...(normalizedTiers !== undefined
          ? { rewardTiers: normalizedTiers as unknown as Prisma.InputJsonValue }
          : {}),
        ...(requireFaceVerification !== undefined
          ? { requireFaceVerification: Boolean(requireFaceVerification) }
          : {}),
      },
    });
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

/** GET /admin/ranking-rewards/:board/rewards — recent payout audit rows for a board. */
router.get('/:board/rewards', superAdmin, async (req, res, next) => {
  try {
    const board = boardParam(req.params.board);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const items = await prisma.rankingReward.findMany({
      where: { board },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, displayName: true, hakaId: true } } },
    });
    ok(res, { items });
  } catch (err) {
    next(err);
  }
});

// ── House entries (admin-seeded ranking competitors; see specs/ranking-house-entries.md) ──

function houseBoardParam(value: string): HouseBoard {
  if (!isHouseBoard(value)) throw new AppError('Unknown ranking board', 404);
  return value;
}

/** GET /admin/ranking-rewards/:board/house — list house entries for a board. */
router.get('/:board/house', superAdmin, async (req, res, next) => {
  try {
    const items = await listHouseEntries(houseBoardParam(req.params.board));
    ok(res, { items });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/ranking-rewards/:board/house — add/update a house entry (id|hakaId + income). */
router.post('/:board/house', superAdmin, async (req, res, next) => {
  try {
    const board = houseBoardParam(req.params.board);
    const { idOrHaka, income, note } = req.body as Record<string, unknown>;
    const row = await upsertHouseEntry({
      board,
      idOrHaka: String(idOrHaka ?? ''),
      income: Number(income),
      note: note !== undefined ? String(note) : undefined,
      createdBy: req.admin!.id,
    });
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

/** PATCH /admin/ranking-rewards/house/:id — toggle active. */
router.patch('/house/:id', superAdmin, async (req, res, next) => {
  try {
    const row = await setHouseEntryActive(req.params.id, Boolean((req.body as { active?: unknown }).active));
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

/** DELETE /admin/ranking-rewards/house/:id — remove a house entry. */
router.delete('/house/:id', superAdmin, async (req, res, next) => {
  try {
    await deleteHouseEntry(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
