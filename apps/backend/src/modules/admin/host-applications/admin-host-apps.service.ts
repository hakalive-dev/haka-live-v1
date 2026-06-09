import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export async function listHostApplications(params: {
  page: number;
  limit: number;
  status?: string;
}) {
  const { page, limit, status } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.hostApplication.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true, hakaId: true, phone: true, role: true, hostType: true } },
        agent: { select: { id: true, displayName: true, hakaId: true } },
      },
    }),
    prisma.hostApplication.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function approveApplication(adminId: string, appId: string, note: string, ipAddress?: string) {
  const app = await prisma.hostApplication.findUnique({
    where: { id: appId },
    include: { user: true },
  });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application already reviewed', 400);
  if (app.path === 'agency_invitation') {
    throw new AppError('Agency invitations are decided by the invitee, not admin', 403);
  }

  await prisma.$transaction([
    prisma.hostApplication.update({
      where: { id: appId },
      data: { status: 'approved', note, reviewedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: app.userId },
      data: {
        role: 'host',
        hostType: app.agentId ? 'agent_host' : 'independent',
        hostApplicationPath: app.path,
        agentId: app.agentId || undefined,
      },
    }),
  ]);

  await logAdminAction(adminId, 'host_application.approve', 'HostApplication', appId, {
    userId: app.userId,
    path: app.path,
  }, ipAddress);

  return { message: 'Application approved — user promoted to host' };
}

export async function rejectApplication(adminId: string, appId: string, note: string, ipAddress?: string) {
  const app = await prisma.hostApplication.findUnique({ where: { id: appId } });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application already reviewed', 400);
  if (app.path === 'agency_invitation') {
    throw new AppError('Agency invitations are decided by the invitee, not admin', 403);
  }

  await prisma.hostApplication.update({
    where: { id: appId },
    data: { status: 'rejected', note, reviewedAt: new Date() },
  });

  await logAdminAction(adminId, 'host_application.reject', 'HostApplication', appId, {
    userId: app.userId,
    note,
  }, ipAddress);

  return { message: 'Application rejected' };
}
