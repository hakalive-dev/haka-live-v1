import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from '../../agency/change-request.service';
import { ok } from '../../../utils/response';

const rejectSchema = z.object({ reason: z.string().max(500).default('') });
const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = listQuerySchema.parse(req.query);
    ok(res, await svc.adminListChangeRequests(status));
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.adminApproveChangeRequest(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = rejectSchema.parse(req.body);
    ok(res, await svc.adminRejectChangeRequest(req.admin!.id, req.params.id, reason, req.ip));
  } catch (err) { next(err); }
}
