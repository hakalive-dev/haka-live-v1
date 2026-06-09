import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { creditBeans } from '../wallet/wallet.service';
import { getMicProgressForLevelTask } from './hosts.service';
import { enqueueLevelTaskClaim } from '../../queues/level-task-claim.queue';

const MS_DAY = 24 * 60 * 60 * 1000;

export type LevelTaskTrack = 'new_host' | 'ordinary' | 'level';

function utcTodayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcDayStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function getSettings() {
  return prisma.hostLevelTaskSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
}

async function getTiersAsc() {
  return prisma.hostLevelTaskTier.findMany({ orderBy: { sortOrder: 'asc' } });
}

/** Host gift earnings (70% share), excluding platform mic pay and other credits. */
export async function sumHostGiftEarnings(
  userId: string,
  since: Date,
  until: Date = new Date(),
): Promise<bigint> {
  const rows = await prisma.$queryRaw<[{ sum: bigint | null }]>`
    SELECT COALESCE(SUM(FLOOR(gt."beanValue"::numeric * 0.70)), 0)::bigint AS sum
    FROM gift_transactions gt
    WHERE gt."recipientId" = ${userId}
      AND gt."createdAt" >= ${since}
      AND gt."createdAt" <= ${until}
  `;
  return BigInt(rows[0]?.sum ?? 0);
}

export async function assertLevelTaskEligible(userId: string): Promise<{
  id: string;
  createdAt: Date;
  role: string;
  gender: string;
  isVerifiedHost: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      role: true,
      gender: true,
      isVerifiedHost: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.role !== 'host' && user.role !== 'agent') {
    throw new AppError('Only hosts and agents can access level tasks', 403);
  }
  if (user.gender !== 'female' || !user.isVerifiedHost) {
    throw new AppError(
      'Level tasks are only available for verified female hosts',
      403,
    );
  }
  return user;
}

async function getUserRegistration(userId: string) {
  return assertLevelTaskEligible(userId);
}

function incomeMaxClaimsPerDay(
  track: LevelTaskTrack,
  tier: Awaited<ReturnType<typeof getTiersAsc>>[number] | null,
  settings: Awaited<ReturnType<typeof getSettings>>,
): number {
  if (track === 'new_host') return 0;
  if (track === 'level' && tier) return tier.incomeTaskMaxHoursPerDay;
  return settings.ordinaryIncomeHoursPerDay;
}

export async function resolveTrack(
  userId: string,
  createdAt: Date,
  sevenDayEarnings: bigint,
  settings: Awaited<ReturnType<typeof getSettings>>,
  tiers: Awaited<ReturnType<typeof getTiersAsc>>,
): Promise<{ track: LevelTaskTrack; levelCode: string | null; tier: (typeof tiers)[number] | null }> {
  const daysSinceReg = Math.floor((Date.now() - createdAt.getTime()) / MS_DAY);
  if (daysSinceReg <= settings.newHostProtectionDays) {
    return { track: 'new_host', levelCode: null, tier: null };
  }

  if (sevenDayEarnings < settings.ordinaryMaxSevenDayEarnings) {
    return { track: 'ordinary', levelCode: null, tier: null };
  }

  let matched: (typeof tiers)[number] | null = null;
  for (const t of tiers) {
    if (sevenDayEarnings >= t.minSevenDayEarnings) matched = t;
  }
  if (!matched) {
    const lowest = [...tiers].sort((a, b) =>
      a.minSevenDayEarnings < b.minSevenDayEarnings ? -1 : 1,
    )[0];
    if (lowest && sevenDayEarnings >= settings.ordinaryMaxSevenDayEarnings) {
      return { track: 'level', levelCode: lowest.levelCode, tier: lowest };
    }
    return { track: 'ordinary', levelCode: null, tier: null };
  }
  return { track: 'level', levelCode: matched.levelCode, tier: matched };
}

async function getOrCreateDaily(
  userId: string,
  taskDate: Date,
  track: LevelTaskTrack,
  levelCode: string | null,
) {
  return prisma.hostLevelTaskDaily.upsert({
    where: { userId_taskDate: { userId, taskDate } },
    create: {
      userId,
      taskDate,
      track,
      levelCode: levelCode ?? '',
    },
    update: {},
  });
}

async function sumNewHostLifetimeClaimed(userId: string, registrationDate: Date): Promise<number> {
  const protectionEnd = new Date(registrationDate.getTime() + 7 * MS_DAY);
  const agg = await prisma.hostLevelTaskDaily.aggregate({
    where: {
      userId,
      track: 'new_host',
      taskDate: {
        gte: utcDayStart(registrationDate),
        lte: utcDayStart(protectionEnd),
      },
    },
    _sum: { totalBeansClaimed: true },
  });
  return agg._sum.totalBeansClaimed ?? 0;
}

