import { Server, Socket } from 'socket.io';
import { redis } from '../config/redis';
import { coinSellerService } from '../modules/payments/coinSeller.service';
import { stateTotalsRedisKey, dailyDateKey } from '../modules/leaderboard/state-ranking-keys';

/**
 * Real-time leaderboard push (Option 1: throttled, subscriber-gated, change-detected).
 *
 * Clients on a ranking tab `leaderboard:subscribe` to a board room (`lb:<board>:<period>`).
 * A single interval recomputes a cheap top-N signature for each room that has subscribers
 * and emits `leaderboard:changed` ONLY when it actually changed. The signal is intentionally
 * tiny — the client refetches through the existing REST path (which already has the correct
 * transform + per-user logic), so we never duplicate payload serialization here.
 *
 * Cost is bounded: one signature read per ACTIVE board per tick, not per gift, not per user.
 */
export const LEADERBOARD_EVENTS = {
  SUBSCRIBE: 'leaderboard:subscribe',
  UNSUBSCRIBE: 'leaderboard:unsubscribe',
  CHANGED: 'leaderboard:changed',
} as const;

const BROADCAST_INTERVAL_MS = 4_000;
const TOP_N = 20;
const ROOM_PREFIX = 'lb:';

// Rooms are `lb:<board>:<seg>`. For agent/creator `seg` is the period; for state it is the
// 2-letter country code (state is always daily and keyed per country, since inspectors can
// view different countries). The pushed signal carries no data, so the face-gate is enforced
// by the client's REST refetch — subscribing to a state room leaks nothing.
const BOARDS = ['agent', 'creator', 'state'] as const;
const PERIODS = ['daily', 'weekly', 'monthly'] as const;
type Board = (typeof BOARDS)[number];
type Period = (typeof PERIODS)[number];

export function isValidBoard(board: string): board is Board {
  return (BOARDS as readonly string[]).includes(board);
}
export function isValidPeriod(period: string): period is Period {
  return (PERIODS as readonly string[]).includes(period);
}
function isCountryCode(seg: string): boolean {
  return /^[A-Z]{2}$/.test(seg);
}

/** The valid second segment for a board: period for agent/creator, country code for state. */
function isValidSeg(board: Board, seg: string): boolean {
  return board === 'state' ? isCountryCode(seg) : isValidPeriod(seg);
}

export function boardRoom(board: string, seg: string): string {
  return `${ROOM_PREFIX}${board}:${seg}`;
}

/** Parse a room name back into board + second segment, or null if it isn't a leaderboard room. */
export function parseBoardRoom(room: string): { board: string; seg: string } | null {
  if (!room.startsWith(ROOM_PREFIX)) return null;
  const [board, seg] = room.slice(ROOM_PREFIX.length).split(':');
  if (!board || !seg) return null;
  return { board, seg };
}

/** A cheap, order-sensitive fingerprint of the board's top-N (ids + scores). */
async function boardSignature(board: Board, seg: string): Promise<string> {
  if (board === 'creator') {
    const raw = await redis.zrevrange(`leaderboard:creators:${seg}`, 0, TOP_N - 1, 'WITHSCORES');
    return raw.join('|');
  }
  if (board === 'state') {
    const raw = await redis.zrevrange(stateTotalsRedisKey(seg, dailyDateKey()), 0, TOP_N - 1, 'WITHSCORES');
    return raw.join('|');
  }
  // agent — coin sellers (period-agnostic: ranks by lifetime totalCoinsSold)
  const list = await coinSellerService.getLeaderboard();
  return list.slice(0, TOP_N).map((r) => `${r.id}:${r.score}`).join('|');
}

/** Read the subscribe/unsubscribe payload into a validated (board, seg) pair, or null. */
function readSub(payload: { board?: string; period?: string; countryCode?: string }):
  | { board: Board; seg: string }
  | null {
  const board = String(payload?.board ?? '');
  if (!isValidBoard(board)) return null;
  const seg =
    board === 'state'
      ? String(payload?.countryCode ?? '').toUpperCase()
      : String(payload?.period ?? 'daily');
  if (!isValidSeg(board, seg)) return null;
  return { board, seg };
}

export function registerLeaderboardHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    socket.on(LEADERBOARD_EVENTS.SUBSCRIBE, (payload) => {
      const sub = readSub(payload ?? {});
      if (sub) void socket.join(boardRoom(sub.board, sub.seg));
    });

    socket.on(LEADERBOARD_EVENTS.UNSUBSCRIBE, (payload) => {
      const sub = readSub(payload ?? {});
      if (sub) void socket.leave(boardRoom(sub.board, sub.seg));
    });
  });
}

/** Last broadcast signature per room — emit only when this changes. */
const lastSignature = new Map<string, string>();

async function broadcastTick(io: Server): Promise<void> {
  const rooms = io.of('/').adapter.rooms;
  const active = new Set<string>();
  for (const room of rooms.keys()) {
    const parsed = parseBoardRoom(room);
    if (parsed && isValidBoard(parsed.board) && isValidSeg(parsed.board, parsed.seg)) active.add(room);
  }

  // Drop cached signatures for rooms that no longer have subscribers.
  for (const room of lastSignature.keys()) {
    if (!active.has(room)) lastSignature.delete(room);
  }

  for (const room of active) {
    const parsed = parseBoardRoom(room)!;
    const board = parsed.board as Board;
    try {
      const sig = await boardSignature(board, parsed.seg);
      if (lastSignature.get(room) === sig) continue;
      lastSignature.set(room, sig);
      io.to(room).emit(
        LEADERBOARD_EVENTS.CHANGED,
        board === 'state'
          ? { board, period: 'daily', countryCode: parsed.seg }
          : { board, period: parsed.seg },
      );
    } catch {
      /* transient Redis/DB hiccup — skip this tick, retry next */
    }
  }
}

/** Start the periodic broadcaster. Caller should skip this in tests. */
export function startLeaderboardBroadcaster(io: Server): NodeJS.Timeout {
  const timer = setInterval(() => void broadcastTick(io), BROADCAST_INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive for this timer
  return timer;
}
