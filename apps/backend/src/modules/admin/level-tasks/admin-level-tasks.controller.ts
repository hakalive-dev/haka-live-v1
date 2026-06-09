import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-level-tasks.service';
import { ok } from '../../../utils/response';

const updateSettingsSchema = z.object({
  ordinaryMaxSevenDayEarnings: z.coerce.bigint().optional(),
  newHostProtectionDays: z.number().int().min(1).max(30).optional(),
  newHostHourlyBeans: z.number().int().min(0).optional(),
  newHostHoursPerDay: z.number().int().min(1).max(24).optional(),
  newHostTotalCapBeans: z.number().int().min(0).optional(),
  ordinaryLiveHourlyBeans: z.number().int().min(0).optional(),
  ordinaryLiveHoursPerDay: z.number().int().min(0).max(24).optional(),
  ordinaryIncomeHourlyBeans: z.number().int().min(0).optional(),
  ordinaryIncomeHoursPerDay: z.number().int().min(0).max(10).optional(),
  ordinaryHourlyMaxBeans: z.number().int().min(0).optional(),
  ordinaryDailyMaxBeans: z.number().int().min(0).optional(),
  incomeTaskThresholdBeans: z.number().int().min(0).optional(),
  liveClaimChunkMinutes: z.number().int().min(1).max(180).optional(),
  countLiveMicTime: z.boolean().optional(),
});

const tierBodySchema = z.object({
  levelCode: z.string().min(1).max(8),
  minSevenDayEarnings: z.coerce.bigint(),
  dailyTaskRewardBeans: z.number().int().min(0),
  incomeTaskHourlyBeans: z.number().int().min(0).optional(),
  incomeTaskMaxHoursPerDay: z.number().int().min(0).max(10).optional(),
  hourlyMaxBeans: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
});

const listDailySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  userId: z.string().uuid().optional(),
});

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.getSettings());
  } catch (err) { next(err); }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSettingsSchema.parse(req.body);
    ok(res, await svc.updateSettings(data, req.admin!.id, req.ip));
  } catch (err) { next(err); }
}

export async function listTiers(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.listTiers());
  } catch (err) { next(err); }
}

export async function createTier(req: Request, res: Response, next: NextFunction) {
  try {
    const data = tierBodySchema.parse(req.body);
    ok(res, await svc.createTier(data, req.admin!.id, req.ip));
  } catch (err) { next(err); }
}

export async function updateTier(req: Request, res: Response, next: NextFunction) {
  try {
    const data = tierBodySchema.partial().parse(req.body);
    ok(res, await svc.updateTier(req.params.id, data, req.admin!.id, req.ip));
  } catch (err) { next(err); }
}

export async function deleteTier(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.deleteTier(req.params.id, req.admin!.id, req.ip));
  } catch (err) { next(err); }
}

export async function listDaily(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listDailySchema.parse(req.query);
    ok(res, await svc.listDailyClaims(params));
  } catch (err) { next(err); }
}
