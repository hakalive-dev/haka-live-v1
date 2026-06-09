import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './designated-become-agency-admins.service';
import { ok, created } from '../../../utils/response';

const createSchema = z
  .object({
    adminId: z.string().uuid().optional(),
    hakaId: z.string().min(1).max(100).optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .refine((d) => d.adminId || d.hakaId?.trim(), {
    message: 'adminId or hakaId is required',
  });

const updateSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await service.listDesignatedBecomeAgencyAdmins());
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const row = await service.createDesignatedBecomeAgencyAdmin(
      body,
      req.admin!.id,
      req.ip ?? '',
    );
    created(res, row, 'Designated admin added');
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const row = await service.updateDesignatedBecomeAgencyAdmin(
      req.params.id,
      body,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, row, 'Designated admin updated');
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    ok(
      res,
      await service.deleteDesignatedBecomeAgencyAdmin(req.params.id, req.admin!.id, req.ip ?? ''),
      'Designated admin removed',
    );
  } catch (err) {
    next(err);
  }
}
