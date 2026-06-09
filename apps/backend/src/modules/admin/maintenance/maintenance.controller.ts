import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../../../utils/response';
import { logAdminAction } from '../../../utils/audit';
import {
  getMaintenance,
  enableMaintenance,
  disableMaintenance,
} from '../../../utils/maintenance';

const enableSchema = z.object({
  message: z.string().max(280).optional(),
  reason: z.string().max(280).optional(),
});

export async function getStatus(_req: Request, res: Response): Promise<void> {
  const state = await getMaintenance();
  ok(res, state);
}

export async function enable(req: Request, res: Response): Promise<void> {
  const parsed = enableSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, 'Invalid request', 400, parsed.error.flatten().fieldErrors);
    return;
  }

  const adminId = req.admin!.id;
  const state = await enableMaintenance({
    by: adminId,
    message: parsed.data.message,
    reason: parsed.data.reason,
  });

  await logAdminAction(
    adminId,
    'maintenance.enable',
    'system',
    'maintenance',
    { message: state.message, reason: state.reason },
    req.ip,
  );

  ok(res, state, 'Maintenance mode enabled');
}

export async function disable(req: Request, res: Response): Promise<void> {
  const adminId = req.admin!.id;
  const state = await disableMaintenance(adminId);

  await logAdminAction(
    adminId,
    'maintenance.disable',
    'system',
    'maintenance',
    undefined,
    req.ip,
  );

  ok(res, state, 'Maintenance mode disabled');
}
