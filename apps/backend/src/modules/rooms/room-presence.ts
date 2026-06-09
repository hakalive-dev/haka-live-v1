import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';

export function roomViewersRedisKey(roomId: string): string {
  return `room:${roomId}:viewers`;
}

/** Unique authenticated user IDs with a socket in the room channel. */
export function getConnectedUserIdsInRoom(io: Server, roomId: string): string[] {
  const socketIds = [...(io.sockets.adapter.rooms.get(roomId) ?? [])];
  return Array.from(
    new Set(
      socketIds
        .map((sid) => io.sockets.sockets.get(sid)?.data?.userId as string | undefined)
        .filter((v): v is string => Boolean(v)),
    ),
  );
}

/** Users currently assigned to a mic seat (DB), including host on "Keep" after disconnect. */
export async function getSeatedUserIdsInRoom(roomId: string): Promise<string[]> {
  const seats = await prisma.roomSeat.findMany({
    where: { roomId, userId: { not: null } },
    select: { userId: true },
  });
  return Array.from(
    new Set(seats.map((s) => s.userId).filter((id): id is string => Boolean(id))),
  );
}

/**
 * Full seat occupancy for a room (every position, occupied or empty), in the same
 * `seat.updated` payload shape the client already merges. Sent in the `room:join`
 * ack so a joining user reconciles existing mic occupants immediately, instead of
 * relying on a possibly-stale HTTP room snapshot (which misses anyone who sat down
 * shortly before they entered).
 */
export async function getRoomSeatsSnapshot(roomId: string) {
  const seats = await prisma.roomSeat.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    include: { user: { select: userSummarySelect() } },
  });
  return seats.map((s) => ({
    position: s.position,
    userId: s.userId,
    user: s.user ? serializeUserSummary(s.user) : null,
    isLocked: s.isLocked,
    isMuted: s.isMuted,
  }));
}

/**
 * Everyone who should appear in viewer count: connected listeners/speakers plus
 * anyone still on a mic seat (so Party list is not 0 when only seated users are present).
 */
export async function collectRoomParticipantUserIds(
  io: Server | null,
  roomId: string,
): Promise<string[]> {
  const ids = new Set<string>();
  if (io) {
    for (const id of getConnectedUserIdsInRoom(io, roomId)) ids.add(id);
  }
  for (const id of await getSeatedUserIdsInRoom(roomId)) ids.add(id);
  return [...ids];
}

export async function syncRedisViewerSet(roomId: string, userIds: string[]): Promise<void> {
  const key = roomViewersRedisKey(roomId);
  await redis.del(key);
  if (userIds.length > 0) {
    await redis.sadd(key, ...userIds);
    await redis.expire(key, 86400);
  }
}

export async function persistLiveViewerCount(roomId: string, count: number): Promise<void> {
  await prisma.room.updateMany({
    where: { id: roomId, status: 'live' },
    data: { viewerCount: count },
  });
}

/** Recompute count, sync Redis + Postgres; returns participants for roster/broadcasts. */
export async function applyRoomParticipantCount(
  io: Server | null,
  roomId: string,
): Promise<{ userIds: string[]; count: number }> {
  const userIds = await collectRoomParticipantUserIds(io, roomId);
  const count = userIds.length;
  await syncRedisViewerSet(roomId, userIds);
  await persistLiveViewerCount(roomId, count);
  return { userIds, count };
}

/** Live viewer counts from Redis (SET synced on socket room:join / leave). */
export async function hydrateViewerCountsFromRedis(
  roomIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (roomIds.length === 0) return map;

  const pipeline = redis.pipeline();
  for (const id of roomIds) {
    pipeline.scard(roomViewersRedisKey(id));
  }
  const results = await pipeline.exec();
  roomIds.forEach((id, i) => {
    const tuple = results?.[i];
    if (!tuple) return;
    const [err, val] = tuple;
    if (err) return;
    const n = Number(val);
    if (Number.isFinite(n)) map.set(id, Math.max(0, n));
  });
  return map;
}

/** Distinct users on occupied mic seats per room (for list API fallback). */
export async function hydrateOccupiedSeatCounts(
  roomIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (roomIds.length === 0) return map;

  const seats = await prisma.roomSeat.findMany({
    where: { roomId: { in: roomIds }, userId: { not: null } },
    select: { roomId: true, userId: true },
  });
  const byRoom = new Map<string, Set<string>>();
  for (const s of seats) {
    if (!s.userId) continue;
    let set = byRoom.get(s.roomId);
    if (!set) {
      set = new Set();
      byRoom.set(s.roomId, set);
    }
    set.add(s.userId);
  }
  for (const [roomId, set] of byRoom) {
    map.set(roomId, set.size);
  }
  return map;
}
