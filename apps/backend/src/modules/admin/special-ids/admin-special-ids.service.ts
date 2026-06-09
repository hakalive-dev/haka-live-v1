import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import {
  assertValidSpecialIdFormat,
  generateUniqueSpecialIdNumber,
  isSpecialIdNumberTaken,
} from '../../../utils/specialId';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListParams {
  page: number;
  limit: number;
  search?: string;
  level?: string;
  status?: string;
}

export interface CreatePayload {
  number?: string;   // admin-provided 6-digit number; auto-generated if omitted
  price: number;
  durationDays: number;
  level: string;
}

export interface UpdatePayload {
  price?: number;
  durationDays?: number;
  level?: string;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

type SpecialIdRow = Prisma.SpecialIdGetPayload<{ include: { inventory: { include: { user: { select: { id: true; displayName: true; username: true; avatar: true; hakaId: true } } } } } }>;

function formatRow(row: SpecialIdRow) {
  return {
    id: row.id,
    number: row.number,
    price: row.price,
    durationDays: row.durationDays,
    level: row.level,
    status: row.status,
    owner: row.inventory
      ? {
          inventoryId: row.inventory.id,
          userId: row.inventory.userId,
          user: row.inventory.user,
          pricePaid: row.inventory.pricePaid,
          purchasedAt: row.inventory.purchasedAt.toISOString(),
          activatedAt: row.inventory.activatedAt?.toISOString() ?? null,
          expiresAt: row.inventory.expiresAt?.toISOString() ?? null,
          status: row.inventory.status,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeInventory = {
  inventory: {
    include: {
      user: {
        select: { id: true, displayName: true, username: true, avatar: true, hakaId: true },
      },
    },
  },
} satisfies Prisma.SpecialIdInclude;

// ── Service methods ────────────────────────────────────────────────────────────

export async function listSpecialIds(params: ListParams) {
  const { page, limit, search, level, status } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.SpecialIdWhereInput = {};
  if (level) where.level = level;
  if (status) where.status = status;
  if (search) {
    where.number = { contains: search };
  }

  const [rows, total] = await Promise.all([
    prisma.specialId.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ level: 'asc' }, { createdAt: 'desc' }],
      include: includeInventory,
    }),
    prisma.specialId.count({ where }),
  ]);

  return {
    rows: rows.map(formatRow),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createSpecialId(
  adminId: string,
  payload: CreatePayload,
  ipAddress?: string,
) {
  let number: string;
  if (payload.number) {
    number = assertValidSpecialIdFormat(payload.number);
    const taken = await isSpecialIdNumberTaken(number);
    if (taken) throw new AppError('Special ID number already exists', 409);
  } else {
    number = await generateUniqueSpecialIdNumber();
  }

  const created = await prisma.specialId.create({
    data: {
      number,
      price: payload.price,
      durationDays: payload.durationDays,
      level: payload.level,
      status: 'available',
    },
    include: includeInventory,
  });

  await logAdminAction(adminId, 'specialId.create', 'SpecialId', created.id, {
    number,
    price: payload.price,
    durationDays: payload.durationDays,
    level: payload.level,
    manualNumber: !!payload.number,
  }, ipAddress);

  return formatRow(created);
}

export async function updateSpecialId(
  adminId: string,
  specialIdId: string,
  payload: UpdatePayload,
  ipAddress?: string,
) {
  const existing = await prisma.specialId.findUnique({
    where: { id: specialIdId },
    include: includeInventory,
  });
  if (!existing) throw new AppError('Special ID not found', 404);
  if (existing.status !== 'available') {
    throw new AppError('Cannot edit a Special ID that is currently owned', 400);
  }

  const data: Prisma.SpecialIdUpdateInput = {};
  if (payload.price !== undefined) data.price = payload.price;
  if (payload.durationDays !== undefined) data.durationDays = payload.durationDays;
  if (payload.level !== undefined) data.level = payload.level;

  if (Object.keys(data).length === 0) {
    return formatRow(existing);
  }

  const updated = await prisma.specialId.update({
    where: { id: specialIdId },
    data,
    include: includeInventory,
  });

  await logAdminAction(adminId, 'specialId.update', 'SpecialId', specialIdId, {
    changes: payload,
  }, ipAddress);

  return formatRow(updated);
}

export async function removeSpecialId(
  adminId: string,
  specialIdId: string,
  ipAddress?: string,
) {
  const existing = await prisma.specialId.findUnique({
    where: { id: specialIdId },
  });
  if (!existing) throw new AppError('Special ID not found', 404);
  if (existing.status !== 'available') {
    throw new AppError('Cannot delete a Special ID that is currently owned', 400);
  }

  await prisma.specialId.delete({ where: { id: specialIdId } });

  await logAdminAction(adminId, 'specialId.remove', 'SpecialId', specialIdId, {
    number: existing.number,
    level: existing.level,
  }, ipAddress);

  return { message: 'Special ID removed' };
}

export async function revokeSpecialId(
  adminId: string,
  specialIdId: string,
  ipAddress?: string,
) {
  const existing = await prisma.specialId.findUnique({
    where: { id: specialIdId },
    include: includeInventory,
  });
  if (!existing) throw new AppError('Special ID not found', 404);
  if (existing.status !== 'owned' || !existing.inventory) {
    throw new AppError('Special ID is not currently owned', 400);
  }

  const { inventory } = existing;

  await prisma.$transaction([
    prisma.specialIdInventory.delete({ where: { id: inventory.id } }),
    prisma.specialId.update({ where: { id: specialIdId }, data: { status: 'available' } }),
  ]);

  await logAdminAction(adminId, 'specialId.revoke', 'SpecialId', specialIdId, {
    number: existing.number,
    level: existing.level,
    revokedFromUserId: inventory.userId,
    inventoryStatus: inventory.status,
  }, ipAddress);

  return { message: 'Special ID revoked' };
}

export async function checkAvailability(candidate: string) {
  const taken = await isSpecialIdNumberTaken(candidate);
  if (!taken) return { available: true };
  return { available: false, reason: 'taken' as const };
}
