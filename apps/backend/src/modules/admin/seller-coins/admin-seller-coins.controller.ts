import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as sellerCoinsService from './admin-seller-coins.service';
import { ok } from '../../../utils/response';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await sellerCoinsService.listSellers(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sellerCoinsService.getSellerDetail(req.params.userId);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listRechargeRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await sellerCoinsService.listRechargeRequests(status);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function approveRecharge(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sellerCoinsService.approveRecharge(req.params.id, req.admin!.id, req.ip);
    ok(res, result, 'Recharge approved and coins credited');
  } catch (err) { next(err); }
}

export async function rejectRecharge(req: Request, res: Response, next: NextFunction) {
  try {
    const notes = typeof req.body.notes === 'string' ? req.body.notes : '';
    const result = await sellerCoinsService.rejectRecharge(req.params.id, req.admin!.id, notes, req.ip);
    ok(res, result, 'Recharge request rejected');
  } catch (err) { next(err); }
}

export async function assignSeniorTag(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sellerCoinsService.assignSeniorSellerTag(
      req.params.userId,
      req.admin!.id,
      req.ip,
    );
    ok(res, result);
  } catch (err) { next(err); }
}

export async function removeSeniorTag(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sellerCoinsService.removeSeniorSellerTag(
      req.params.userId,
      req.admin!.id,
      req.ip,
    );
    ok(res, result);
  } catch (err) { next(err); }
}

export async function deductCoins(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      coins: z.coerce.number().int().positive(),
      reason: z.string().min(1),
    }).parse(req.body);
    const admin = await import('../../../config/prisma').then(({ prisma }) =>
      prisma.adminUser.findUnique({
        where: { id: req.admin!.id },
        select: { displayName: true },
      }),
    );
    const result = await sellerCoinsService.deductSellerCoins(
      req.params.userId,
      body.coins,
      body.reason,
      req.admin!.id,
      admin?.displayName ?? 'admin',
      req.ip,
    );
    ok(res, result, 'Coins deducted from seller balance');
  } catch (err) { next(err); }
}
