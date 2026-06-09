import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-notifications.service';
import { ok } from '../../../utils/response';
import { AppError } from '../../../middleware/error.middleware';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await svc.listAdminNotifications(params);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await svc.unreadAdminNotificationCount();
    ok(res, { count });
  } catch (err) {
    next(err);
  }
}

const idParam = z.object({ id: z.string().uuid() });

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idParam.parse(req.params);
    const row = await svc.markAdminNotificationRead(id);
    if (!row) throw new AppError('Notification not found', 404);
    ok(res, row);
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.markAllAdminNotificationsRead();
    ok(res, result);
  } catch (err) {
    next(err);
  }
}
