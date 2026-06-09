import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { emitToAdminStaff } from '../../../sockets/admin-realtime';

export interface CreateAdminNotificationInput {
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
  entityType?: string;
  entityId?: string;
}

/** Dedupe: skip if same type+entityId already has an unread row (entityId must be non-empty). */
export async function createAdminNotification(input: CreateAdminNotificationInput) {
  const body = input.body ?? '';
  const linkPath = input.linkPath ?? '';
  const entityType = input.entityType ?? '';
  const entityId = input.entityId ?? '';

  if (entityId) {
    const existing = await prisma.adminNotification.findFirst({
      where: {
        type: input.type,
        entityId,
        readAt: null,
      },
    });
    if (existing) return existing;
  }

  const row = await prisma.adminNotification.create({
    data: {
      type: input.type,
      title: input.title,
      body,
      linkPath,
      entityType,
      entityId,
    },
  });

  emitToAdminStaff('admin:notification', {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.linkPath,
    entityType: row.entityType,
    entityId: row.entityId,
  });

  if (entityType) {
    const resource = adminEntityTypeToResource(entityType);
    if (resource) {
      emitToAdminStaff('admin:data_changed', { resource, entityId });
    }
  }

  return row;
}

function adminEntityTypeToResource(entityType: string): string | null {
  const map: Record<string, string> = {
    SellerRechargeRequest: 'seller_recharges',
    SellerExchangeRequest: 'seller_exchanges',
    WithdrawalRequest: 'withdrawals',
    SupportTicket: 'support_tickets',
    AgentApplication: 'agent_applications',
    HostApplication: 'host_applications',
    FaceVerificationSession: 'face_verifications',
  };
  return map[entityType] ?? null;
}

export interface ListAdminNotificationsParams {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export async function listAdminNotifications(params: ListAdminNotificationsParams) {
  const { page, limit, unreadOnly } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AdminNotificationWhereInput = {};
  if (unreadOnly) where.readAt = null;

  const [items, total] = await Promise.all([
    prisma.adminNotification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.adminNotification.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function unreadAdminNotificationCount() {
  return prisma.adminNotification.count({ where: { readAt: null } });
}

export async function markAdminNotificationRead(id: string) {
  try {
    return await prisma.adminNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
    throw e;
  }
}

export async function markAllAdminNotificationsRead() {
  const now = new Date();
  await prisma.adminNotification.updateMany({
    where: { readAt: null },
    data: { readAt: now },
  });
  return { marked: true };
}
