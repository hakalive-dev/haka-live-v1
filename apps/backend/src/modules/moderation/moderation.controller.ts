import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as moderationService from './moderation.service';
import { ok, created } from '../../utils/response';

const reportSchema = z.object({
  targetType: z.enum(['user', 'room', 'message']),
  targetId: z.string().uuid(),
  reason: z.string().min(1),
  description: z.string().default(''),
});

const reviewSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});

const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(1),
  banType: z.enum(['permanent', 'temporary']),
  expiresAt: z.string().datetime().optional(),
});

const deviceBanSchema = z.object({
  deviceId: z.string().min(1),
  reason: z.string().min(1),
  banType: z.enum(['permanent', 'temporary']),
  expiresAt: z.string().datetime().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
});

/** POST /moderation/report */
export async function submitReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetType, targetId, reason, description } = reportSchema.parse(req.body);
    const data = await moderationService.report(req.user!.id, targetType, targetId, reason, description);
    created(res, data, 'Report submitted');
  } catch (err) { next(err); }
}

/** GET /moderation/reports */
export async function getReports(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = paginationSchema.parse(req.query);
    const data = await moderationService.getReports(page, limit, status);
    ok(res, data);
  } catch (err) { next(err); }
}

/** PATCH /moderation/reports/:id */
export async function reviewReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = reviewSchema.parse(req.body);
    const data = await moderationService.reviewReport(req.params.id, status);
    ok(res, data, 'Report updated');
  } catch (err) { next(err); }
}

/** POST /moderation/ban */
export async function banUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, reason, banType, expiresAt } = banSchema.parse(req.body);
    const data = await moderationService.banUser(
      req.user!.id,
      userId,
      reason,
      banType,
      expiresAt ? new Date(expiresAt) : undefined,
    );
    created(res, data, 'User banned');
  } catch (err) { next(err); }
}

/** DELETE /moderation/ban/:userId */
export async function unbanUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await moderationService.unbanUser(req.params.userId);
    ok(res, data, 'User unbanned');
  } catch (err) { next(err); }
}

/** GET /moderation/bans */
export async function getBans(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await moderationService.getBans(page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

// ── Device Bans ──────────────────────────────────────────────────────────────

/** POST /moderation/device-ban */
export async function banDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const { deviceId, reason, banType, expiresAt } = deviceBanSchema.parse(req.body);
    const data = await moderationService.banDevice(
      req.user!.id,
      deviceId,
      reason,
      banType,
      expiresAt ? new Date(expiresAt) : undefined,
    );
    created(res, data, 'Device banned');
  } catch (err) { next(err); }
}

/** DELETE /moderation/device-ban/:deviceId */
export async function unbanDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await moderationService.unbanDevice(req.params.deviceId);
    ok(res, data, 'Device unbanned');
  } catch (err) { next(err); }
}

/** GET /moderation/device-bans */
export async function getDeviceBans(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await moderationService.getDeviceBans(page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}
