import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-hosts.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export async function listHosts(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.listHosts({
      search: req.query.search as string | undefined,
      agencyOwnerId: req.query.agencyOwnerId as string | undefined,
      verified: req.query.verified === undefined ? undefined : req.query.verified === 'true',
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      period: (req.query.period as 'day' | 'week' | 'month' | 'all') ?? 'month',
    }));
  } catch (e) { next(e); }
}

export async function activeCount(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, { activeHosts: await svc.activeHostCount() }); } catch (e) { next(e); }
}

const hostIdSchema = z.object({ hostId: z.string().uuid() });

export async function getHostOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    ok(res, await svc.getHostOwnership(hostId));
  } catch (e) { next(e); }
}

const transferSchema = z.object({
  toAgentOwnerId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function transferHostAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    const input = transferSchema.parse(req.body ?? {});
    ok(res, await svc.transferHostAgency(req.admin!.id, hostId, input, req.ip));
  } catch (e) { next(e); }
}

const removeSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function removeHostAgency(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    const input = removeSchema.parse(req.body ?? {});
    ok(res, await svc.removeHostAgency(req.admin!.id, hostId, input, req.ip));
  } catch (e) { next(e); }
}

const abuseSchema = z.object({
  window: z.enum(['7d', '30d']).default('30d'),
  minChanges: z.coerce.number().int().min(1).max(50).default(2),
  agencyOwnerId: z.string().uuid().optional(),
});

export async function listMultiAgencyAbuse(req: Request, res: Response, next: NextFunction) {
  try {
    const q = abuseSchema.parse(req.query);
    ok(res, await svc.listMultiAgencyAbuse(q));
  } catch (e) { next(e); }
}

const revenueSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('month'),
});

export async function getHostRevenue(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    const q = revenueSchema.parse(req.query);
    ok(res, await svc.getHostRevenue(hostId, q.period));
  } catch (e) { next(e); }
}

const banTaskSchema = z.object({ reason: z.string().min(1).max(300).default('Policy violation') });

export async function banHostTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    const { reason } = banTaskSchema.parse(req.body ?? {});
    ok(res, await svc.banHostTask(req.admin!.id, hostId, reason, req.ip));
  } catch (e) { next(e); }
}

export async function releaseHostTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { hostId } = hostIdSchema.parse(req.params);
    ok(res, await svc.releaseHostTask(req.admin!.id, hostId, req.ip));
  } catch (e) { next(e); }
}
