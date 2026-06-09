import { prisma } from '../../config/prisma';

type Period = 'daily' | 'weekly' | 'monthly';

function getDateRange(period: Period): Date {
  const now = new Date();
  switch (period) {
    case 'daily':
      now.setHours(0, 0, 0, 0);
      return now;
    case 'weekly': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'monthly': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    }
  }
}

/**
 * Get general activity stats for a user.
 */
export async function getMyActivity(userId: string, period: Period) {
  const startDate = getDateRange(period);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const walletId = wallet?.id;

  const [coinsSpentResult, beansEarnedResult, giftsSentCount, giftsReceivedCount, roomSessionsCount] =
    await Promise.all([
      walletId
        ? prisma.walletTransaction.aggregate({
            where: {
              walletId,
              transactionType: 'debit',
              currency: 'coins',
              reference: 'gift_sent',
              createdAt: { gte: startDate },
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: 0 } }),

      walletId
        ? prisma.walletTransaction.aggregate({
            where: {
              walletId,
              transactionType: 'credit',
              currency: 'beans',
              reference: 'gift_received',
              createdAt: { gte: startDate },
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: 0 } }),

      prisma.giftTransaction.count({
        where: { senderId: userId, createdAt: { gte: startDate } },
      }),

      prisma.giftTransaction.count({
        where: { recipientId: userId, createdAt: { gte: startDate } },
      }),

      prisma.roomSeat.count({
        where: { userId, createdAt: { gte: startDate } },
      }),
    ]);

  return {
    period,
    coinsSpent: coinsSpentResult._sum.amount ?? 0,
    beansEarned: beansEarnedResult._sum.amount ?? 0,
    giftsSentCount,
    giftsReceivedCount,
    roomSessionsCount,
  };
}

/**
 * Get income analytics for a host.
 */
export async function getMyIncome(userId: string, period: Period) {
  const startDate = getDateRange(period);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const walletId = wallet?.id;

  const [beansResult, giftsReceivedCount, rawTopGifters] = await Promise.all([
    walletId
      ? prisma.walletTransaction.aggregate({
          where: {
            walletId,
            transactionType: 'credit',
            currency: 'beans',
            reference: 'gift_received',
            createdAt: { gte: startDate },
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),

    prisma.giftTransaction.count({
      where: { recipientId: userId, createdAt: { gte: startDate } },
    }),

    prisma.giftTransaction.findMany({
      where: { recipientId: userId, createdAt: { gte: startDate } },
      select: {
        senderId: true,
        coinCost: true,
        sender: { select: { id: true, displayName: true, avatar: true } },
      },
    }),
  ]);

  // Group by senderId in JS
  const gifterMap = new Map<
    string,
    { user: { id: string; displayName: string; avatar: string }; totalCoins: number; count: number }
  >();

  for (const tx of rawTopGifters) {
    const existing = gifterMap.get(tx.senderId);
    if (existing) {
      existing.totalCoins += tx.coinCost;
      existing.count += 1;
    } else {
      gifterMap.set(tx.senderId, {
        user: tx.sender,
        totalCoins: tx.coinCost,
        count: 1,
      });
    }
  }

  const topGifters = Array.from(gifterMap.values())
    .sort((a, b) => b.totalCoins - a.totalCoins)
    .slice(0, 10);

  return {
    period,
    totalBeansEarned: beansResult._sum.amount ?? 0,
    giftsReceivedCount,
    topGifters,
  };
}

/**
 * Get daily chart data for a period.
 */
export async function getChartData(userId: string, period: Period) {
  const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const walletId = wallet?.id;

  const dataPoints: Array<{ date: string; coinsSpent: number; beansEarned: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dateStr = dayStart.toISOString().slice(0, 10);

    if (!walletId) {
      dataPoints.push({ date: dateStr, coinsSpent: 0, beansEarned: 0 });
      continue;
    }

    const [coinsResult, beansResult] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: {
          walletId,
          transactionType: 'debit',
          currency: 'coins',
          reference: 'gift_sent',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          walletId,
          transactionType: 'credit',
          currency: 'beans',
          reference: 'gift_received',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        _sum: { amount: true },
      }),
    ]);

    dataPoints.push({
      date: dateStr,
      coinsSpent: Number(coinsResult._sum.amount ?? 0),
      beansEarned: Number(beansResult._sum.amount ?? 0),
    });
  }

  return { period, days, data: dataPoints };
}