function bigintToNumber(v: bigint, label: string): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(`${label} exceeds safe integer range`, 500);
  }
  return Number(v);
}

export async function getLevelTaskStatus(userId: string) {
  const [user, settings, tiers, mic] = await Promise.all([
    getUserRegistration(userId),
    getSettings(),
    getTiersAsc(),
    getMicProgressForLevelTask(userId),
  ]);

  const now = new Date();
  const sevenSince = new Date(now.getTime() - 7 * MS_DAY);
  const todayStart = utcDayStart(now);

  const [sevenDayEarnings, todayGiftEarnings] = await Promise.all([
    sumHostGiftEarnings(userId, sevenSince, now),
    sumHostGiftEarnings(userId, todayStart, now),
  ]);

  const { track, levelCode, tier } = await resolveTrack(
    userId,
    user.createdAt,
    sevenDayEarnings,
    settings,
    tiers,
  );

  const taskDate = utcTodayDate();
  const daily = await getOrCreateDaily(userId, taskDate, track, levelCode);

  const todayMicMinutes = mic.minutesOnMic;
  const unclaimedMinutes = Math.max(0, todayMicMinutes - daily.liveMinutesClaimed);
  const todayGiftNum = bigintToNumber(todayGiftEarnings, 'todayGiftEarnings');
  const sevenDayNum = bigintToNumber(sevenDayEarnings, 'sevenDayEarnings');

  const newHostLifetimeClaimed =
    track === 'new_host' ? await sumNewHostLifetimeClaimed(userId, user.createdAt) : 0;

  const liveHoursClaimedToday = Math.floor(daily.liveMinutesClaimed / 60);
  const maxIncomeClaims = incomeMaxClaimsPerDay(track, tier, settings);
  const incomeClaimsRemaining = Math.max(
    0,
    maxIncomeClaims - daily.incomeClaimsCount,
  );

  const { canClaimLive, canClaimIncome, claimLiveReason, claimIncomeReason } =
    evaluateClaimEligibility({
      track,
      tier,
      settings,
      daily,
      unclaimedMinutes,
      todayGiftNum,
      newHostLifetimeClaimed,
      liveHoursClaimedToday,
      chunkMinutes: settings.liveClaimChunkMinutes,
      maxIncomeClaims,
    });

  const daysSinceReg = Math.floor((Date.now() - user.createdAt.getTime()) / MS_DAY);

  return {
    eligible: true,
    taskDayTimezone: 'UTC',
    rules: buildRulesSnapshot(settings, tiers),
    track,
    levelCode,
    daysSinceRegistration: daysSinceReg,
    sevenDayEarnings: sevenDayNum,
    todayGiftEarnings: todayGiftNum,
    todayMicMinutes,
    todayMicSeconds: mic.secondsOnMic,
    micMinutesToday: mic.micMinutes,
    pkMinutesToday: mic.pkMinutes,
    onMicNow: mic.onMicNow,
    inPkNow: mic.inPkNow,
    countLiveMicTime: settings.countLiveMicTime,
    unclaimedMinutes,
    liveMinutesClaimed: daily.liveMinutesClaimed,
    liveBeansClaimedToday: daily.liveBeansClaimed,
    incomeClaimsCount: daily.incomeClaimsCount,
    incomeBeansClaimedToday: daily.incomeBeansClaimed,
    totalBeansClaimedToday: daily.totalBeansClaimed,
    newHostLifetimeClaimed,
    canClaimLive,
    canClaimIncome,
    claimLiveReason,
    claimIncomeReason,
    incomeClaimsRemaining,
  };
}

