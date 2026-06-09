import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-bd.service';
import { created } from '../../../utils/response';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

const createBdSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.enum(['bd', 'senior_bd']).default('bd'),
  region: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  username: z.string().min(1).max(50).nullable().optional(),
  phone: z.string().min(3).max(30).nullable().optional(),
  country: z.string().max(64).optional(),
  appUser: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('link'), hakaId: z.string().min(1) }),
    z.object({
      mode: z.literal('create'),
      displayName: z.string().min(1),
      phone: z.string().min(3).max(30).nullable().optional(),
      username: z.string().min(1).max(50).nullable().optional(),
      country: z.string().max(64).nullable().optional(),
    }),
  ]),
  agencyIds: z.array(z.string().uuid()).optional(),
}).strict();

export async function createBd(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBdSchema.parse(req.body);
    const { admin, merged } = await svc.createBd(req.admin!.id, data, req.ip);
    created(res, { ...admin, merged }, merged ? 'BD role added to existing account' : 'BD created');
  } catch (e) { next(e); }
}

export async function listBds(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period === 'week' ? 'week' : 'month');
    ok(res, await svc.listBds({
      region: req.query.region as string,
      managerId: req.query.managerId as string,
      period,
    }));
  } catch (e) { next(e); }
}

export async function getBdDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period === 'week' ? 'week' : 'month');
    ok(res, await svc.getBdDetail(req.params.id, period));
  } catch (e) { next(e); }
}

const assignSchema = z.object({ agencyId: z.string().uuid(), bdId: z.string().uuid() }).strict();
export async function assignAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const { agencyId, bdId } = assignSchema.parse(req.body);
    ok(res, await svc.assignAgencyToBd(agencyId, bdId));
  } catch (e) { next(e); }
}

const transferSchema = z.object({ agencyId: z.string().uuid(), toBdId: z.string().uuid() }).strict();
export async function transferAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const { agencyId, toBdId } = transferSchema.parse(req.body);
    ok(res, await svc.transferAgencyBetweenBds(agencyId, toBdId));
  } catch (e) { next(e); }
}

export async function suspendBd(req: Request, res: Response, next: NextFunction) {
  try { await svc.setBdActive(req.params.id, false); ok(res, { id: req.params.id, isActive: false }); }
  catch (e) { next(e); }
}

export async function reactivateBd(req: Request, res: Response, next: NextFunction) {
  try { await svc.setBdActive(req.params.id, true); ok(res, { id: req.params.id, isActive: true }); }
  catch (e) { next(e); }
}
