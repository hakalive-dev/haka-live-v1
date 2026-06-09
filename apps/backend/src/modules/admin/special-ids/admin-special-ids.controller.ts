import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-special-ids.service';
import { ok } from '../../../utils/response';
import { SPECIAL_ID_REGEX } from '../../../utils/specialId';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  level: z.enum(['SSS', 'SS', 'S', 'A', 'B']).optional(),
  status: z.enum(['available', 'owned']).optional(),
});

const createSchema = z.object({
  number: z.string().regex(SPECIAL_ID_REGEX, 'Must be exactly 6 digits').optional(),
  price: z.number().int().positive(),
  durationDays: z.number().int().positive(),
  level: z.enum(['SSS', 'SS', 'S', 'A', 'B']),
});

const updateSchema = z.object({
  price: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  level: z.enum(['SSS', 'SS', 'S', 'A', 'B']).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await svc.listSpecialIds(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = createSchema.parse(req.body);
    const result = await svc.createSpecialId(req.admin!.id, payload, req.ip);
    ok(res, result, 'Special ID created', 201);
  } catch (err) { next(err); }
}

export async function checkAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.checkAvailability(req.params.candidate);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = updateSchema.parse(req.body);
    const result = await svc.updateSpecialId(req.admin!.id, req.params.id, payload, req.ip);
    ok(res, result, 'Special ID updated');
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.removeSpecialId(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function revoke(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await svc.revokeSpecialId(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}
