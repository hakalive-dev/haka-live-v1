import { Request, Response, NextFunction } from 'express';
import { ok } from '../../utils/response';
import * as hosts from './hosts.service';
import * as levelTask from './level-task.service';

export const hostsController = {
  async getMyAgency(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      return ok(res, await hosts.getMyAgency(userId));
    } catch (err) { next(err); }
  },

  async getIncome(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const w = String(req.query.window ?? 'today');
      const window = (w === '7d' || w === 'weekly') ? w : 'today';
      return ok(res, await hosts.getIncome(userId, window as 'today' | '7d' | 'weekly'));
    } catch (err) { next(err); }
  },

  async getMyTier(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      return ok(res, await hosts.getMyTier(userId));
    } catch (err) { next(err); }
  },

  async getMicProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      return ok(res, await hosts.getMicProgress(userId));
    } catch (err) { next(err); }
  },

  async getOfficialContact(_req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await hosts.getOfficialContact());
    } catch (err) { next(err); }
  },

  async leaveAgency(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { reason } = req.body ?? {};
      return ok(res, await hosts.requestLeaveAgency(userId, reason ?? ''));
    } catch (err) { next(err); }
  },

  async changeAgency(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { new_agent_id, reason } = req.body ?? {};
      return ok(res, await hosts.requestChangeAgency(userId, new_agent_id, reason ?? ''));
    } catch (err) { next(err); }
  },

  async getLevelTaskRules(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await levelTask.getLevelTaskRules();
      return ok(res, { rules });
    } catch (err) { next(err); }
  },

  async getLevelTask(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      return ok(res, await levelTask.getLevelTaskStatus(userId));
    } catch (err) { next(err); }
  },

  async claimLevelTaskLive(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await levelTask.claimLevelTaskLive(userId);
      return ok(res, result, 'Live task reward claimed');
    } catch (err) { next(err); }
  },

  async claimLevelTaskIncome(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await levelTask.claimLevelTaskIncome(userId);
      return ok(res, result, 'Income task reward claimed');
    } catch (err) { next(err); }
  },
};