function buildRulesSnapshot(
  settings: Awaited<ReturnType<typeof getSettings>>,
  tiers: Awaited<ReturnType<typeof getTiersAsc>>,
) {
  return {
    newHosts: {
      hourlyBeans: settings.newHostHourlyBeans,
      hoursPerDay: settings.newHostHoursPerDay,
      protectionDays: settings.newHostProtectionDays,
      totalCapBeans: settings.newHostTotalCapBeans,
    },
    ordinary: {
      maxSevenDayEarnings: bigintToNumber(settings.ordinaryMaxSevenDayEarnings, 'ordinaryMax'),
      liveHourlyBeans: settings.ordinaryLiveHourlyBeans,
      liveHoursPerDay: settings.ordinaryLiveHoursPerDay,
      incomeHourlyBeans: settings.ordinaryIncomeHourlyBeans,
      incomeHoursPerDay: settings.ordinaryIncomeHoursPerDay,
      hourlyMaxBeans: settings.ordinaryHourlyMaxBeans,
      dailyMaxBeans: settings.ordinaryDailyMaxBeans,
    },
    incomeThresholdBeans: settings.incomeTaskThresholdBeans,
    tiers: tiers.map((t) => ({
      levelCode: t.levelCode,
      minSevenDayEarnings: bigintToNumber(t.minSevenDayEarnings, 'minSevenDay'),
      dailyTaskRewardBeans: t.dailyTaskRewardBeans,
      incomeTaskHourlyBeans: t.incomeTaskHourlyBeans,
      incomeTaskMaxHoursPerDay: t.incomeTaskMaxHoursPerDay,
      hourlyMaxBeans: t.hourlyMaxBeans,
    })),
  };
}

/** Public rules snapshot for view-only clients (any authenticated user). */
export async function getLevelTaskRules() {
  const [settings, tiers] = await Promise.all([getSettings(), getTiersAsc()]);
  return buildRulesSnapshot(settings, tiers);
}

function evaluateClaimEligibility(input: {
  track: LevelTaskTrack;
  tier: Awaited<ReturnType<typeof getTiersAsc>>[number] | null;
  settings: Awaited<ReturnType<typeof getSettings>>;
  daily: { liveMinutesClaimed: number; liveBeansClaimed: number; incomeClaimsCount: number; totalBeansClaimed: number };
  unclaimedMinutes: number;
  todayGiftNum: number;
  newHostLifetimeClaimed: number;
  liveHoursClaimedToday: number;
  chunkMinutes: number;
  maxIncomeClaims: number;
}) {
  let canClaimLive = false;
  let canClaimIncome = false;
  let claimLiveReason = '';
  let claimIncomeReason = '';

  const {
    track,
    tier,
    settings,
    daily,
    unclaimedMinutes,
    todayGiftNum,
    newHostLifetimeClaimed,
    liveHoursClaimedToday,
    chunkMinutes,
    maxIncomeClaims,
  } = input;

  if (unclaimedMinutes < chunkMinutes) {
    claimLiveReason = `Need at least ${chunkMinutes} unclaimed live minutes (have ${unclaimedMinutes})`;
  } else if (track === 'new_host') {
    if (liveHoursClaimedToday >= settings.newHostHoursPerDay) {
      claimLiveReason = 'Daily live claim limit reached';
    } else if (newHostLifetimeClaimed >= settings.newHostTotalCapBeans) {
      claimLiveReason = 'New host protection cap reached';
    } else {
      canClaimLive = true;
    }
  } else if (track === 'ordinary') {
    if (liveHoursClaimedToday >= settings.ordinaryLiveHoursPerDay) {
      claimLiveReason = 'Daily live claim limit reached (1 hour)';
    } else if (daily.totalBeansClaimed >= settings.ordinaryDailyMaxBeans) {
      claimLiveReason = 'Daily max reward reached';
    } else {
      canClaimLive = true;
    }
  } else if (track === 'level' && tier) {
    if (daily.liveBeansClaimed >= tier.dailyTaskRewardBeans) {
      claimLiveReason = 'Daily live reward budget reached';
    } else {
      canClaimLive = true;
    }
  }

  if (track === 'new_host') {
    claimIncomeReason = 'Income task not available during new host protection';
  } else if (todayGiftNum < settings.incomeTaskThresholdBeans) {
    claimIncomeReason = `Need ${settings.incomeTaskThresholdBeans.toLocaleString()} gift earnings today`;
  } else if (daily.incomeClaimsCount >= maxIncomeClaims) {
    claimIncomeReason = `Income task daily limit reached (${maxIncomeClaims})`;
  } else if (track === 'ordinary' && daily.totalBeansClaimed >= settings.ordinaryDailyMaxBeans) {
    claimIncomeReason = 'Daily max reward reached';
  } else {
    canClaimIncome = true;
  }

  return { canClaimLive, canClaimIncome, claimLiveReason, claimIncomeReason };
}

