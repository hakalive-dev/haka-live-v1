import { Request, Response, NextFunction } from 'express';
import { blocklistService } from './blocklist.service';
import { ok, fail } from '../../utils/response';

export const blocklistController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const data = await blocklistService.list(userId);
      return ok(res, data);
    } catch (err) {
      next(err);
    }
  },

  async block(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const targetId = String(req.body?.user_id ?? '');
      if (!targetId) return fail(res, 'user_id required', 400);
      const data = await blocklistService.block(userId, targetId);
      return ok(res, data, '', 201);
    } catch (err: any) {
      return fail(res, err?.message ?? 'Could not block user', 400);
    }
  },

  async unblock(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      await blocklistService.unblock(userId, req.params.userId);
      return ok(res, { success: true });
    } catch (err) {
      next(err);
    }
  },
};
