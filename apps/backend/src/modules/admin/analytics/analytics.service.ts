import { prisma } from '../../../config/prisma';

export function periodStart(period: 'day' | 'week' | 'month' | 'all'): Date | undefined {
  const now = new Date();
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d;
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return undefined;
}

export async function getOverview(period: 'day' | 'week' | 'month' | 'all') {
  const since = periodStart(period);
  const createdFilter = since ? { gte: since } : undefined;

  const [
    newUsers,
    activeUsers,
    newRooms,
    liveRooms,
    giftTxCount,
    totalCoinsSpent,
    totalBeansEarned,
    pendingWithdrawals,
    walletTxCount,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: createdFilter } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.room.count({ where: { createdAt: createdFilter } }),
    prisma.room.count({ where: { status: 'live' } }),
    prisma.giftTransaction.count({ where: { createdAt: createdFilter } }),
    prisma.giftTransaction.aggregate({ _sum: { coinCost: true }, where: { createdAt: createdFilter } }),
    prisma.giftTransaction.aggregate({ _sum: { beanValue: true }, where: { createdAt: createdFilter } }),
    prisma.withdrawalRequest.count({
      where: {
        status: { in: ['pending', 'pending_review', 'assigned', 'proof_submitted'] },
      },
    }),
    prisma.walletTransaction.count({ where: { createdAt: createdFilter } }),
  ]);

  return {
    newUsers,
    activeUsers,
    newRooms,
    liveRooms,
    giftTxCount,
    totalCoinsSpent: totalCoinsSpent._sum.coinCost ?? 0,
    totalBeansEarned: totalBeansEarned._sum.beanValue ?? 0,
    pendingWithdrawals,
    walletTxCount,
  };
}

export async function getTopHosts(limit = 10, period: 'day' | 'week' | 'month' | 'all' = 'all') {
  const since = periodStart(period);
  const createdFilter = since ? { gte: since } : undefined;

  const result = await prisma.giftTransaction.groupBy({
    by: ['recipientId'],
    _sum: { beanValue: true, coinCost: true },
    _count: { id: true },
    where: { createdAt: createdFilter },
    orderBy: { _sum: { beanValue: 'desc' } },
    take: limit,
  });

  const userIds = result.map(r => r.recipientId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, hakaId: true, role: true, hostType: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return result.map(r => ({
    user: userMap[r.recipientId] ?? null,
    totalBeans: r._sum.beanValue ?? 0,
    totalCoinsReceived: r._sum.coinCost ?? 0,
    giftCount: r._count.id,
  }));
}

export async function getTopSenders(limit = 10, period: 'day' | 'week' | 'month' | 'all' = 'all') {
  const since = periodStart(period);
  const createdFilter = since ? { gte: since } : undefined;

  const result = await prisma.giftTransaction.groupBy({
    by: ['senderId'],
    _sum: { coinCost: true },
    _count: { id: true },
    where: { createdAt: createdFilter },
    orderBy: { _sum: { coinCost: 'desc' } },
    take: limit,
  });

  const userIds = result.map(r => r.senderId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, hakaId: true, role: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return result.map(r => ({
    user: userMap[r.senderId] ?? null,
    totalCoinsSpent: r._sum.coinCost ?? 0,
    giftCount: r._count.id,
  }));
}

export async function getUserGrowth() {
  // Last 7 days daily counts
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const count = await prisma.user.count({ where: { createdAt: { gte: start, lt: end } } });
    days.push({ date: start.toISOString().slice(0, 10), count });
  }
  return days;
}
