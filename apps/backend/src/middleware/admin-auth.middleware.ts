import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/jwt';
import { fail } from '../utils/response';
import { ROLE_PERMISSIONS } from '../shared-types';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; role: string; roles?: string[]; permissions?: string[] };
    }
  }
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    fail(res, 'Authentication required', 401);
    return;
  }
  const token = header.slice(7);
  try {
    const payload = verifyAdminToken(token);
    req.admin = {
      id: payload.sub,
      role: payload.role,
      roles: payload.roles?.length ? payload.roles : [payload.role],
    };
    next();
  } catch {
    fail(res, 'Invalid or expired token', 401);
  }
}

// Role-based gate (legacy — prefer requirePermission for new routes).
// Matches if the account holds ANY of the allowed roles.
export function requireAdminRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const held = req.admin?.roles?.length
      ? req.admin.roles
      : (req.admin ? [req.admin.role] : []);
    if (!req.admin || !held.some((r) => roles.includes(r))) {
      fail(res, 'Forbidden', 403);
      return;
    }
    next();
  };
}

// Permission-based gate. Resolves per-staff overrides and custom roles from DB.
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.admin) { fail(res, 'Authentication required', 401); return; }

    try {
      const perms = req.admin.permissions ?? await resolveAdminPermissions(req.admin.role, req.admin.id);
      req.admin.permissions = perms;
      if (perms.includes('*') || perms.includes(permission)) { next(); return; }
      fail(res, 'Forbidden', 403);
    } catch {
      fail(res, 'Forbidden', 403);
    }
  };
}

export async function resolveAdminPermissions(role: string, adminId?: string): Promise<string[]> {
  // Permissions are the UNION of all roles the account holds. When an adminId is
  // given we read roles[] from the DB; otherwise we resolve just the passed role.
  let effectiveRoles: string[] = [role];
  let permissionsRevoked = false;
  let customPermissions: string[] | null = null;

  if (adminId) {
    try {
      const admin = await prisma.adminUser.findUnique({
        where: { id: adminId },
        select: { customPermissions: true, permissionsRevoked: true, roles: true, role: true },
      });

      if (!admin) return [];
      permissionsRevoked = admin.permissionsRevoked;
      if (admin.customPermissions?.length) customPermissions = admin.customPermissions;
      effectiveRoles = admin.roles?.length ? admin.roles : [admin.role];
    } catch {
      return [];
    }
  }

  // Super admin always wins unless permissions were explicitly revoked (security lock).
  if (effectiveRoles.includes('super_admin')) {
    return permissionsRevoked ? [] : ['*'];
  }
  if (permissionsRevoked) return [];
  if (customPermissions?.length) return customPermissions;

  const perms = new Set<string>();
  for (const r of effectiveRoles) {
    const builtIn = ROLE_PERMISSIONS[r];
    if (builtIn) {
      builtIn.forEach((p) => perms.add(p));
      continue;
    }
    // Unknown built-in → may be a custom role name.
    try {
      const customRole = await prisma.adminCustomRole.findUnique({ where: { name: r } });
      (customRole?.permissions as string[] | undefined)?.forEach((p) => perms.add(p));
    } catch {
      // ignore a single role's lookup failure; other roles still contribute
    }
  }
  return [...perms];
}

// Resolves all permissions for a given role (used by older call sites).
export async function resolvePermissions(role: string): Promise<string[]> {
  return resolveAdminPermissions(role);
}
