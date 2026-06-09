import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-regions.service';

const ok = (res: Response, data: unknown, code = 200) => res.status(code).json({ success: true, data });

export async function list(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.listRegions()); } catch (e) { next(e); }
}

const createSchema = z.object({ code: z.string().min(1).max(16), name: z.string().min(1) }).strict();
export async function create(req: Request, res: Response, next: NextFunction) {
  try { const b = createSchema.parse(req.body); ok(res, await svc.createRegion(b.code, b.name), 201); }
  catch (e) { next(e); }
}

const updateSchema = z.object({ name: z.string().optional(), isActive: z.boolean().optional() }).strict();
export async function update(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.updateRegion(req.params.code, updateSchema.parse(req.body))); }
  catch (e) { next(e); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try { await svc.deleteRegion(req.params.code); ok(res, { code: req.params.code }); }
  catch (e) { next(e); }
}
