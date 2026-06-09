import { Request, Response, NextFunction } from 'express';
import * as svc from './agency-invitations.service';
import { ok } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { createInvitationSchema, adminListQuerySchema, adminRejectSchema } from './agency-invitations.validation';

function callerUserId(req: Request): string {
  const id = req.user?.id;
  if (!id) throw new AppError('unauthorized', 401);
  return id;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createInvitationSchema.parse(req.body);
    ok(res, await svc.createInvitation({ callerUserId: callerUserId(req), ...body }));
  } catch (err) { next(err); }
}

export async function listForOwner(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.listInvitationsForOwner(callerUserId(req)));
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.cancelInvitation({ callerUserId: callerUserId(req), invitationId: req.params.id }));
  } catch (err) { next(err); }
}

function adminUserId(req: Request): string {
  const id = req.admin?.id;
  if (!id) throw new AppError('unauthorized', 401);
  return id;
}

export async function adminList(req: Request, res: Response, next: NextFunction) {
  try {
    const q = adminListQuerySchema.parse(req.query);
    ok(res, await svc.adminListInvitations(q));
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.approveInvitation({ adminUserId: adminUserId(req), invitationId: req.params.id }));
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const body = adminRejectSchema.parse(req.body ?? {});
    ok(res, await svc.rejectInvitation({ adminUserId: adminUserId(req), invitationId: req.params.id, note: body.note }));
  } catch (err) { next(err); }
}
