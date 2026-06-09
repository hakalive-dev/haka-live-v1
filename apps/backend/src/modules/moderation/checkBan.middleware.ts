import { Request, Response, NextFunction } from 'express';
import * as moderationService from './moderation.service';

/**
 * Middleware that blocks requests from banned users.
 * Attach after `authenticate` on any route that should respect bans.
 */
export async function checkBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isBanned = await moderationService.isUserBanned(req.user!.id);
    if (isBanned) {
      res.status(403).json({ success: false, data: null, message: 'Your account has been suspended.' });
      return;
    }
    next();
  } catch {
    next();
  }
}
