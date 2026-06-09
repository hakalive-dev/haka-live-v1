import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as familiesService from './admin-families.service';
import { ok } from '../../../utils/response';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  tier:   z.enum(['gold', 'silver', 'bronze']).optional(),
});

const updateSchema = z.object({
  name:         z.string().min(1).optional(),
  tier:         z.enum(['gold', 'silver', 'bronze']).optional(),
  badge:        z.string().optional(),
  announcement: z.string().optional(),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await familiesService.listFamilies(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const family = await familiesService.getFamilyDetail(req.params.id);
    ok(res, family);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const family = await familiesService.updateFamily(req.params.id, data, req.admin!.id, req.ip);
    ok(res, family, 'Family updated');
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await familiesService.removeFamily(req.params.id, req.admin!.id, req.ip);
    ok(res, null, 'Family deleted');
  } catch (err) { next(err); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    await familiesService.removeFamilyMember(
      req.params.id,
      req.params.userId,
      req.admin!.id,
      req.ip,
    );
    ok(res, null, 'Member removed');
  } catch (err) { next(err); }
}
