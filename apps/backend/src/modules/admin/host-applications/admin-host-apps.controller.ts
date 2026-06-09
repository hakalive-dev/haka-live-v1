import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './admin-host-apps.service';
import { ok } from '../../../utils/response';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

const reviewSchema = z.object({
  note: z.string().default(''),
});

export async function listHostApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await service.listHostApplications(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function approveApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = reviewSchema.parse(req.body);
    const result = await service.approveApplication(req.admin!.id, req.params.id, note, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function rejectApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = reviewSchema.parse(req.body);
    const result = await service.rejectApplication(req.admin!.id, req.params.id, note, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}
