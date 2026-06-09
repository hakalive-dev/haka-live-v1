import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../../../utils/response';
import {
  createPayrollAgentProfile,
  updatePayrollAgentProfile,
  listAgentsForCountry,
  resolveUserByHakaId,
} from '../../payroll-agent/payroll-agent-profile.service';
import { logAdminAction } from '../../../utils/audit';

const createSchema = z.object({
  hakaId: z.string().trim().min(1),
  countryCode: z.string().trim().toUpperCase().length(2),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
});

const updateSchema = z.object({
  status: z.enum(['active', 'frozen', 'suspended']).optional(),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  acceptingOrders: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const countryCode = typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
    const profiles = await listAgentsForCountry(countryCode);
    ok(res, profiles.map((p) => ({
      userId: p.userId,
      payrollId: p.payrollId,
      countryCode: p.countryCode,
      status: p.status,
      commissionPercent: Number(p.commissionPercent),
      acceptingOrders: p.acceptingOrders,
      riskScore: p.riskScore,
      user: p.user,
    })));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const user = await resolveUserByHakaId(body.hakaId);
    const profile = await createPayrollAgentProfile({
      userId: user.id,
      countryCode: body.countryCode,
      commissionPercent: body.commissionPercent,
    });
    await logAdminAction(
      req.admin!.id,
      'payroll_agent.create',
      'PayrollAgentProfile',
      profile.userId,
      { hakaId: body.hakaId, countryCode: body.countryCode, commissionPercent: body.commissionPercent },
      req.ip,
    );
    ok(res, profile, 'Payroll agent created');
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const profile = await updatePayrollAgentProfile(req.params.userId, body);
    await logAdminAction(
      req.admin!.id,
      'payroll_agent.update',
      'PayrollAgentProfile',
      profile.userId,
      body,
      req.ip,
    );
    ok(res, profile, 'Payroll agent updated');
  } catch (err) { next(err); }
}
