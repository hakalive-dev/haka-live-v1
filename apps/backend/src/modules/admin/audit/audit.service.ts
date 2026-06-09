import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';

export interface ListAuditParams {
  page: number;
  limit: number;
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function listAuditLogs(params: ListAuditParams) {
  const { page, limit, adminId, action, targetType, targetId, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {};
  if (adminId) where.adminId = adminId;
  if (action) where.action = { contains: action };
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = { contains: targetId };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, skip, take: limit,
      orderBy: { [sort]: order },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Enrich logs with admin display names
  const adminIds = [...new Set(logs.map(l => l.adminId))];
  const admins = await prisma.adminUser.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, displayName: true, email: true },
  });
  const adminMap = new Map(admins.map(a => [a.id, a]));

  const enrichedLogs = logs.map(log => ({
    ...log,
    admin: adminMap.get(log.adminId) || null,
  }));

  return {
    logs: enrichedLogs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
