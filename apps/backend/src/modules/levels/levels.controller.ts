import { Request, Response, NextFunction } from 'express';
import * as levelsService from './levels.service';
import { ok } from '../../utils/response';

/** GET /levels/me */
export async function getMyLevel(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await levelsService.getLevel(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /levels/user/:userId */
export async function getUserLevel(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await levelsService.getLevelByUserId(req.params.userId);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /levels/leaderboard/rich */
export async function getRichLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await levelsService.getRichLeaderboard();
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /levels/leaderboard/charm */
export async function getCharmLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await levelsService.getCharmLeaderboard();
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /levels/tiers */
export async function getTiers(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, {
      tiers: levelsService.getTiers(),
      charmTiers: levelsService.getCharmTiers(),
      maxLevel: levelsService.MAX_LEVEL,
    });
  } catch (err) { next(err); }
}
