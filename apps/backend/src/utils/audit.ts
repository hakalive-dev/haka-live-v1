import { prisma } from '../config/prisma';

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: object,
  ipAddress?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      metadata: metadata ?? undefined,
      ipAddress: ipAddress ?? '',
    },
  });
}
