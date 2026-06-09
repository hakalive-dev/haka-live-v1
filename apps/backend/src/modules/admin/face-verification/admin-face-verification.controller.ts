import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../../../utils/response';
import * as service from '../../face-verification/face-verification.service';

export async function listPending(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const data = await service.listPendingSessions({ page, limit });
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getSessionDetail(req.params.sessionId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.approveSession(
      req.admin!.id,
      req.params.sessionId,
      req.ip,
    );
    ok(res, data, 'Face verification approved');
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const data = await service.rejectSession(
      req.admin!.id,
      req.params.sessionId,
      parsed.data.reason ?? '',
      req.ip,
    );
    ok(res, data, 'Face verification rejected');
  } catch (err) {
    next(err);
  }
}
