import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { ROLE_PERMISSIONS } from '../../../shared-types';

const BUILT_IN_ROLES = Object.keys(ROLE_PERMISSIONS);

export async function listCustomRoles() {
  return prisma.adminCustomRole.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getCustomRole(name: string) {
  const role = await prisma.adminCustomRole.findUnique({ where: { name } });
  if (!role) throw new AppError('Role not found', 404);
  return role;
}

export async function createCustomRole(
  name: string,
  displayName: string,
  permissions: string[],
  color: string,
  createdBy: string,
) {
  if (BUILT_IN_ROLES.includes(name)) throw new AppError('Cannot override a built-in role name', 409);
  const existing = await prisma.adminCustomRole.findUnique({ where: { name } });
  if (existing) throw new AppError('Role name already exists', 409);

  return prisma.adminCustomRole.create({
    data: { name, displayName, permissions, color, createdBy },
  });
}

export async function updateCustomRole(
  name: string,
  displayName: string,
  permissions: string[],
  color: string,
) {
  const role = await prisma.adminCustomRole.findUnique({ where: { name } });
  if (!role) throw new AppError('Role not found', 404);
  return prisma.adminCustomRole.update({
    where: { name },
    data: { displayName, permissions, color },
  });
}

export async function deleteCustomRole(name: string) {
  const role = await prisma.adminCustomRole.findUnique({ where: { name } });
  if (!role) throw new AppError('Role not found', 404);
  // Reassign any staff holding this role — as primary role OR in roles[] — to 'moderator'
  // before deleting, so no account is left referencing a non-existent role.
  const affected = await prisma.adminUser.findMany({
    where: { OR: [{ role: name }, { roles: { has: name } }] },
    select: { id: true, role: true, roles: true },
  });
  for (const a of affected) {
    const nextRoles = (a.roles?.length ? a.roles : [a.role]).map((r) => (r === name ? 'moderator' : r));
    await prisma.adminUser.update({
      where: { id: a.id },
      data: {
        role: a.role === name ? 'moderator' : a.role,
        roles: [...new Set(nextRoles)],
      },
    });
  }
  await prisma.adminCustomRole.delete({ where: { name } });
}

export async function getAllRoles() {
  const custom = await prisma.adminCustomRole.findMany({ orderBy: { displayName: 'asc' } });
  const builtIn = [
    { name: 'super_admin', displayName: 'Super Admin',  color: '#F59E0B', isBuiltIn: true, permissions: ROLE_PERMISSIONS['super_admin'] },
    { name: 'admin',       displayName: 'Admin',        color: '#7B4FFF', isBuiltIn: true, permissions: ROLE_PERMISSIONS['admin'] },
    { name: 'cs',          displayName: 'CS',           color: '#8B5CF6', isBuiltIn: true, permissions: ROLE_PERMISSIONS['cs'] },
    { name: 'moderator',   displayName: 'Moderator',    color: '#3B82F6', isBuiltIn: true, permissions: ROLE_PERMISSIONS['moderator'] },
    { name: 'assistant',   displayName: 'Assistant',    color: '#6B7280', isBuiltIn: true, permissions: ROLE_PERMISSIONS['assistant'] },
    { name: 'operator',    displayName: 'Operator',     color: '#10B981', isBuiltIn: true, permissions: ROLE_PERMISSIONS['operator'] },
    { name: 'bdm',         displayName: 'BDM',          color: '#059669', isBuiltIn: true, permissions: ROLE_PERMISSIONS['bdm'] },
  ];
  return {
    builtIn,
    custom: custom.map(r => ({ ...r, isBuiltIn: false })),
  };
}
