import { Request, Response, NextFunction } from 'express';
import * as svc from './lucky-gifts.service';
import { ok } from '../../../utils/response';
import { luckySettingUpdateSchema, luckyDrawsQuerySchema } from './lucky-gifts.validation';

export async function getSetting(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.getSetting()); } catch (err) { next(err); }
}

export async function updateSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const body = luckySettingUpdateSchema.parse(req.body);
    const adminUserId = req.admin?.id ?? '';
    ok(res, await svc.updateSetting(adminUserId, body));
  } catch (err) { next(err); }
}

export async function listDraws(req: Request, res: Response, next: NextFunction) {
  try {
    const query = luckyDrawsQuerySchema.parse(req.query);
    ok(res, await svc.listDraws(query));
  } catch (err) { next(err); }
}

export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.getStats()); } catch (err) { next(err); }
}
