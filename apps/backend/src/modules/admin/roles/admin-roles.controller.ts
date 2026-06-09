import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as rolesService from './admin-roles.service';
import { ok, created } from '../../../utils/response';

const roleSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Name must be lowercase alphanumeric with underscores'),
  displayName: z.string().min(1),
  color: z.string().default('#7B4FFF'),
  permissions: z.array(z.string()).min(1),
});

export async function getAllRoles(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await rolesService.getAllRoles()); } catch (err) { next(err); }
}

export async function listCustomRoles(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await rolesService.listCustomRoles()); } catch (err) { next(err); }
}

export async function createCustomRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, displayName, color, permissions } = roleSchema.parse(req.body);
    const role = await rolesService.createCustomRole(name, displayName, permissions, color, req.admin!.id);
    created(res, role, 'Custom role created');
  } catch (err) { next(err); }
}

export async function updateCustomRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { displayName, color, permissions } = roleSchema.omit({ name: true }).parse(req.body);
    const role = await rolesService.updateCustomRole(req.params.name, displayName, permissions, color);
    ok(res, role, 'Role updated');
  } catch (err) { next(err); }
}

export async function deleteCustomRole(req: Request, res: Response, next: NextFunction) {
  try {
    await rolesService.deleteCustomRole(req.params.name);
    ok(res, null, 'Role deleted');
  } catch (err) { next(err); }
}
