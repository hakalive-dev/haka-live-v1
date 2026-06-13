import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';
import { prisma } from '../../../config/prisma';
import { ok } from '../../../utils/response';
import { DEFAULT_STATE_RANK_REWARD_TIERS } from '../../leaderboard/state-ranking.constants';
import type { Prisma } from '@prisma/client';

const router = Router();
const superAdmin = requireAdminRole('super_admin');

router.get('/config', superAdmin, async (_req, res, next) => {
  try {
    let row = await prisma.stateRankingConfig.findUnique({ where: { id: 'singleton' } });
    if (!row) {
      row = await prisma.stateRankingConfig.create({
        data: {
          id: 'singleton',
          stateRankTiers: DEFAULT_STATE_RANK_REWARD_TIERS as unknown as Prisma.InputJsonValue,
        },
      });
    }
    ok(res, row);
  } catch (err) {
    next(err);
  }
});

router.patch('/config', superAdmin, async (req, res, next) => {
  try {
    const { enabled, topHostsPerState, hostSplitPercentages, stateRankTiers, requireFaceVerification } =
      req.body as Record<string, unknown>;
    const row = await prisma.stateRankingConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        enabled: Boolean(enabled ?? true),
        topHostsPerState: Number(topHostsPerState ?? 4),
        hostSplitPercentages: (hostSplitPercentages ?? [65, 20, 10, 5]) as Prisma.InputJsonValue,
        stateRankTiers: (stateRankTiers ?? DEFAULT_STATE_RANK_REWARD_TIERS) as Prisma.InputJsonValue,
        requireFaceVerification: Boolean(requireFaceVerification ?? true),
      },
      update: {
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
        ...(topHostsPerState !== undefined ? { topHostsPerState: Number(topHostsPerState) } : {}),
        ...(hostSplitPercentages !== undefined
          ? { hostSplitPercentages: hostSplitPercentages as Prisma.InputJsonValue }
          : {}),
        ...(stateRankTiers !== undefined
          ? { stateRankTiers: stateRankTiers as Prisma.InputJsonValue }
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

router.get('/rewards', superAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const items = await prisma.stateRankingReward.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, hakaId: true } },
      },
    });
    ok(res, { items });
  } catch (err) {
    next(err);
  }
});

export default router;
