import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as leaderboardService from './leaderboard.service';
import { getRoomContributions } from '../rooms/rooms.service';
import { ok } from '../../utils/response';
import { prisma } from '../../config/prisma';
import { XP_THRESHOLDS, MAX_LEVEL } from '../levels/levels.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const periodQuerySchema = paginationSchema.extend({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

const AGENCY_KEY_BY_PERIOD = {
  daily:   'AGENCY_DAILY',
  weekly:  'AGENCY_WEEKLY',
  monthly: 'AGENCY_MONTHLY',
} as const;

const EARNER_KEY_BY_PERIOD = {
  daily:   'EARNERS_DAILY',
  weekly:  'EARNERS_WEEKLY',
  monthly: 'EARNERS_MONTHLY',
} as const;

const GIFTER_KEY_BY_PERIOD = {
  daily:   'GIFTERS_DAILY',
  weekly:  'GIFTERS_WEEKLY',
  monthly: 'GIFTERS_MONTHLY',
} as const;

const CREATOR_KEY_BY_PERIOD = leaderboardService.CREATOR_KEY_BY_PERIOD;

/** GET /leaderboard/rich */
export async function getRichLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await leaderboardService.getLeaderboard(leaderboardService.KEYS.RICH_ALL, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/charm */
export async function getCharmLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await leaderboardService.getLeaderboard(leaderboardService.KEYS.CHARM_ALL, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/gifters?period=daily|weekly|monthly */
export async function getGiftersLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, period } = periodQuerySchema.parse(req.query);
    const key = leaderboardService.KEYS[GIFTER_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getLeaderboard(key, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/earners?period=daily|weekly|monthly */
export async function getEarnersLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, period } = periodQuerySchema.parse(req.query);
    const key = leaderboardService.KEYS[EARNER_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getLeaderboard(key, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/earners/me/regional?period=daily|weekly|monthly */
export async function getMyRegionalEarnerRank(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = z
      .object({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') })
      .parse(req.query);
    const data = await leaderboardService.getMyRegionalEarnerRank(req.user!.id, period);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/rich/me */
export async function getMyRichRank(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await leaderboardService.getMyRank(leaderboardService.KEYS.RICH_ALL, req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/charm/me */
export async function getMyCharmRank(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await leaderboardService.getMyRank(leaderboardService.KEYS.CHARM_ALL, req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

const roomQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'all']).default('all'),
});

/** GET /leaderboard/room/:roomId?period=daily — top gifters in a room */
export async function getRoomLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = roomQuerySchema.parse(req.query);
    const data = await getRoomContributions(req.params.roomId, period);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/agency?period=daily|weekly|monthly */
export async function getAgencyLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, period } = periodQuerySchema.parse(req.query);
    const key = leaderboardService.KEYS[AGENCY_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getAgencyLeaderboard(key, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/creators?period=daily|weekly|monthly — female hosts by beans earned */
export async function getCreatorsLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, period } = periodQuerySchema.parse(req.query);
    const key = leaderboardService.KEYS[CREATOR_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getCreatorLeaderboard(key, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/earners/me?period=daily|weekly|monthly */
export async function getMyEarnerRank(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = z.object({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') }).parse(req.query);
    const key = leaderboardService.KEYS[EARNER_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getMyRank(key, req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/gifters/me?period=daily|weekly|monthly */
export async function getMyGifterRank(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = z.object({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') }).parse(req.query);
    const key = leaderboardService.KEYS[GIFTER_KEY_BY_PERIOD[period]];
    const data = await leaderboardService.getMyRank(key, req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/fans/:userId?period=daily|weekly|monthly&limit= — top gifters for a specific user */
export async function getTopFans(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, limit } = z
      .object({
        period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);
    const data = await leaderboardService.getTopFans(req.params.userId, period, limit ?? 50);
    ok(res, { fans: data, period });
  } catch (err) {
    next(err);
  }
}

/** GET /leaderboard/creator/me — current user's creator stats (charm level, XP, creator board rank) */
export async function getMyCreatorStats(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { period } = z
      .object({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') })
      .parse(req.query);
    const creatorKey = leaderboardService.KEYS[CREATOR_KEY_BY_PERIOD[period]];
    const [userLevel, earnerRank] = await Promise.all([
      prisma.userLevel.findUnique({ where: { userId }, select: { charmLevel: true, charmXp: true } }),
      leaderboardService.getMyRank(creatorKey, userId),
    ]);

    const charmLevel = userLevel?.charmLevel ?? 1;
    const charmXp = Number(userLevel?.charmXp ?? 0n);
    const nextLevelIndex = Math.min(charmLevel, MAX_LEVEL - 1);
    const nextLevelXp = XP_THRESHOLDS[nextLevelIndex] ?? XP_THRESHOLDS[MAX_LEVEL - 1];
    const stars = Math.min(Math.ceil(charmLevel / 20), 5);

    ok(res, {
      charmLevel,
      charmXp,
      nextLevelXp,
      stars,
      earnerScore: earnerRank.score ?? 0,
      earnerRank: earnerRank.rank,
    });
  } catch (err) {
    next(err);
  }
}
