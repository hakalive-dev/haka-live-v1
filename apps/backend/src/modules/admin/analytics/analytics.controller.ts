import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './analytics.service';
import { ok } from '../../../utils/response';

const periodSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = periodSchema.parse(req.query);
    const result = await service.getOverview(period);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getTopHosts(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, limit } = periodSchema.parse(req.query);
    const result = await service.getTopHosts(limit, period);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getTopSenders(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, limit } = periodSchema.parse(req.query);
    const result = await service.getTopSenders(limit, period);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getUserGrowth(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getUserGrowth();
    ok(res, result);
  } catch (err) { next(err); }
}
