import { prisma } from '../../config/prisma';
import * as changeRequests from '../agency/change-request.service';

const MS_DAY = 24 * 60 * 60 * 1000;

function parseSettingInt(v: unknown, fallback: number, max?: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    return max ? Math.min(Math.max(1, n), max) : Math.max(1, n);
  }
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return max ? Math.min(n, max) : n;
  }
  return fallback;
}

async function getHostMicDailyTargetMinutes(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'host_mic_daily_target_minutes' } });
  return parseSettingInt(row?.value, 120, 24 * 60);
}

async function getHostDailyPointsTargetBeans(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'host_daily_points_target' } });
  return parseSettingInt(row?.value, 5000, 1_000_000_000);
}

/** GET /hosts/me/agency */
export async function getMyAgency(userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { agentId: true },
  });
  if (!me?.agentId) return { agent: null };
  const agent = await prisma.user.findUnique({
    where: { id: me.agentId },
    select: { id: true, displayName: true, avatar: true, hakaId: true, username: true },
  });
  return { agent };
}

/** GET /hosts/me/income?window=today|7d|weekly */
export async function getIncome(userId: string, window: 'today' | '7d' | 'weekly') {
  const now = new Date();
  let since: Date;
  if (window === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (window === '7d') {
    since = new Date(now.getTime() - 7 * MS_DAY);
  } else {
    const day = now.getDay();
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  }

  const [giftAgg, micAgg] = await Promise.all([
    prisma.giftTransaction.aggregate({
      where: { recipientId: userId, createdAt: { gte: since } },
      _sum: { beanValue: true },
    }),
    prisma.hostMicSession.aggregate({
      where: { userId, endedAt: { not: null, gte: since } },
      _sum: { minutes: true, beansAwarded: true },
    }),
  ]);

  const giftBeans    = giftAgg._sum.beanValue ?? 0;
  const micBeans     = micAgg._sum.beansAwarded ?? 0;
  const minutesOnMic = micAgg._sum.minutes ?? 0;
  const hours        = Math.max(1, minutesOnMic / 60);
  const hourlyBeans  = Math.round((giftBeans + micBeans) / hours);

  return {
    window,
    giftBeans,
    micBeans,
    hourlyBeans,
    totalBeans: giftBeans + micBeans,
    minutesOnMic,
    since: since.toISOString(),
  };
}

/** GET /hosts/me/tier */
export async function getMyTier(userId: string) {
  const [tiers, weekly] = await Promise.all([
    prisma.hostTier.findMany({ orderBy: { sortOrder: 'asc' } }),
    getIncome(userId, 'weekly'),
  ]);
  if (tiers.length === 0) return { tiers: [], currentTier: null, nextTier: null, progress: 0, neededBeans: 0, weeklyBeans: 0 };

  const weeklyBeans = weekly.totalBeans;
  let currentIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (weeklyBeans >= tiers[i].minWeeklyBeans) currentIdx = i;
  }
  const currentTier = tiers[currentIdx];
  const nextTier    = tiers[currentIdx + 1] ?? null;
  const progress = nextTier
    ? Math.min(1, (weeklyBeans - currentTier.minWeeklyBeans) /
        Math.max(1, nextTier.minWeeklyBeans - currentTier.minWeeklyBeans))
    : 1;
  const neededBeans = nextTier ? Math.max(0, nextTier.minWeeklyBeans - weeklyBeans) : 0;

  return { tiers, currentTier, nextTier, progress, neededBeans, weeklyBeans };
}

