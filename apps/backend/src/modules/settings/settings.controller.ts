import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { ok } from '../../utils/response';

export const settingsController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const data = await settingsService.get(userId);
      return ok(res, data);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const data = await settingsService.update(userId, req.body ?? {});
      return ok(res, data);
    } catch (err) {
      next(err);
    }
  },
};
