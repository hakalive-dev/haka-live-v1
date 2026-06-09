import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-moderation.service';
import { ok } from '../../../utils/response';

const listSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  status:     z.string().optional(),
  targetType: z.string().optional(),
  isActive:   z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort:       z.string().default('createdAt'),
  order:      z.enum(['asc', 'desc']).default('desc'),
});

const reviewSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});

const banSchema = z.object({
  userId:    z.string(),
  reason:    z.string().min(1),
  banType:   z.enum(['permanent', 'temporary']),
  expiresAt: z.string().datetime().optional(),
  proofUrl:  z.string().url().optional().or(z.literal('')),
  result:    z.string().max(500).optional(),
});

const roomBanSchema = z.object({
  userId: z.string(),
  roomId: z.string(),
  reason: z.string().min(1),
});

const deviceBanSchema = z.object({
  deviceId:  z.string().min(1),
  reason:    z.string().min(1),
  banType:   z.enum(['permanent', 'temporary']),
  expiresAt: z.string().datetime().optional(),
});

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    ok(res, await svc.listReports(params));
  } catch (err) { next(err); }
}

export async function reviewReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = reviewSchema.parse(req.body);
    ok(res, await svc.reviewReport(req.admin!.id, req.params.id, status, req.ip));
  } catch (err) { next(err); }
}

export async function listBans(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    ok(res, await svc.listBans(params));
  } catch (err) { next(err); }
}

export async function createBan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = banSchema.parse(req.body);
    ok(res, await svc.createBan(
      req.admin!.id,
      body.userId,
      body.reason,
      body.banType,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
      req.ip,
      body.proofUrl,
      body.result,
    ));
  } catch (err) { next(err); }
}

export async function liftBan(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.liftBan(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

const updateBanResultSchema = z.object({
  proofUrl: z.string().url().optional().or(z.literal('')),
  result: z.string().max(500).optional(),
});

export async function updateBanResult(req: Request, res: Response, next: NextFunction) {
  try {
    const { proofUrl, result } = updateBanResultSchema.parse(req.body);
    ok(res, await svc.updateBanResult(req.admin!.id, req.params.id, { proofUrl, result }, req.ip));
  } catch (err) { next(err); }
}

export async function verifyUser(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.verifyUser(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

export async function unverifyUser(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.unverifyUser(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

// ── Room Bans ────────────────────────────────────────────────────────────────

export async function createRoomBan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = roomBanSchema.parse(req.body);
    ok(res, await svc.createRoomBan(req.admin!.id, body.userId, body.roomId, body.reason, req.ip));
  } catch (err) { next(err); }
}

export async function liftRoomBan(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.liftRoomBan(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

// ── Device Bans ──────────────────────────────────────────────────────────────

export async function listDeviceBans(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    ok(res, await svc.listDeviceBans(params));
  } catch (err) { next(err); }
}

export async function createDeviceBan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = deviceBanSchema.parse(req.body);
    ok(res, await svc.createDeviceBan(
      req.admin!.id,
      body.deviceId,
      body.reason,
      body.banType,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
      req.ip,
    ));
  } catch (err) { next(err); }
}

export async function liftDeviceBan(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.liftDeviceBan(req.admin!.id, req.params.deviceId, req.ip));
  } catch (err) { next(err); }
}