/** UTC midnight for level-task daily boundaries (matches host_level_task_daily.taskDate). */
export function utcDayStartForLevelTask(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Qualifying room modes for level-task live duration (voice/audio party = chat, video live = live). */
export const LEVEL_TASK_QUALIFYING_ROOM_MODES = ['chat', 'live'] as const;

/** GET /hosts/me/mic-progress — legacy host centre UI uses server-local calendar day. */
export async function getMicProgress(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [closedAgg, open, minutesTarget, pointsTargetBeans] = await Promise.all([
    prisma.hostMicSession.aggregate({
      where: { userId, endedAt: { not: null, gte: start } },
      _sum: { minutes: true, beansAwarded: true },
    }),
    prisma.hostMicSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
    getHostMicDailyTargetMinutes(),
    getHostDailyPointsTargetBeans(),
  ]);

  const closedMinutes = closedAgg._sum.minutes ?? 0;
  const liveMinutes   = open ? Math.floor((Date.now() - open.startedAt.getTime()) / 60000) : 0;
  const minutesOnMic  = closedMinutes + liveMinutes;
  const unlocked      = minutesOnMic >= minutesTarget;

  return {
    minutesOnMic,
    minutesTarget,
    pointsTargetBeans,
    hoursOnMicToday:   Math.floor(minutesOnMic / 60),
    minutesOnMicToday: minutesOnMic % 60,
    beansEarnedToday:  closedAgg._sum.beansAwarded ?? 0,
    unlocked,
    onMicNow: !!open,
  };
}

/**
 * Mic + PK minutes for level tasks — UTC day, qualifying room modes only.
 * Audio party rooms use roomMode=chat; PK host presence tracked separately.
 */
export async function getMicProgressForLevelTask(userId: string) {
  const dayStart = utcDayStartForLevelTask();

  // Live-room mic time is gated behind an admin switch; chat-room mic time
  // always counts. Until live sessions launch (toggle off), only chat counts,
  // and PK presence (a live-competition signal) is excluded.
  const settings = await prisma.hostLevelTaskSettings.findUnique({
    where: { id: 'singleton' },
    select: { countLiveMicTime: true },
  });
  const countLive = settings?.countLiveMicTime ?? false;
  const qualifyingModes = countLive ? ['chat', 'live'] : ['chat'];

  // Only the host's OWN rooms count toward her task (not time spent on a mic
  // seat as a guest in someone else's room). A host reuses one room over time.
  const ownRooms = await prisma.room.findMany({
    where: { hostId: userId },
    select: { id: true },
  });
  const ownRoomIds = ownRooms.map((r) => r.id);

  const [closedMicAgg, openMic] = await Promise.all([
    prisma.hostMicSession.aggregate({
      where: {
        userId,
        roomId: { in: ownRoomIds },
        roomMode: { in: qualifyingModes },
        endedAt: { not: null, gte: dayStart },
      },
      _sum: { minutes: true },
    }),
    prisma.hostMicSession.findFirst({
      where: {
        userId,
        roomId: { in: ownRoomIds },
        roomMode: { in: qualifyingModes },
        endedAt: null,
        startedAt: { gte: dayStart },
      },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  const closedMic = closedMicAgg._sum.minutes ?? 0;
  const liveMicSeconds = openMic
    ? Math.max(0, Math.floor((Date.now() - openMic.startedAt.getTime()) / 1000))
    : 0;
  const liveMic = Math.floor(liveMicSeconds / 60);

  // PK presence only contributes once live counting is enabled.
  let closedPk = 0;
  let livePk = 0;
  let livePkSeconds = 0;
  let openPk: { startedAt: Date } | null = null;
  if (countLive) {
    const [closedPkAgg, openPkRow] = await Promise.all([
      prisma.hostPkPresenceSession.aggregate({
        where: { userId, endedAt: { not: null, gte: dayStart } },
        _sum: { minutes: true },
      }),
      prisma.hostPkPresenceSession.findFirst({
        where: { userId, endedAt: null, startedAt: { gte: dayStart } },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    closedPk = closedPkAgg._sum.minutes ?? 0;
    openPk = openPkRow;
    livePkSeconds = openPk
      ? Math.max(0, Math.floor((Date.now() - openPk.startedAt.getTime()) / 1000))
      : 0;
    livePk = Math.floor(livePkSeconds / 60);
  }

  const minutesOnMic = closedMic + liveMic + closedPk + livePk;
  // Second-precision total. Closed sessions are only minute-precise (stored as
  // whole minutes), but the live/open portion is exact — so a timer anchored to
  // this value survives unmount/remount (e.g. minimizing the room) without
  // snapping back to the minute boundary.
  const secondsOnMic = closedMic * 60 + liveMicSeconds + closedPk * 60 + livePkSeconds;

  return {
    minutesOnMic,
    secondsOnMic,
    micMinutes: closedMic + liveMic,
    pkMinutes: closedPk + livePk,
    onMicNow: !!openMic,
    inPkNow: !!openPk,
  };
}

/** GET /hosts/official-contact */
export async function getOfficialContact() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'official_host_contact_user_id' },
  });
  const userId = typeof setting?.value === 'string' ? setting.value : null;
  if (!userId) return { user: null };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, avatar: true, hakaId: true, username: true },
  });
  return { user };
}

/** POST /hosts/me/agency/leave */
export async function requestLeaveAgency(userId: string, reason: string) {
  return changeRequests.createPendingAgencyChangeRequest(userId, 'leave', null, reason ?? '');
}

/** POST /hosts/me/agency/change — newAgentId may be UUID, hakaId, or username */
export async function requestChangeAgency(userId: string, newAgentId: string, reason: string) {
  return changeRequests.createPendingAgencyChangeRequest(userId, 'change', newAgentId, reason ?? '');
}

// ── Mic session tracking (called by room seat handlers) ──────────────────────

export async function startMicSession(userId: string, roomId: string, seatIndex: number) {
  // Close any dangling session first (defensive)
  await closeOpenMicSessions(userId);
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { roomMode: true },
  });
  const roomMode =
    room?.roomMode === 'live' ? 'live' : 'chat';
  return prisma.hostMicSession.create({
    data: { userId, roomId, seatIndex, roomMode },
  });
}

/**
 * Ensure an open mic session exists for a user currently seated in a room.
 *
 * Unlike {@link startMicSession}, this is idempotent: if the user already has an
 * open session for this room it is returned untouched (preserving its
 * `startedAt`), so reconnecting / reopening a minimised room does not reset the
 * accrued time. Only when there is no open session — e.g. the host was seated by
 * a seed or the previous session was dropped — is a fresh one created.
 */
export async function ensureMicSession(userId: string, roomId: string, seatIndex: number) {
  const existing = await prisma.hostMicSession.findFirst({
    where: { userId, roomId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return existing;
  return startMicSession(userId, roomId, seatIndex);
}

export async function endMicSession(userId: string, roomId: string) {
  const open = await prisma.hostMicSession.findFirst({
    where: { userId, roomId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) return null;
  return finalizeSession(open.id);
}

async function closeOpenMicSessions(userId: string) {
  const sessions = await prisma.hostMicSession.findMany({
    where: { userId, endedAt: null },
  });
  for (const s of sessions) await finalizeSession(s.id);
}

async function finalizeSession(sessionId: string) {
  const session = await prisma.hostMicSession.findUnique({ where: { id: sessionId } });
  if (!session || session.endedAt) return session;

  const endedAt = new Date();
  const minutes = Math.max(0, Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 60000));

  const tier = await resolveCurrentTier(session.userId);
  const rate = tier?.hourlyRateBeans ?? 0;
  const beans = Math.floor((minutes / 60) * rate);

  return prisma.hostMicSession.update({
    where: { id: sessionId },
    data: { endedAt, minutes, beansAwarded: beans },
  });
}

async function resolveCurrentTier(userId: string) {
  const info = await getMyTier(userId);
  return info.currentTier;
}