function computeLiveClaimBeans(input: {
  track: LevelTaskTrack;
  tier: Awaited<ReturnType<typeof getTiersAsc>>[number] | null;
  settings: Awaited<ReturnType<typeof getSettings>>;
  daily: { liveBeansClaimed: number; totalBeansClaimed: number };
  chunkMinutes: number;
  newHostLifetimeClaimed: number;
}): number {
  const { track, tier, settings, daily, chunkMinutes, newHostLifetimeClaimed } = input;
  const hours = chunkMinutes / 60;

  if (track === 'new_host') {
    const raw = Math.floor(settings.newHostHourlyBeans * hours);
    const remainingLifetime = settings.newHostTotalCapBeans - newHostLifetimeClaimed;
    const remainingDaily = settings.newHostHourlyBeans * settings.newHostHoursPerDay - daily.liveBeansClaimed;
    return Math.max(0, Math.min(raw, remainingLifetime, remainingDaily));
  }

  if (track === 'ordinary') {
    const raw = Math.floor(settings.ordinaryLiveHourlyBeans * hours);
    const remainingDaily = settings.ordinaryDailyMaxBeans - daily.totalBeansClaimed;
    return Math.max(0, Math.min(raw, settings.ordinaryHourlyMaxBeans, remainingDaily));
  }

  if (track === 'level' && tier) {
    const raw = Math.floor(tier.hourlyMaxBeans * hours);
    const remainingLiveBudget = tier.dailyTaskRewardBeans - daily.liveBeansClaimed;
    return Math.max(0, Math.min(raw, tier.hourlyMaxBeans, remainingLiveBudget));
  }

  return 0;
}

function computeIncomeClaimBeans(input: {
  track: LevelTaskTrack;
  tier: Awaited<ReturnType<typeof getTiersAsc>>[number] | null;
  settings: Awaited<ReturnType<typeof getSettings>>;
  daily: { totalBeansClaimed: number };
}): number {
  const { track, tier, settings, daily } = input;
  const perClaim =
    track === 'level' && tier
      ? tier.incomeTaskHourlyBeans
      : settings.ordinaryIncomeHourlyBeans;

  if (track === 'ordinary') {
    const remainingDaily = settings.ordinaryDailyMaxBeans - daily.totalBeansClaimed;
    return Math.max(0, Math.min(perClaim, settings.ordinaryHourlyMaxBeans, remainingDaily));
  }

  return perClaim;
}

async function runClaimWithQueue(
  userId: string,
  claimType: 'live' | 'income',
  jobId: string,
  taskDate: Date,
  sequence: number,
): Promise<{ beansAwarded: number; jobId: string }> {
  await prisma.hostLevelTaskClaim.upsert({
    where: { jobId },
    create: {
      userId,
      taskDate,
      claimType,
      sequence,
      jobId,
      status: 'pending',
    },
    update: {},
  });

  try {
    return await enqueueLevelTaskClaim(userId, claimType, jobId);
  } catch {
    const existing = await prisma.hostLevelTaskClaim.findUnique({
      where: { jobId },
    });
    if (existing?.status === 'completed') {
      return { jobId, beansAwarded: existing.beansAwarded };
    }
    const result =
      claimType === 'live'
        ? await executeClaimLevelTaskLive(userId)
        : await executeClaimLevelTaskIncome(userId);
    await prisma.hostLevelTaskClaim.update({
      where: { jobId },
      data: {
        status: 'completed',
        beansAwarded: result.beansAwarded,
      },
    });
    return { jobId, beansAwarded: result.beansAwarded };
  }
}

export async function claimLevelTaskLive(userId: string) {
  const status = await getLevelTaskStatus(userId);
  if (!status.canClaimLive) {
    throw new AppError(status.claimLiveReason || 'Cannot claim live reward', 400);
  }

  const settings = await getSettings();
  const taskDate = utcTodayDate();
  const daily = await prisma.hostLevelTaskDaily.findUnique({
    where: { userId_taskDate: { userId, taskDate } },
  });
  const sequence = Math.floor(
    (daily?.liveMinutesClaimed ?? 0) / settings.liveClaimChunkMinutes,
  );
  const jobId = `${userId}:live:${taskDate.toISOString().slice(0, 10)}:${sequence}`;
  return runClaimWithQueue(userId, 'live', jobId, taskDate, sequence);
}

