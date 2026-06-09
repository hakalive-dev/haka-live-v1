import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './admin-tags.service';
import { ok } from '../../../utils/response';

const createSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/i),
  displayName: z.string().min(1),
  color: z.string().default('#7B4FFF'),
  iconUrl: z.string().default(''),
  permissions: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  color: z.string().optional(),
  iconUrl: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const assignSchema = z.object({
  tagId: z.string(),
});

const bulkAssignSchema = z.object({
  tagId: z.string(),
  userIds: z.array(z.string()).min(1).max(500),
});

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.listTags()); } catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const b = createSchema.parse(req.body);
    ok(res, await svc.createTag(req.admin!.id, b.name, b.displayName, b.color, b.iconUrl, b.permissions, req.ip));
  } catch (e) { next(e); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const b = updateSchema.parse(req.body);
    ok(res, await svc.updateTag(req.admin!.id, req.params.id, b, req.ip));
  } catch (e) { next(e); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.deleteTag(req.admin!.id, req.params.id, req.ip)); } catch (e) { next(e); }
}

export async function listForUser(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.listUserTags(req.params.userId)); } catch (e) { next(e); }
}

export async function assign(req: Request, res: Response, next: NextFunction) {
  try {
    const { tagId } = assignSchema.parse(req.body);
    ok(res, await svc.assignTag(req.admin!.id, req.params.userId, tagId, req.ip));
  } catch (e) { next(e); }
}

export async function bulkAssign(req: Request, res: Response, next: NextFunction) {
  try {
    const { tagId, userIds } = bulkAssignSchema.parse(req.body);
    ok(res, await svc.bulkAssignTags(req.admin!.id, userIds, tagId, req.ip));
  } catch (e) { next(e); }
}

export async function revoke(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await svc.revokeTag(req.admin!.id, req.params.userId, req.params.tagId, req.ip));
  } catch (e) { next(e); }
}
