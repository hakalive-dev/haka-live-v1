import { Request, Response, NextFunction } from 'express';
import * as svc from './admin-cs.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

export async function listCs(req: Request, res: Response, next: NextFunction) {
  try {
    const region    = req.query.region    as string | undefined;
    const managerId = req.query.managerId as string | undefined;
    ok(res, await svc.listCs({ region, managerId }));
  } catch (e) { next(e); }
}

export async function getCsDetail(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.getCsDetail(req.params.id)); }
  catch (e) { next(e); }
}

export async function suspendCs(req: Request, res: Response, next: NextFunction) {
  try { await svc.setCsActive(req.params.id, false); ok(res, null); }
  catch (e) { next(e); }
}

export async function reactivateCs(req: Request, res: Response, next: NextFunction) {
  try { await svc.setCsActive(req.params.id, true); ok(res, null); }
  catch (e) { next(e); }
}
