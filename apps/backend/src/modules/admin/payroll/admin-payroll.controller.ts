import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../../../utils/response';
import * as service from './admin-payroll.service';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page:          z.coerce.number().int().positive().default(1),
  limit:         z.coerce.number().int().positive().max(100).default(20),
  status:        z.enum(['pending', 'paid', 'rejected']).optional(),
  recipientType: z.enum(['host', 'agent']).optional(),
});

const createSchema = z.object({
  recipientId:   z.string().uuid(),
  recipientType: z.enum(['host', 'agent']),
  amountBeans:   z.number().int().positive(),
  periodStart:   z.string().datetime(),
  periodEnd:     z.string().datetime(),
  notes:         z.string().optional(),
});

const rejectSchema = z.object({
  notes: z.string().default(''),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    ok(res, await service.listPayroll(params));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    ok(res, await service.createPayrollRecord(data, req.admin!.id, req.ip!), 'Payroll record created');
  } catch (err) { next(err); }
}

export async function process(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await service.processPayroll(req.params.id, req.admin!.id, req.ip!), 'Payroll processed and beans credited');
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes } = rejectSchema.parse(req.body);
    ok(res, await service.rejectPayroll(req.params.id, notes, req.admin!.id, req.ip!), 'Payroll rejected');
  } catch (err) { next(err); }
}
