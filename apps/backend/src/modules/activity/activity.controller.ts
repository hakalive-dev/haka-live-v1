import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as activityService from './activity.service';
import { ok } from '../../utils/response';

const periodSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
});

/** GET /activity?period=weekly */
export async function getMyActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = periodSchema.parse(req.query);
    const data = await activityService.getMyActivity(req.user!.id, period);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /activity/income?period=weekly */
export async function getMyIncome(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = periodSchema.parse(req.query);
    const data = await activityService.getMyIncome(req.user!.id, period);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /activity/chart?period=weekly */
export async function getChartData(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = periodSchema.parse(req.query);
    const data = await activityService.getChartData(req.user!.id, period);
    ok(res, data);
  } catch (err) { next(err); }
}
