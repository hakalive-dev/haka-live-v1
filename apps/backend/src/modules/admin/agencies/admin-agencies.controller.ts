import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as agenciesService from './admin-agencies.service';
import { ok, created } from '../../../utils/response';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'suspended', 'banned']).optional(),
  sort:   z.enum(['createdAt', 'name', 'status']).default('createdAt'),
  order:  z.enum(['asc', 'desc']).default('desc'),
  unassigned: z.coerce.boolean().optional(),
});

const ownerUnion = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('link'), hakaId: z.string().min(1) }),
  z.object({
    mode: z.literal('create'),
    displayName: z.string().min(1),
    phone: z.string().min(3).max(30).nullable().optional(),
    username: z.string().min(1).max(50).nullable().optional(),
    country: z.string().max(64).nullable().optional(),
  }),
]);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  ownerId: z.string().uuid().optional(),
  owner: ownerUnion.optional(),
  description: z.string().max(500).optional(),
  bdId: z.string().uuid().nullable().optional(),
  region: z.string().max(16).nullable().optional(),
  country: z.string().max(64).optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  hostLimit: z.number().int().min(0).nullable().optional(),
  withdrawalLimitMonthly: z.string().regex(/^\d+$/).nullable().optional(),
  withdrawalLimitBeans: z.string().regex(/^\d+$/).nullable().optional(),
}).strict().refine(d => !!d.ownerId || !!d.owner, { message: 'Provide ownerId or owner' });

const updateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  giftBonusEnabled: z.boolean().optional(),
  bdId:        z.string().uuid().nullable().optional(),
  region:      z.string().max(16).nullable().optional(),
  hostLimit:   z.coerce.number().int().min(0).optional(),
  withdrawalLimitBeans: z.coerce.number().int().min(0).optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
});

const assignAdminSchema = z.object({
  adminId: z.string().uuid(),
});

const periodSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('month'),
});

const retentionSchema = z.object({
  window: z.enum(['7d', '30d']).default('30d'),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function listAgencies(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await agenciesService.listAgencies(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getAgencyDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const agency = await agenciesService.getAgencyDetail(req.params.id);
    ok(res, agency);
  } catch (err) { next(err); }
}

export async function createAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    const agency = await agenciesService.createAgency(req.admin!.id, data, req.ip);
    created(res, agency, 'Agency created');
  } catch (err) { next(err); }
}

const freezeWithdrawalsSchema = z.object({
  reason: z.string().max(200).optional().default(''),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  duration: z.enum(['24h', '7d', '30d', 'permanent']).default('permanent'),
  cascadeToHosts: z.boolean().optional().default(true),
}).strict();

export async function freezeAgencyWithdrawals(req: Request, res: Response, next: NextFunction) {
  try {
    const body = freezeWithdrawalsSchema.parse(req.body ?? {});
    ok(res, await agenciesService.setAgencyWithdrawalFreeze(req.admin!.id, req.params.id, {
      isFrozen: true,
      ...body,
    }, req.ip));
  } catch (err) { next(err); }
}

export async function unfreezeAgencyWithdrawals(req: Request, res: Response, next: NextFunction) {
  try {
    const body = freezeWithdrawalsSchema.parse(req.body ?? {});
    ok(res, await agenciesService.setAgencyWithdrawalFreeze(req.admin!.id, req.params.id, {
      isFrozen: false,
      ...body,
    }, req.ip));
  } catch (err) { next(err); }
}

export async function updateAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const agency = await agenciesService.updateAgency(req.admin!.id, req.params.id, data, req.ip);
    ok(res, agency);
  } catch (err) { next(err); }
}

export async function deleteAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await agenciesService.deleteAgency(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function setAgencyStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = statusSchema.parse(req.body);
    const agency = await agenciesService.setAgencyStatus(req.admin!.id, req.params.id, status, req.ip);
    ok(res, agency);
  } catch (err) { next(err); }
}

export async function assignAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const { adminId } = assignAdminSchema.parse(req.body);
    const result = await agenciesService.assignAdmin(req.admin!.id, req.params.id, adminId, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function removeAdminAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const { adminId } = assignAdminSchema.parse(req.body);
    const result = await agenciesService.removeAdminAssignment(req.admin!.id, req.params.id, adminId, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getAgencyAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = periodSchema.parse(req.query);
    const result = await agenciesService.getAgencyAnalytics(req.params.id, period);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getAgencyHostRetention(req: Request, res: Response, next: NextFunction) {
  try {
    const { window } = retentionSchema.parse(req.query);
    const result = await agenciesService.getAgencyHostRetention(req.params.id, window);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getAgencyPerformance(req: Request, res: Response, next: NextFunction) {
  try {
    const period = req.query.period === 'week' ? 'week' : 'month';
    const result = await agenciesService.getAgencyPerformance(req.params.id, period);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getAgencyWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await agenciesService.getAgencyWallet(req.params.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function transferHost(req: Request, res: Response, next: NextFunction) {
  try {
    const data = z.object({
      hostUserId: z.string().uuid(),
      toAgencyId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(req.body);
    ok(res, await agenciesService.transferHost(data, req.admin!.id, req.ip!), 'Host transferred successfully');
  } catch (err) { next(err); }
}

export async function removeHostFromAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const data = z.object({
      hostUserId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(req.body);
    ok(res, await agenciesService.removeHostFromAgency(req.params.id, data.hostUserId, req.admin!.id, req.ip!, data.reason), 'Host removed from agency');
  } catch (err) { next(err); }
}
