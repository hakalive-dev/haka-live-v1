import { prisma } from '../../../config/prisma';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  totalRooms: number;
  liveRooms: number;
  totalGiftTransactions: number;
  totalWalletTransactions: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalBeansDistributed: number;
  pendingWithdrawals: number;
  pendingReports: number;
  totalAgencies: number;
  activeHosts: number;
}

export async function getStats(): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    activeUsers,
    verifiedUsers,
    totalRooms,
    liveRooms,
    totalGiftTransactions,
    totalWalletTransactions,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    beansAgg,
    pendingWithdrawals,
    pendingReports,
    totalAgencies,
    activeHosts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isVerified: true } }),
    prisma.room.count(),
    prisma.room.count({ where: { status: 'live' } }),
    prisma.giftTransaction.count(),
    prisma.walletTransaction.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.walletTransaction.aggregate({ _sum: { amount: true }, where: { currency: 'beans', transactionType: 'credit' } }),
    prisma.withdrawalRequest.count({
      where: {
        status: { in: ['pending', 'pending_review', 'assigned', 'proof_submitted'] },
      },
    }),
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.agency.count(),
    prisma.user.count({ where: { role: 'host', isActive: true } }),
  ]);

  return {
    totalUsers,
    activeUsers,
    verifiedUsers,
    totalRooms,
    liveRooms,
    totalGiftTransactions,
    totalWalletTransactions,
    newUsersToday,
    newUsersThisWeek,
    newUsersThisMonth,
    totalBeansDistributed: beansAgg._sum.amount ? Number(beansAgg._sum.amount) : 0,
    pendingWithdrawals,
    pendingReports,
    totalAgencies,
    activeHosts,
  };
}

export async function getTopHosts(limit = 10) {
  const hosts = await prisma.user.findMany({
    where: { role: 'host' },
    take: limit * 5, // fetch extra to sort by gifts received
    select: {
      id: true, displayName: true, hakaId: true, avatar: true, hostType: true,
      _count: { select: { giftsReceived: true, hostedRooms: true } },
    },
  });

  return hosts
    .sort((a, b) => b._count.giftsReceived - a._count.giftsReceived)
    .slice(0, limit)
    .map((h, i) => ({
      rank: i + 1,
      id: h.id,
      displayName: h.displayName,
      hakaId: h.hakaId,
      avatar: h.avatar,
      hostType: h.hostType,
      giftsReceived: h._count.giftsReceived,
      roomsHosted: h._count.hostedRooms,
    }));
}

export async function getTopAgents(limit = 10) {
  const agents = await prisma.user.findMany({
    where: { role: 'agent' },
    take: limit * 5,
    select: {
      id: true, displayName: true, hakaId: true, avatar: true,
      _count: { select: { hosts: true } },
    },
  });

  return agents
    .sort((a, b) => b._count.hosts - a._count.hosts)
    .slice(0, limit)
    .map((a, i) => ({
      rank: i + 1,
      id: a.id,
      displayName: a.displayName,
      hakaId: a.hakaId,
      avatar: a.avatar,
      hostsCount: a._count.hosts,
    }));
}

export async function getRecentUsers(limit = 10) {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, displayName: true, username: true, hakaId: true,
      avatar: true, role: true, isActive: true, createdAt: true,
    },
  });
}

export async function getRecentRooms(limit = 10) {
  return prisma.room.findMany({
    where: { status: 'live' },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { host: { select: { id: true, displayName: true, avatar: true } } },
  });
}
