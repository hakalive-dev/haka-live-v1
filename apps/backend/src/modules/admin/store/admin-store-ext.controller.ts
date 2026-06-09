import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ok } from '../../../utils/response';
import * as saleService from './admin-store-sale.service';
import * as distService from './admin-store-distribution.service';

const saleStatusSchema = z.object({
  isForSale: z.boolean(),
  reason: z.string().optional(),
});

const bulkSaleStatusSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
  isForSale: z.boolean(),
  reason: z.string().optional(),
});

const scheduleSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
  targetForSale: z.boolean(),
  effectiveAt: z.coerce.date(),
  reason: z.string().optional(),
});

const sendItemSchema = z.object({
  userId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  reason: z.string().min(1),
  durationDays: z.coerce.number().int().min(0).nullable().optional(),
});

const bulkDistributeSchema = z.object({
  audienceType: z.enum(['user_ids', 'agency', 'host_level', 'country', 'all']),
  audienceFilters: z.record(z.unknown()).default({}),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  reason: z.string().min(1),
  durationDays: z.coerce.number().int().min(0).nullable().optional(),
  channel: z.enum(['single', 'bulk', 'emergency']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function patchSaleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = saleStatusSchema.parse(req.body);
    const item = await saleService.setItemSaleStatus(
      req.params.id,
      body.isForSale,
      req.admin!.id,
      req.ip ?? '',
      { reason: body.reason },
    );
    ok(res, item, 'Sale status updated');
  } catch (err) { next(err); }
}

export async function bulkPatchSaleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = bulkSaleStatusSchema.parse(req.body);
    const result = await saleService.bulkSetSaleStatus(
      body.itemIds,
      body.isForSale,
      req.admin!.id,
      req.ip ?? '',
      body.reason,
    );
    ok(res, result, 'Bulk sale status updated');
  } catch (err) { next(err); }
}

export async function getSaleStatusHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const params = paginationSchema.parse(req.query);
    const result = await saleService.getSaleStatusHistory(req.params.id, params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function createSaleSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const body = scheduleSchema.parse(req.body);
    const schedules = await saleService.createSaleSchedule(req.admin!.id, req.ip ?? '', body);
    ok(res, schedules, 'Sale schedule created');
  } catch (err) { next(err); }
}

export async function listSaleSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const params = paginationSchema.extend({
      status: z.string().optional(),
      itemId: z.string().uuid().optional(),
    }).parse(req.query);
    const result = await saleService.listSaleSchedules(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function cancelSaleSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const schedule = await saleService.cancelSaleSchedule(req.params.scheduleId, req.admin!.id, req.ip ?? '');
    ok(res, schedule, 'Schedule cancelled');
  } catch (err) { next(err); }
}

export async function lookupUser(req: Request, res: Response, next: NextFunction) {
  try {
    const hakaId = z.string().min(1).parse(req.query.hakaId);
    const user = await distService.lookupUserByHakaId(hakaId);
    ok(res, user);
  } catch (err) { next(err); }
}

export async function sendItem(req: Request, res: Response, next: NextFunction) {
  try {
    const body = sendItemSchema.parse(req.body);
    const result = await distService.sendItemToUser(
      req.admin!.id,
      req.params.id,
      body,
      req.ip,
    );
    ok(res, result, 'Item sent to user');
  } catch (err) { next(err); }
}

export async function bulkDistribute(req: Request, res: Response, next: NextFunction) {
  try {
    const body = bulkDistributeSchema.parse(req.body);
    const result = await distService.bulkDistributeItem(
      req.admin!.id,
      req.params.id,
      {
        audienceType: body.audienceType,
        audienceFilters: body.audienceFilters,
        quantity: body.quantity,
        reason: body.reason,
        durationDays: body.durationDays,
        channel: body.channel,
      },
      req.ip,
    );
    ok(res, result, result.mode === 'async' ? 'Bulk distribution queued' : 'Bulk distribution complete');
  } catch (err) { next(err); }
}

export async function listDistributions(req: Request, res: Response, next: NextFunction) {
  try {
    const q = paginationSchema.extend({
      itemId: z.string().uuid().optional(),
      adminId: z.string().optional(),
      recipientUserId: z.string().uuid().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(req.query);
    const result = await distService.listDistributions(q);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function distributionAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(req.query);
    const result = await distService.getDistributionAnalytics(q);
    ok(res, result);
  } catch (err) { next(err); }
}
