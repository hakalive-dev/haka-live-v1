import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from '../../agency/agent-application.service';
import { ok } from '../../../utils/response';

const reviewSchema = z.object({ note: z.string().max(500).default('') });
const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = listQuerySchema.parse(req.query);
    ok(res, await svc.adminListAgentApplications(status));
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = reviewSchema.parse(req.body);
    ok(res, await svc.adminApproveAgentApplication(req.admin!.id, req.params.id, note, req.ip));
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = reviewSchema.parse(req.body);
    ok(res, await svc.adminRejectAgentApplication(req.admin!.id, req.params.id, note, req.ip));
  } catch (err) { next(err); }
}
