import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-hierarchy.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export async function listAdmins(req: Request, res: Response, next: NextFunction) {
  try {
    const period = req.query.period === 'week' ? 'week' : 'month';
    ok(res, await svc.listAdminsWithRollup(period));
  } catch (e) { next(e); }
}

const transferSchema = z.object({ bdId: z.string().uuid(), toAdminId: z.string().uuid() }).strict();
export async function transferBd(req: Request, res: Response, next: NextFunction) {
  try { const b = transferSchema.parse(req.body); ok(res, await svc.transferBdBetweenAdmins(b.bdId, b.toAdminId)); }
  catch (e) { next(e); }
}

const assignSchema = z.object({ bdId: z.string().uuid(), adminId: z.string().uuid() }).strict();
export async function assignBd(req: Request, res: Response, next: NextFunction) {
  try { const b = assignSchema.parse(req.body); ok(res, await svc.assignBdToAdmin(b.bdId, b.adminId)); }
  catch (e) { next(e); }
}

export async function getWithdrawalFreeze(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.getWithdrawalFreeze(req.params.id));
  } catch (e) { next(e); }
}

const freezeSchema = z.object({
  isFrozen: z.boolean(),
  reason: z.string().optional().default(''),
  countryCode: z.string().optional(),
}).strict();

export async function setWithdrawalFreeze(req: Request, res: Response, next: NextFunction) {
  try {
    const b = freezeSchema.parse(req.body);
    ok(res, await svc.setWithdrawalFreeze(req.admin!.id, req.params.id, b));
  } catch (e) { next(e); }
}

const transferAgenciesSchema = z.object({
  fromAdminId: z.string().uuid(),
  toAdminId: z.string().uuid(),
  agencyIds: z.array(z.string().uuid()).optional(),
}).strict();

export async function transferAgencies(req: Request, res: Response, next: NextFunction) {
  try {
    const b = transferAgenciesSchema.parse(req.body);
    ok(res, await svc.transferAgenciesBetweenAdmins(req.admin!.id, b));
  } catch (e) { next(e); }
}
