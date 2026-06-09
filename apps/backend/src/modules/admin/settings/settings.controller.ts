import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as settingsService from './settings.service';
import { ok } from '../../../utils/response';

const upsertSchema = z.object({
  value: z.unknown(),
});

export async function listSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.listSettings();
    ok(res, settings);
  } catch (err) { next(err); }
}

export async function getSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const setting = await settingsService.getSetting(req.params.key);
    ok(res, setting);
  } catch (err) { next(err); }
}

export async function upsertSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const { value } = upsertSchema.parse(req.body);
    const setting = await settingsService.upsertSetting(req.admin!.id, req.params.key, value, req.ip);
    ok(res, setting);
  } catch (err) { next(err); }
}

export async function deleteSetting(req: Request, res: Response, next: NextFunction) {
  try {
    await settingsService.deleteSetting(req.admin!.id, req.params.key, req.ip);
    ok(res, null, 'Setting deleted');
  } catch (err) { next(err); }
}
