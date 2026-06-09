import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { emitAdminDataChanged } from '../../../sockets/admin-realtime';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RiskControlData {
  freezeCoins:   boolean;
  freezeBeans:   boolean;
  disableGames:  boolean;
  disableGifts:  boolean;
  blockChat:     boolean;
  reason:        string;
  severity:      string;
  duration:      string;  // '24h' | '7d' | '30d' | 'permanent'
  notes:         string;
  evidenceUrls?: string[];
}

function calcExpiresAt(duration: string): Date | null {
  const now = new Date();
  if (duration === '24h')  { now.setHours(now.getHours() + 24);   return now; }
  if (duration === '7d')   { now.setDate(now.getDate() + 7);       return now; }
  if (duration === '30d')  { now.setDate(now.getDate() + 30);      return now; }
  return null; // permanent
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listRisks(opts: {
  page: number;
  limit: number;
  status?: 'active' | 'released' | 'all';
  severity?: string;
  search?: string;
}) {
  const { page, limit, status = 'active', severity, search } = opts;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (status === 'active')   where.isActive = true;
  if (status === 'released') where.isActive = false;
  if (severity)              where.severity = severity;

  if (search) {
    where.user = {
      OR: [
        { displayName: { contains: search, mode: 'insensitive' } },
        { hakaId:      { contains: search, mode: 'insensitive' } },
        { username:    { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  const [risks, total] = await Promise.all([
    prisma.accountRisk.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            hakaId: true,
            avatar: true,
            role: true,
          },
        },
      },
    }),
    prisma.accountRisk.count({ where }),
  ]);

  return { risks, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getActiveRisk(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const active = await prisma.accountRisk.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const history = await prisma.accountRisk.findMany({
    where: { userId, isActive: false },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return { user, active, history };
}

export async function applyRisk(userId: string, data: RiskControlData, adminId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const expiresAt = calcExpiresAt(data.duration);

  // Deactivate any existing active risk first
  await prisma.accountRisk.updateMany({
    where: { userId, isActive: true },
    data:  { isActive: false, releasedAt: new Date(), releasedBy: adminId },
  });

  const risk = await prisma.accountRisk.create({
    data: {
      userId,
      freezeCoins:  data.freezeCoins,
      freezeBeans:  data.freezeBeans,
      disableGames: data.disableGames,
      disableGifts: data.disableGifts,
      blockChat:    data.blockChat,
      reason:       data.reason,
      severity:     data.severity,
      notes:        data.notes,
      evidenceUrls: data.evidenceUrls ?? [],
      expiresAt,
      appliedBy:    adminId,
    },
    include: { user: { select: { id: true, displayName: true, hakaId: true } } },
  });
  emitAdminDataChanged('user_risk', { userId });
  return risk;
}

export async function updateRisk(userId: string, data: RiskControlData, adminId: string) {
  const active = await prisma.accountRisk.findFirst({
    where: { userId, isActive: true },
  });
  if (!active) throw new AppError('No active risk control for this user', 404);

  const expiresAt = calcExpiresAt(data.duration);

  const risk = await prisma.accountRisk.update({
    where: { id: active.id },
    data: {
      freezeCoins:  data.freezeCoins,
      freezeBeans:  data.freezeBeans,
      disableGames: data.disableGames,
      disableGifts: data.disableGifts,
      blockChat:    data.blockChat,
      reason:       data.reason,
      severity:     data.severity,
      notes:        data.notes,
      evidenceUrls: data.evidenceUrls ?? active.evidenceUrls,
      expiresAt,
      appliedBy:    adminId,
    },
    include: { user: { select: { id: true, displayName: true, hakaId: true } } },
  });
  emitAdminDataChanged('user_risk', { userId });
  return risk;
}

export async function releaseRisk(userId: string, adminId: string) {
  const active = await prisma.accountRisk.findFirst({
    where: { userId, isActive: true },
  });
  if (!active) throw new AppError('No active risk control for this user', 404);

  const risk = await prisma.accountRisk.update({
    where: { id: active.id },
    data: { isActive: false, releasedAt: new Date(), releasedBy: adminId },
  });
  emitAdminDataChanged('user_risk', { userId });
  return risk;
}

export async function getRiskStats() {
  const [total, critical, high, medium, low] = await Promise.all([
    prisma.accountRisk.count({ where: { isActive: true } }),
    prisma.accountRisk.count({ where: { isActive: true, severity: 'critical' } }),
    prisma.accountRisk.count({ where: { isActive: true, severity: 'high' } }),
    prisma.accountRisk.count({ where: { isActive: true, severity: 'medium' } }),
    prisma.accountRisk.count({ where: { isActive: true, severity: 'low' } }),
  ]);
  return { total, critical, high, medium, low };
}
