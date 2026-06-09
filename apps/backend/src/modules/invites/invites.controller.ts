import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as invitesService from './invites.service';
import { getLeaderboard, KEYS } from '../leaderboard/leaderboard.service';
import { ok, created } from '../../utils/response';

const acceptSchema = z.object({
  code: z.string().min(1),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** POST /invites/generate */
export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await invitesService.generateInviteCode(req.user!.id);
    created(res, data);
  } catch (err) { next(err); }
}

/** POST /invites/accept */
export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = acceptSchema.parse(req.body);
    const data = await invitesService.acceptInvite(code, req.user!.id);
    ok(res, data, 'Invite accepted');
  } catch (err) { next(err); }
}

/** GET /invites/my */
export async function getMyInvites(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await invitesService.getMyInvites(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /invites/summary */
export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await invitesService.getSummary(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /invites/leaderboard — top inviters this week */
export async function getInviteLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await getLeaderboard(KEYS.INVITES_WEEKLY, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /invites/shareholder-rewards — weekly board + bonus pool from invite rewards */
export async function getShareholderRewards(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await invitesService.getShareholderRewards(page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}
