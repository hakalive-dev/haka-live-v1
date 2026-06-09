import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './admin-risk-control.service';
import { listGiftTransactions } from '../gifts/admin-gifts.service';
import { ok } from '../../../utils/response';

const riskDataSchema = z.object({
  freezeCoins:  z.boolean().default(false),
  freezeBeans:  z.boolean().default(false),
  disableGames: z.boolean().default(false),
  disableGifts: z.boolean().default(false),
  blockChat:    z.boolean().default(false),
  reason:       z.enum(['fraud_activity','suspicious_transactions','multiple_accounts','chargeback','manual_review']),
  severity:     z.enum(['low','medium','high','critical']).default('medium'),
  duration:     z.enum(['24h','7d','30d','permanent']).default('permanent'),
  notes:        z.string().default(''),
  evidenceUrls: z.array(z.string()).optional().default([]),
});

export async function listRisks(req: Request, res: Response, next: NextFunction) {
  try {
    const page     = parseInt(req.query.page as string)     || 1;
    const limit    = parseInt(req.query.limit as string)    || 20;
    const status   = (req.query.status as 'active' | 'released' | 'all') || 'active';
    const severity = req.query.severity as string | undefined;
    const search   = req.query.search  as string | undefined;
    const result = await service.listRisks({ page, limit, status, severity, search });
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getRiskStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await service.getRiskStats();
    ok(res, stats);
  } catch (err) { next(err); }
}

export async function getUserRisk(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getActiveRisk(req.params.userId);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function applyRisk(req: Request, res: Response, next: NextFunction) {
  try {
    const data = riskDataSchema.parse(req.body);
    const risk = await service.applyRisk(req.params.userId, data, req.admin!.id);
    ok(res, risk, 'Risk control applied');
  } catch (err) { next(err); }
}

export async function updateRisk(req: Request, res: Response, next: NextFunction) {
  try {
    const data = riskDataSchema.parse(req.body);
    const risk = await service.updateRisk(req.params.userId, data, req.admin!.id);
    ok(res, risk, 'Risk control updated');
  } catch (err) { next(err); }
}

export async function releaseRisk(req: Request, res: Response, next: NextFunction) {
  try {
    await service.releaseRisk(req.params.userId, req.admin!.id);
    ok(res, null, 'Risk control released');
  } catch (err) { next(err); }
}

const gameGiftsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  senderId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  minCoinCost: z.coerce.number().int().min(0).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function listGameGiftRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const params = gameGiftsSchema.parse(req.query);
    const result = await listGiftTransactions({ ...params, isGame: true, sort: 'createdAt' });
    ok(res, result);
  } catch (err) { next(err); }
}
