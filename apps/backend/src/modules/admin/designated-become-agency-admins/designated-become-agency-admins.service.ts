import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

const ADMIN_SELECT = {
  id: true,
  adminId: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  admin: {
    select: {
      id: true,
      displayName: true,
      hakaId: true,
      region: true,
      role: true,
      isActive: true,
    },
  },
} as const;

async function resolveAdminUser(adminId?: string, hakaId?: string) {
  const id = adminId?.trim();
  const hid = hakaId?.trim();
  if (!id && !hid) {
    throw new AppError('adminId or hakaId is required', 400);
  }

  const admin = await prisma.adminUser.findFirst({
    where: id
      ? { id, deletedAt: null }
      : { hakaId: { equals: hid!, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, displayName: true, hakaId: true, isActive: true },
  });
  if (!admin) throw new AppError('Admin staff not found', 404);
  if (!admin.isActive) throw new AppError('Admin staff account is suspended', 400);
  if (!admin.hakaId?.trim()) {
    throw new AppError('Admin must have a Haka ID before being listed in Become Agency', 400);
  }
  return admin;
}

export async function listDesignatedBecomeAgencyAdmins() {
  return prisma.designatedBecomeAgencyAdmin.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: ADMIN_SELECT,
  });
}

export async function createDesignatedBecomeAgencyAdmin(
  input: { adminId?: string; hakaId?: string; sortOrder?: number },
  actorAdminId: string,
  ip: string,
) {
  const admin = await resolveAdminUser(input.adminId, input.hakaId);

  const existing = await prisma.designatedBecomeAgencyAdmin.findUnique({
    where: { adminId: admin.id },
  });
  if (existing) throw new AppError('This admin is already in the Become Agency list', 409);

  const row = await prisma.designatedBecomeAgencyAdmin.create({
    data: {
      adminId: admin.id,
      sortOrder: input.sortOrder ?? 0,
    },
    select: ADMIN_SELECT,
  });

  await logAdminAction(
    actorAdminId,
    'designated_become_agency_admin.create',
    'DesignatedBecomeAgencyAdmin',
    row.id,
    { adminId: admin.id, hakaId: admin.hakaId },
    ip,
  );

  return row;
}

export async function updateDesignatedBecomeAgencyAdmin(
  id: string,
  data: { sortOrder?: number; isActive?: boolean },
  actorAdminId: string,
  ip: string,
) {
  const existing = await prisma.designatedBecomeAgencyAdmin.findUnique({ where: { id } });
  if (!existing) throw new AppError('Designated admin entry not found', 404);

  const row = await prisma.designatedBecomeAgencyAdmin.update({
    where: { id },
    data,
    select: ADMIN_SELECT,
  });

  await logAdminAction(
    actorAdminId,
    'designated_become_agency_admin.update',
    'DesignatedBecomeAgencyAdmin',
    id,
    data,
    ip,
  );

  return row;
}

export async function deleteDesignatedBecomeAgencyAdmin(
  id: string,
  actorAdminId: string,
  ip: string,
) {
  const existing = await prisma.designatedBecomeAgencyAdmin.findUnique({
    where: { id },
    include: { admin: { select: { hakaId: true } } },
  });
  if (!existing) throw new AppError('Designated admin entry not found', 404);

  await prisma.designatedBecomeAgencyAdmin.delete({ where: { id } });

  await logAdminAction(
    actorAdminId,
    'designated_become_agency_admin.delete',
    'DesignatedBecomeAgencyAdmin',
    id,
    { adminId: existing.adminId, hakaId: existing.admin.hakaId },
    ip,
  );

  return { deleted: true };
}

/** Mobile Become Agency — active designated admins with Haka ID. */
export async function listActiveDesignatedBecomeAgencyAdminsForMobile() {
  const rows = await prisma.designatedBecomeAgencyAdmin.findMany({
    where: {
      isActive: true,
      admin: {
        isActive: true,
        deletedAt: null,
        hakaId: { not: null },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      admin: {
        select: {
          displayName: true,
          hakaId: true,
          region: true,
        },
      },
    },
  });

  return rows
    .filter((r) => r.admin.hakaId?.trim())
    .map((r) => ({
      id: r.id,
      hakaId: r.admin.hakaId!,
      displayName: r.admin.displayName,
      region: r.admin.region,
    }));
}

export async function resolveActiveDesignatedAdminByHakaId(hakaIdRaw: string) {
  const hakaId = hakaIdRaw.trim();
  if (!hakaId) throw new AppError('Admin Haka ID is required', 400);

  const row = await prisma.designatedBecomeAgencyAdmin.findFirst({
    where: {
      isActive: true,
      admin: {
        isActive: true,
        deletedAt: null,
        hakaId: { equals: hakaId, mode: 'insensitive' },
      },
    },
    select: {
      id: true,
      adminId: true,
      admin: { select: { id: true, hakaId: true, displayName: true, region: true } },
    },
  });

  if (!row) throw new AppError('Admin is not available for agency applications', 400);
  return row;
}
