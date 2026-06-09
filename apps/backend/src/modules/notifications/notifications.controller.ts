import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as notificationsService from './notifications.service';
import { ok } from '../../utils/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const fcmTokenSchema = z.object({
  token: z.string().min(1),
});

/** GET /notifications */
export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await notificationsService.getNotifications(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /notifications/count */
export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await notificationsService.getUnreadCount(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** PATCH /notifications/:id/read */
export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await notificationsService.markRead(req.user!.id, req.params.id);
    ok(res, data, 'Notification marked as read');
  } catch (err) { next(err); }
}

/** PATCH /notifications/read-all */
export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await notificationsService.markAllRead(req.user!.id);
    ok(res, data, 'All notifications marked as read');
  } catch (err) { next(err); }
}

/** POST /notifications/fcm-token */
export async function updateFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = fcmTokenSchema.parse(req.body);
    const data = await notificationsService.updateFcmToken(req.user!.id, token);
    ok(res, data, 'FCM token updated');
  } catch (err) { next(err); }
}