export async function executeClaimLevelTaskLive(userId: string) {
  const status = await getLevelTaskStatus(userId);
  if (!status.canClaimLive) {
    throw new AppError(status.claimLiveReason || 'Cannot claim live reward', 400);
  }

  const [user, settings, tiers] = await Promise.all([
    getUserRegistration(userId),
    getSettings(),
    getTiersAsc(),
  ]);

  const now = new Date();
  const sevenSince = new Date(now.getTime() - 7 * MS_DAY);
  const sevenDayEarnings = await sumHostGiftEarnings(userId, sevenSince, now);
  const { track, levelCode, tier } = await resolveTrack(
    userId,
    user.createdAt,
    sevenDayEarnings,
    settings,
    tiers,
  );

  const taskDate = utcTodayDate();
  const chunkMinutes = settings.liveClaimChunkMinutes;

  const daily = await prisma.hostLevelTaskDaily.upsert({
    where: { userId_taskDate: { userId, taskDate } },
    create: { userId, taskDate, track, levelCode: levelCode ?? '' },
    update: {},
  });

  const mic = await getMicProgressForLevelTask(userId);
  const unclaimedMinutes = Math.max(0, mic.minutesOnMic - daily.liveMinutesClaimed);
  if (unclaimedMinutes < chunkMinutes) {
    throw new AppError(`Need at least ${chunkMinutes} unclaimed live minutes`, 400);
  }

  const newHostLifetime =
    track === 'new_host' ? await sumNewHostLifetimeClaimed(userId, user.createdAt) : 0;

  const beans = computeLiveClaimBeans({
    track,
    tier,
    settings,
    daily,
    chunkMinutes,
    newHostLifetimeClaimed: newHostLifetime,
  });

  if (beans <= 0) throw new AppError('No live reward available to claim', 400);

  const updated = await prisma.hostLevelTaskDaily.update({
    where: { id: daily.id },
    data: {
      track,
      levelCode: levelCode ?? '',
      liveMinutesClaimed: { increment: chunkMinutes },
      liveBeansClaimed: { increment: beans },
      totalBeansClaimed: { increment: beans },
    },
  });

  await creditBeans(userId, beans, 'level_task_live', `Level task live reward (${track})`);

  return { beansAwarded: beans, daily: updated };
}

export async function claimLevelTaskIncome(userId: string) {
  const status = await getLevelTaskStatus(userId);
  if (!status.canClaimIncome) {
    throw new AppError(status.claimIncomeReason || 'Cannot claim income reward', 400);
  }

  const taskDate = utcTodayDate();
  const daily = await prisma.hostLevelTaskDaily.findUnique({
    where: { userId_taskDate: { userId, taskDate } },
  });
  const sequence = daily?.incomeClaimsCount ?? 0;
  const jobId = `${userId}:income:${taskDate.toISOString().slice(0, 10)}:${sequence}`;
  return runClaimWithQueue(userId, 'income', jobId, taskDate, sequence);
}

export async function executeClaimLevelTaskIncome(userId: string) {
  const status = await getLevelTaskStatus(userId);
  if (!status.canClaimIncome) {
    throw new AppError(status.claimIncomeReason || 'Cannot claim income reward', 400);
  }

  const [user, settings, tiers] = await Promise.all([
    getUserRegistration(userId),
    getSettings(),
    getTiersAsc(),
  ]);

  const now = new Date();
  const sevenSince = new Date(now.getTime() - 7 * MS_DAY);
  const sevenDayEarnings = await sumHostGiftEarnings(userId, sevenSince, now);
  const { track, levelCode, tier } = await resolveTrack(
    userId,
    user.createdAt,
    sevenDayEarnings,
    settings,
    tiers,
  );

  if (track === 'new_host') {
    throw new AppError('Income task not available during new host protection', 400);
  }

  const taskDate = utcTodayDate();

  const daily = await prisma.hostLevelTaskDaily.upsert({
    where: { userId_taskDate: { userId, taskDate } },
    create: { userId, taskDate, track, levelCode: levelCode ?? '' },
    update: {},
  });

  const beans = computeIncomeClaimBeans({ track, tier, settings, daily });
  if (beans <= 0) throw new AppError('No income reward available to claim', 400);

  const updated = await prisma.hostLevelTaskDaily.update({
    where: { id: daily.id },
    data: {
      track,
      levelCode: levelCode ?? '',
      incomeClaimsCount: { increment: 1 },
      incomeBeansClaimed: { increment: beans },
      totalBeansClaimed: { increment: beans },
    },
  });

  await creditBeans(userId, beans, 'level_task_income', `Level task income reward (${track})`);

  return { beansAwarded: beans, daily: updated };
}

/** Admin: list daily claim rows */
export async function listDailyClaims(params: {
  page?: number;
  limit?: number;
  userId?: string;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;
  const where: Prisma.HostLevelTaskDailyWhereInput = {};
  if (params.userId) where.userId = params.userId;

  const [items, total] = await Promise.all([
    prisma.hostLevelTaskDaily.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ taskDate: 'desc' }, { updatedAt: 'desc' }],
      include: {
        user: { select: { id: true, username: true, hakaId: true, displayName: true } },
      },
    }),
    prisma.hostLevelTaskDaily.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
}
