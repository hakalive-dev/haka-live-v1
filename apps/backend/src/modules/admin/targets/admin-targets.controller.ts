import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-targets.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

const upsertSchema = z.object({
  staffId: z.string().uuid(),
  period: z.enum(['week', 'month']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenueTarget: z.string().regex(/^\d+$/),
  onboardTarget: z.number().int().min(0),
}).strict();

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const b = upsertSchema.parse(req.body);
    const t = await svc.upsertTarget(b);
    ok(res, { ...t, revenueTarget: t.revenueTarget.toString() });
  } catch (e) { next(e); }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const staffId = String(req.query.staffId);
    const period = req.query.period === 'week' ? 'week' : 'month';
    const periodStart = String(req.query.periodStart);
    ok(res, await svc.getTargetWithActual(staffId, period, periodStart));
  } catch (e) { next(e); }
}
