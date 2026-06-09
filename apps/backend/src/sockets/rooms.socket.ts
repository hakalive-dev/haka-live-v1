import bcrypt from 'bcryptjs';
import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { assertNoRiskBlock } from '../utils/risk-control';
import * as roomsService from '../modules/rooms/rooms.service';
import { ensureMicSession } from '../modules/hosts/hosts.service';
import * as chatService from '../modules/chat/chat.service';
import { clearUserRoomChatSession } from '../modules/chat/room-chat-session';
import {
  clearUserActiveRoom,
  setUserActiveRoom,
} from '../modules/rooms/user-active-room';
import { computeAge } from '../modules/accounts/accounts.service';
import { userSummarySelect, serializeUserSummary, emptyEquippedCosmetics } from '../modules/users/user-summary';
import { getActiveRoomBanDetails } from '../modules/moderation/moderation.service';
import { mapSortedUserTags } from '../modules/moderation/tags.service';
import * as pkService from '../modules/pk/pk.service';
import * as calcService from '../modules/rooms/calculator.service';
import { PK_EVENTS } from '../shared-types';
import { redis } from '../config/redis';
import * as normalBattleService from '../modules/normal-battle/normal-battle.service';
import { BATTLE_EVENTS } from '../shared-types';
import {
  applyRoomParticipantCount,
  getConnectedUserIdsInRoom,
  getRoomSeatsSnapshot,
  roomViewersRedisKey,
} from '../modules/rooms/room-presence';
import { getRtcUidMap } from '../modules/rooms/agora.service';

export { getConnectedUserIdsInRoom, roomViewersRedisKey } from '../modules/rooms/room-presence';

async function getRtcUidsForRoom(roomId: string): Promise<Record<string, number>> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      agoraChannel: true,
      hostId: true,
      seats: { where: { userId: { not: null } }, select: { userId: true } },
    },
  });
  if (!room) return {};
  const userIds = [
    room.hostId,
    ...room.seats.map((s) => s.userId!).filter(Boolean),
  ];
  return getRtcUidMap(room.agoraChannel, userIds);
}

/**
 * Voice Room WebSocket — Feature 5
 *
 * Socket.io events for real-time room interactions.
 *
 * Client → Server:
 *   room:join        { roomId }
 *   room:leave       { roomId }
 *   seat:take        { roomId, position }
 *   seat:leave       { roomId, position }
 *   seat:lock        { roomId, position, lock }
 *   seat:kick        { roomId, position }
 *   room:kick        { roomId, userId }
 *   chat:message     { roomId, content }
 *   room:emoji       { roomId, seatPosition, emojiKey }
 *
 * Server → Client (broadcast to room):
 *   user.joined      { userId, displayName, avatar, viewerCount }
 *   user.left        { userId, viewerCount }
 *   seat.updated     { position, userId, user, isLocked, isMuted }
 *   message.sent     { id, sender, content, createdAt }
 *   room.ended       {}
 *   listener.count   { count }
 *   emoji.received   { seatPosition, emojiKey, senderId }
 */

// Allowed SVGA emoji keys — kept in sync with
// apps/mobile/src/screens/room/svgaEmojis.ts
const ALLOWED_EMOJI_KEYS = new Set<string>([
  // Normal tier — numeric SVGA
  '1611577881374', '1611577859965', '1611561898139', '1611577805375',
  '1611577416731', '1611561970084', '1611577176442', '1601185839692',
  '1611577771602', '1611577960187', '1611577905602', '1601186116079',
  '1601186245299', '1611577244212', '1611577086549', '1601186343678',
  '(168)', '(140)', '1611577282961', '1611577355606',
  // Normal tier — descriptive SVGA
  'claping', 'crying', 'emojikissleft', 'emojikissright',
  'emotion (4)', 'sorry',
  // Normal tier — animated WebP
  '1658907259022', '1658907278534', '1658907295126', '1658907314781',
  // SVIP tier — SVGA
  '1712736170074', '1712807506011', '1712807547446', '1712807681481',
  '1712807706442', '1712807732067', '1712807760684', '1712807779689',
  '1735205551271',
  'emotion (2)', 'emotion (3)',
]);

async function getRecentGiftEvents(roomId: string, limit = 20): Promise<any[]> {
  const streamKey = `room:{${roomId}}:gift_events`;
  try {
    const rows = await redis.xrevrange(streamKey, '+', '-', 'COUNT', limit);
    // rows: Array<[id, [field, value, field, value...]]>
    const events: any[] = [];
    for (const [, fields] of rows as any) {
      for (let i = 0; i < fields.length; i += 2) {
        const k = fields[i];
        const v = fields[i + 1];
        if (k === 'payload' && typeof v === 'string') {
          try {
            events.push(JSON.parse(v));
          } catch {
            // ignore malformed payload
          }
        }
      }
    }
    // xrevrange returns newest→oldest; send oldest→newest for natural playback
    return events.reverse();
  } catch {
    return [];
  }
}

interface Applicant {
  userId: string;
  displayName: string;
  avatar: string;
  username: string | null;
  hakaId: string | null;
  seatPosition: number | null;   // seat the applicant tapped (preferred), null = any
  richLevel: number;
  charmLevel: number;
  role: string;
  hostType: string;
  isVerified: boolean;
  gender: string;
  age: number | null;
  country: string;
  tags: { name: string; displayName: string; color: string; iconUrl: string }[];
  equippedFrame: ReturnType<typeof serializeUserSummary>['equippedFrame'];
  activeSpecialId: ReturnType<typeof serializeUserSummary>['activeSpecialId'];
  activeSpecialIdLevel: ReturnType<typeof serializeUserSummary>['activeSpecialIdLevel'];
  createdAt: number;
}

async function getApplicants(roomId: string): Promise<Applicant[]> {
  const raw = await redis.hgetall(`room:${roomId}:applicants`);
  if (!raw) return [];
  return Object.values(raw).map((v) => JSON.parse(v) as Applicant);
}

async function isHostOrRoomAdmin(roomId: string, userId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hostId: true } });
  if (!room) return false;
  if (room.hostId === userId) return true;
  const admin = await prisma.roomAdmin.findFirst({ where: { roomId, userId }, select: { id: true } });
  return !!admin;
}

// Pick the first empty, unlocked, non-host seat — used when approving an applicant
// whose preferred seat is unavailable. Returns null if the room is full.
async function pickFirstFreeSeat(roomId: string, preferred: number | null): Promise<number | null> {
  const seats = await prisma.roomSeat.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { position: true, userId: true, isLocked: true },
  });
  const freeAndOpen = (s: { position: number; userId: string | null; isLocked: boolean }) =>
    s.position > 1 && !s.userId && !s.isLocked;
  if (preferred !== null) {
    const match = seats.find((s) => s.position === preferred && freeAndOpen(s));
    if (match) return match.position;
  }
  const any = seats.find(freeAndOpen);
  return any?.position ?? null;
}

/** Debounce window so a reconnecting socket can `room:join` before we clear seats (disconnect race). */
const FULL_LEAVE_DEBOUNCE_MS = 2000;

type RoomLeaveMode = 'explicit' | 'disconnect';

const pendingFullRoomLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function fullRoomLeaveKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

function cancelPendingFullRoomLeave(roomId: string, userId: string) {
  const key = fullRoomLeaveKey(roomId, userId);
  const t = pendingFullRoomLeaves.get(key);
  if (t) {
    clearTimeout(t);
    pendingFullRoomLeaves.delete(key);
  }
}

/** True if another socket (not `excludeSocketId`) for the same user is still in `roomId`. */
async function hasOtherUserSocketInRoom(
  io: Server,
  roomId: string,
  userId: string,
  excludeSocketId: string,
): Promise<boolean> {
  try {
    const sockets = await io.in(roomId).fetchSockets();
    return sockets.some((s) => s.data.userId === userId && s.id !== excludeSocketId);
  } catch {
    return false;
  }
}

/** True if any socket for `userId` is currently in `roomId` (used after debounce). */
async function hasAnyUserSocketInRoom(io: Server, roomId: string, userId: string): Promise<boolean> {
  try {
    const sockets = await io.in(roomId).fetchSockets();
    return sockets.some((s) => s.data.userId === userId);
  } catch {
    return false;
  }
}

function scheduleDebouncedFullRoomLeave(io: Server, roomId: string, userId: string) {
  const key = fullRoomLeaveKey(roomId, userId);
  const existing = pendingFullRoomLeaves.get(key);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pendingFullRoomLeaves.delete(key);
    void (async () => {
      if (await hasAnyUserSocketInRoom(io, roomId, userId)) return;
      await performFullRoomUserLeave(io, roomId, userId, 'disconnect');
    })();
  }, FULL_LEAVE_DEBOUNCE_MS);
  pendingFullRoomLeaves.set(key, t);
}

/**
 * Full leave: DB seats, Redis viewers, broadcasts. Caller must ensure the user has no remaining
 * sockets in the room (or use debounced disconnect path).
 *
 * Room host on debounced disconnect: keep mic seats (Keep / brief reconnect). On explicit
 * `room:leave` (Exit), clear host presence like any other user.
 */
async function performFullRoomUserLeave(
  io: Server,
  roomId: string,
  userId: string,
  mode: RoomLeaveMode,
) {
  // Remove any pending seat application
  const removedApp = await redis.hdel(`room:${roomId}:applicants`, userId);
  if (removedApp) {
    io.to(roomId).emit('seat.application.removed', { userId });
    void emitToRoomManagers(io, roomId, 'seat.application.removed', { userId });
  }

  const roomMeta = await prisma.room
    .findUnique({ where: { id: roomId }, select: { hostId: true } })
    .catch(() => null);
  if (roomMeta && userId === roomMeta.hostId && mode === 'disconnect') {
    return;
  }

  const occupiedSeats = await prisma.roomSeat.findMany({
    where: { roomId, userId },
    select: { position: true, isLocked: true },
  }).catch(() => [] as { position: number; isLocked: boolean }[]);

  await prisma.roomSeat.updateMany({
    where: { roomId, userId },
    data: { userId: null, isMuted: false },
  }).catch(() => {});

  for (const seat of occupiedSeats) {
    io.to(roomId).emit('seat.updated', {
      position: seat.position,
      userId: null,
      user: null,
      isLocked: seat.isLocked,
      isMuted: false,
    });
  }

  if (occupiedSeats.length > 0) {
    void calcService.endActiveSessionForRoom(roomId).catch(() => undefined);
  }

  await clearUserRoomChatSession(roomId, userId).catch(() => {});

  await clearUserActiveRoom(userId, roomId).catch(() => {});
  const { count } = await applyRoomParticipantCount(io, roomId).catch(() => ({
    userIds: [] as string[],
    count: 0,
  }));

  socketBroadcastUserLeft(io, roomId, userId, count);
}

function socketBroadcastUserLeft(io: Server, roomId: string, userId: string, count: number) {
  io.to(roomId).emit('user.left', { userId, id: userId, viewerCount: count });
  io.to(roomId).emit('listener.count', { count, viewerCount: count });
}

async function emitToRoomManagers(
  io: Server,
  roomId: string,
  event: string,
  payload: any,
  knownHostId?: string,
) {
  // Always emit to roomId (normal behavior) — caller can still do this explicitly,
  // but keeping this helper focused on user rooms avoids double-emits.
  const ids = new Set<string>();
  if (knownHostId) ids.add(knownHostId);
  if (!knownHostId) {
    try {
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hostId: true } });
      if (room?.hostId) ids.add(room.hostId);
    } catch {
      // ignore
    }
  }
  try {
    const admins = await prisma.roomAdmin.findMany({ where: { roomId }, select: { userId: true } });
    for (const a of admins) {
      if (a?.userId) ids.add(a.userId);
    }
  } catch {
    // ignore
  }

  for (const id of ids) {
    io.to(`user:${id}`).emit(event, payload);
  }
}

export function registerRoomHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;

    // ── room:join ─────────────────────────────────────────────────────────
    socket.on('room:join', async ({ roomId, password }: { roomId: string; password?: string }, ack?: Function) => {
      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: {
            id: true, status: true, hostId: true, viewerCount: true,
            isLocked: true, password: true,
            theme: {
              select: {
                id: true, name: true, gradientFrom: true, gradientTo: true,
                backgroundImageUrl: true, svgaUrl: true,
                accentColor: true, chatBubbleColor: true,
                storeItemId: true,
              },
            },
          },
        });

        if (!room || room.status === 'ended') {
          ack?.({ error: 'Room not found or has ended' });
          return;
        }

        // Password-protected room: host and room admins bypass; others must supply correct password
        if (room.isLocked && room.password && !(await isHostOrRoomAdmin(roomId, userId))) {
          const isBcryptHash =
            typeof room.password === 'string' && room.password.startsWith('$2');
          const passwordValid = password
            ? (isBcryptHash
                ? await bcrypt.compare(password, room.password)
                : password === room.password) // backward-compat: plaintext passwords set before hashing was introduced
            : false;
          if (!passwordValid) {
            ack?.({ error: 'password_required', isLocked: true });
            return;
          }
        }

        // Block kicked / banned users from re-joining
        if (room.hostId !== userId) {
          const banDetails = await getActiveRoomBanDetails(userId, roomId);
          if (banDetails) {
            ack?.({
              error: 'You have been kicked from this room. Please try again later.',
              kicked: true,
              expiresAt: banDetails.expiresAt || undefined,
              cooldownMinutes: banDetails.cooldownMinutes || undefined,
            });
            return;
          }
        }

        // Keep / foreground return: socket never left the room channel, so skip entry broadcast.
        const alreadyInRoom = socket.rooms.has(roomId);
        socket.join(roomId);
        cancelPendingFullRoomLeave(roomId, userId);

        if (room.hostId === userId) {
          const releasedDupes = await roomsService.dedupeUserSeatOccupancy(roomId, userId, 1);
          for (const cleared of releasedDupes) {
            io.to(roomId).emit('seat.updated', {
              position: cleared.position,
              userId: null,
              user: null,
              isLocked: cleared.isLocked,
              isMuted: false,
            });
          }
        }

        const restoredHostSeat = await roomsService.ensureHostSeatedAtPositionOne(roomId, userId);
        if (restoredHostSeat) {
          io.to(roomId).emit('seat.updated', {
            position: restoredHostSeat.position,
            userId: restoredHostSeat.userId,
            user: restoredHostSeat.user,
            isLocked: restoredHostSeat.isLocked,
            isMuted: restoredHostSeat.isMuted,
          });
        }

        // Self-heal mic tracking: a host seated in a live room (via go-live, a
        // reconnect, or seed data) must have an open mic session, else the level
        // task never accrues. Idempotent — keeps an existing session's startedAt
        // so reopening a minimised room doesn't reset the accrued time.
        if (room.hostId === userId) {
          void ensureMicSession(userId, roomId, restoredHostSeat?.position ?? 1).catch(
            () => undefined,
          );
        }

        // Reconnect: if room has an active PK, send current state to this socket
        try {
          const activeMatch = await pkService.getActiveMatchForRoom(roomId);
          if (activeMatch) {
            socket.join(`pk:${activeMatch.id}`);
            const [rawA, rawB] = await redis.mget(
              `pk:${activeMatch.id}:scoreA`,
              `pk:${activeMatch.id}:scoreB`,
            );
            const endsAtRaw = await redis.get(`pk:${activeMatch.id}:endsAt`);
            socket.emit(PK_EVENTS.STARTED, {
              matchId: activeMatch.id,
              hostAId: activeMatch.hostAId,
              hostBId: activeMatch.hostBId,
              roomAId: activeMatch.roomAId,
              roomBId: activeMatch.roomBId,
              scoreA: Number(rawA ?? 0),
              scoreB: Number(rawB ?? 0),
              durationSecs: activeMatch.durationSecs,
              endsAt: endsAtRaw ? new Date(Number(endsAtRaw)).toISOString() : null,
            });
          }
        } catch { /* non-critical */ }

        // Reconnect: if room has an active Normal Battle, send current state
        try {
          const activeBattle = await normalBattleService.getActiveBattle(roomId);
          if (activeBattle) {
            socket.join(`battle:${activeBattle.id}`);
            const [rawA, rawB] = await redis.mget(
              `battle:${activeBattle.id}:scoreA`,
              `battle:${activeBattle.id}:scoreB`,
            );
            const endsAtRaw = await redis.get(`battle:${activeBattle.id}:endsAt`);
            socket.emit(BATTLE_EVENTS.STARTED, {
              battleId: activeBattle.id,
              roomId: activeBattle.roomId,
              participantAId: activeBattle.participantAId,
              participantBId: activeBattle.participantBId,
              mode: activeBattle.mode,
              scoreA: Number(rawA ?? 0),
              scoreB: Number(rawB ?? 0),
              durationSecs: activeBattle.durationSecs,
              endsAt: endsAtRaw ? new Date(Number(endsAtRaw)).toISOString() : null,
            });
          }
        } catch { /* non-critical */ }

        await setUserActiveRoom(userId, roomId);

        const { hasSuperAdminPower } = await import('../modules/moderation/super-admin-power');
        const invisibleJoin = await hasSuperAdminPower(userId);
        (socket.data as { invisibleJoin?: boolean }).invisibleJoin = invisibleJoin;

        const { userIds, count } = await applyRoomParticipantCount(io, roomId);
        const visibleUserIds = invisibleJoin ? userIds.filter((id) => id !== userId) : userIds;
        const visibleCount = invisibleJoin ? Math.max(0, count - 1) : count;
        const [rawViewers, hiddenSettings] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: visibleUserIds } },
            select: userSummarySelect(),
          }),
          prisma.userSettings.findMany({
            where: { userId: { in: visibleUserIds }, mysteryManLive: true },
            select: { userId: true },
          }),
        ]);
        const hiddenIds = new Set(hiddenSettings.map((s) => s.userId));
        const viewers = rawViewers.map((v) => {
          const summary = serializeUserSummary(v);
          return hiddenIds.has(v.id)
            ? {
                id: v.id,
                displayName: 'Mystery',
                avatar: '',
                username: null,
                hakaId: null,
                activeSpecialId: null,
                activeSpecialIdLevel: null,
                ...emptyEquippedCosmetics(),
              }
            : summary;
        });

        const user = invisibleJoin
          ? null
          : (viewers.find((u) => u.id === userId) ?? null);

        if (!invisibleJoin && !alreadyInRoom) {
          // Equipped, non-expired entry effect (category `entry`) → play-once full-screen
          // SVGA for everyone in the room (the SVGA is stored on the item's `image`).
          let entryEffect: { svga: string; name: string } | null = null;
          const equippedEntry = await prisma.userStoreItem.findFirst({
            where: {
              userId,
              isEquipped: true,
              item: { category: 'entry' },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { item: { select: { image: true, name: true } } },
          });
          const entrySvga = equippedEntry?.item.image?.trim();
          if (entrySvga) entryEffect = { svga: entrySvga, name: equippedEntry!.item.name };

          io.to(roomId).emit('user.joined', {
            userId,
            id: userId,
            displayName: user?.displayName ?? '',
            avatar: user?.avatar ?? '',
            viewerCount: visibleCount,
            entryEffect,
          });
        }
        io.to(roomId).emit('listener.count', { count: visibleCount, viewerCount: visibleCount });
        io.to(roomId).emit('room.roster', { viewers, count: visibleCount });

        const themeResult = await roomsService.ensureRoomThemeValid(
          roomId,
          room.hostId,
          (room.theme ?? null) as any,
        );

        ack?.({
          ok: true,
          viewerCount: visibleCount,
          viewers,
          invisibleJoin,
          applicants: await getApplicants(roomId),
          activeTheme: themeResult.activeTheme ?? null,
          restoredHostSeat: restoredHostSeat ?? null,
          rtcUids: await getRtcUidsForRoom(roomId),
          // Full current mic occupancy so the joining user reconciles existing
          // seated users immediately — independent of their (possibly stale) HTTP
          // room snapshot. Same shape as `seat.updated`.
          seats: await getRoomSeatsSnapshot(roomId),
        });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to join room' });
      }
    });

    // ── room:leave ────────────────────────────────────────────────────────
    socket.on('room:leave', async ({ roomId }: { roomId: string }) => {
      await handleLeaveRoom(socket, io, roomId, userId, 'explicit');
    });

    // ── rtc:register — client publishes Agora UID for speaking-indicator mapping ──
    socket.on(
      'rtc:register',
      async ({ roomId, uid }: { roomId: string; uid: number }, ack?: Function) => {
        try {
          if (!roomId || !Number.isFinite(uid) || uid <= 0) {
            ack?.({ error: 'Invalid rtc:register payload' });
            return;
          }
          if (!socket.rooms.has(roomId)) {
            ack?.({ error: 'Not in room' });
            return;
          }
          const rtcUid = Math.floor(uid);
          io.to(roomId).emit('rtc.uid', { userId, uid: rtcUid });
          ack?.({ ok: true });
        } catch (err: any) {
          ack?.({ error: err.message ?? 'Failed to register RTC UID' });
        }
      },
    );

    // ── seat:take ─────────────────────────────────────────────────────────
    socket.on('seat:take', async ({ roomId, position }: { roomId: string; position: number }, ack?: Function) => {
      try {
        await assertNoRiskBlock(userId, 'disableGames');
        const { seat, releasedPositions } = await roomsService.takeSeat(roomId, position, userId);
        const { count: viewerCount } = await applyRoomParticipantCount(io, roomId);
        io.to(roomId).emit('listener.count', { count: viewerCount, viewerCount });
        io.to(roomId).emit('seat.updated', {
          position: seat.position,
          userId: seat.userId,
          user: seat.user,
          isLocked: seat.isLocked,
          isMuted: seat.isMuted,
        });
        for (const pos of releasedPositions) {
          io.to(roomId).emit('seat.updated', {
            position: pos,
            userId: null,
            user: null,
            isLocked: false,
            isMuted: false,
          });
        }
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to take seat' });
      }
    });

    // ── seat:leave ────────────────────────────────────────────────────────
    socket.on('seat:leave', async ({ roomId, position }: { roomId: string; position: number }, ack?: Function) => {
      try {
        const updated = await roomsService.leaveSeat(roomId, position, userId);
        const { count: viewerCount } = await applyRoomParticipantCount(io, roomId);
        io.to(roomId).emit('listener.count', { count: viewerCount, viewerCount });
        io.to(roomId).emit('seat.updated', {
          position: updated.position,
          userId: null,
          user: null,
          isLocked: updated.isLocked,
          isMuted: false,
        });
        // Any mic exit ends the calculator session immediately and declares results.
        void calcService.endActiveSessionForRoom(roomId).catch(() => undefined);
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to leave seat' });
      }
    });

    // ── seat:lock (host only) ─────────────────────────────────────────────
    socket.on('seat:lock', async ({ roomId, position, lock }: { roomId: string; position: number; lock: boolean }, ack?: Function) => {
      try {
        const updated = await roomsService.lockSeat(roomId, position, userId, lock);
        io.to(roomId).emit('seat.updated', {
          position: updated.position,
          userId: updated.userId,
          user: null,
          isLocked: updated.isLocked,
          isMuted: updated.isMuted,
        });
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to lock seat' });
      }
    });

    // ── seat:mute (host or admin) ───────────────────────────────────────────
    socket.on('seat:mute', async ({ roomId, position, mute }: { roomId: string; position: number; mute: boolean }, ack?: Function) => {
      try {
        const updated = await roomsService.muteSeat(roomId, position, userId, mute);
        io.to(roomId).emit('seat.updated', {
          position: updated.position,
          userId: updated.userId,
          user: updated.user,
          isLocked: updated.isLocked,
          isMuted: updated.isMuted,
        });
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to mute seat' });
      }
    });

    // ── seat:kick (host or admin) ───────────────────────────────────────────
    socket.on('seat:kick', async ({ roomId, position }: { roomId: string; position: number }, ack?: Function) => {
      try {
        const result = await roomsService.kickFromSeat(roomId, position, userId);
        io.to(roomId).emit('seat.updated', {
          position: result.position,
          userId: null,
          user: null,
          isLocked: result.isLocked,
          isMuted: false,
        });

        // Any mic drop ends the calculator session immediately and declares results.
        if (result.kickedUserId) {
          void calcService.endActiveSessionForRoom(roomId).catch(() => undefined);
        }

        // Notify the kicked user and force-disconnect from room
        if (result.kickedUserId) {
          const kickedSockets = [...(io.sockets.adapter.rooms.get(roomId) ?? [])]
            .map((sid) => io.sockets.sockets.get(sid))
            .filter((s) => s?.data?.userId === result.kickedUserId);
          for (const s of kickedSockets) {
            s?.emit('room:kicked', {
              roomId,
              reason: 'You have been kicked from this room.',
              cooldownMinutes: result.cooldownMinutes ?? 120,
            });
            s?.leave(roomId);
          }
        }

        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to kick from seat' });
      }
    });

    // ── room:kick (host or admin; seated users and listeners) ─────────────
    socket.on('room:kick', async ({ roomId, userId: targetUserId }: { roomId: string; userId: string }, ack?: Function) => {
      try {
        const result = await roomsService.kickUserFromRoom(roomId, targetUserId, userId);

        for (const seat of result.releasedSeats) {
          io.to(roomId).emit('seat.updated', {
            position: seat.position,
            userId: null,
            user: null,
            isLocked: seat.isLocked,
            isMuted: false,
          });
        }

        void calcService.resetScore(roomId, result.kickedUserId).catch(() => undefined);

        const kickedSockets = [...(io.sockets.adapter.rooms.get(roomId) ?? [])]
          .map((sid) => io.sockets.sockets.get(sid))
          .filter((s) => s?.data?.userId === result.kickedUserId);
        for (const kickedSocket of kickedSockets) {
          kickedSocket?.emit('room:kicked', {
            roomId,
            reason: 'You have been kicked from this room.',
            cooldownMinutes: result.cooldownMinutes,
          });
          kickedSocket?.leave(roomId);
        }

        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to kick from room' });
      }
    });

    // ── chat:message ──────────────────────────────────────────────────────
    socket.on('chat:message', async ({ roomId, content }: { roomId: string; content: string }, ack?: Function) => {
      try {
        await assertNoRiskBlock(userId, 'blockChat');
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { chatLocked: true, hostId: true, publicMsgEnabled: true } });
        if (room?.chatLocked) {
          const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId }, select: { id: true } });
          if (!isAdmin && room.hostId !== userId) {
            ack?.({ error: 'Chat is disabled in this room' });
            return;
          }
        }
        if (room?.publicMsgEnabled === false) {
          const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId }, select: { id: true } });
          if (!isAdmin && room.hostId !== userId) {
            ack?.({ error: 'Public messages are disabled in this room' });
            return;
          }
        }
        const msg = await chatService.sendRoomMessage(userId, roomId, content, 'text');
        io.to(roomId).emit('message.sent', msg);
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to send message' });
      }
    });

    // ── chat:quick — pre-canned short message ─────────────────────────────
    socket.on('chat:quick', async ({ roomId, content }: { roomId: string; content: string }, ack?: Function) => {
      try {
        await assertNoRiskBlock(userId, 'blockChat');
        if (!content || content.length > 80) {
          ack?.({ error: 'Invalid quick message' });
          return;
        }
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { chatLocked: true, hostId: true, publicMsgEnabled: true } });
        if (room?.chatLocked) {
          const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId }, select: { id: true } });
          if (!isAdmin && room.hostId !== userId) {
            ack?.({ error: 'Chat is disabled in this room' });
            return;
          }
        }
        if (room?.publicMsgEnabled === false) {
          const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId }, select: { id: true } });
          if (!isAdmin && room.hostId !== userId) {
            ack?.({ error: 'Public messages are disabled in this room' });
            return;
          }
        }
        const msg = await chatService.sendRoomMessage(userId, roomId, content, 'quick');
        io.to(roomId).emit('message.sent', msg);
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to send quick message' });
      }
    });

    // ── room:emoji ────────────────────────────────────────────────────────
    // Seated user fires an SVGA emoji that plays on their own seat avatar.
    // Target seat is resolved server-side from the sender's current seat
    // so the client can't spoof position.
    socket.on('music:ended', async ({ roomId }: { roomId: string }) => {
      try {
        if (!roomId) return;
        const next = await roomsService.advanceMusicTrack(roomId, 'next');
        if (next) {
          io.to(roomId).emit('music:changed', {
            url: next.url,
            name: next.name,
            trackId: next.id,
            index: next.index,
            total: next.total,
            roomId,
          });
        } else {
          io.to(roomId).emit('music:stopped', { roomId });
        }
      } catch {
        // non-fatal — ignore if room has no queue
      }
    });

    socket.on('room:emoji', async (
      { roomId, emojiKey }: { roomId: string; seatPosition?: number; emojiKey: string },
      ack?: Function,
    ) => {
      try {
        await assertNoRiskBlock(userId, 'blockChat');
        if (!roomId || typeof emojiKey !== 'string' || !ALLOWED_EMOJI_KEYS.has(emojiKey)) {
          ack?.({ error: 'Invalid emoji' });
          return;
        }

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: { id: true, status: true, hostId: true },
        });
        if (!room || room.status === 'ended') {
          ack?.({ error: 'Room not found or has ended' });
          return;
        }

        // Sender must be seated — find their seat position
        const senderSeat = await prisma.roomSeat.findFirst({
          where: { roomId, userId },
          select: { position: true },
        });
        if (!senderSeat) {
          ack?.({ error: 'Only seated users can send emoji reactions' });
          return;
        }

        io.to(roomId).emit('emoji.received', {
          seatPosition: senderSeat.position,
          emojiKey,
          senderId: userId,
        });
        ack?.({ ok: true, seatPosition: senderSeat.position });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to send emoji' });
      }
    });

    // ── seat:apply ────────────────────────────────────────────────────────
    // Listener requests a seat. When `room.applyForMic` is true we queue the
    // application; otherwise we assign the seat immediately (delegates to
    // roomsService.takeSeat). Approval is handled by host / room admins.
    socket.on('seat:apply', async (
      { roomId, position }: { roomId: string; position?: number | null },
      ack?: Function,
    ) => {
      try {
        await assertNoRiskBlock(userId, 'disableGames');
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: { id: true, status: true, hostId: true, applyForMic: true },
        });
        if (!room || room.status === 'ended') {
          ack?.({ error: 'Room not found or has ended' });
          return;
        }
        if (room.hostId === userId) { ack?.({ error: 'Host cannot apply for a seat' }); return; }

        // Check if user is already seated
        const existingSeat = await prisma.roomSeat.findFirst({
          where: { roomId, userId },
        });
        if (existingSeat) { ack?.({ error: 'You are already on a seat' }); return; }

        // Fast path: apply-for-mic disabled → take the seat right now.
        if (!room.applyForMic) {
          const target = position ?? (await pickFirstFreeSeat(roomId, null));
          if (!target) { ack?.({ error: 'No available seats' }); return; }
          try {
            const { seat, releasedPositions } = await roomsService.takeSeat(roomId, target, userId);
            io.to(roomId).emit('seat.updated', {
              position: seat.position,
              userId: seat.userId,
              user: seat.user,
              isLocked: seat.isLocked,
              isMuted: seat.isMuted,
            });
            for (const pos of releasedPositions) {
              io.to(roomId).emit('seat.updated', {
                position: pos,
                userId: null, user: null, isLocked: false, isMuted: false,
              });
            }
            ack?.({ ok: true, approved: true, seatPosition: seat.position });
          } catch (err: any) {
            ack?.({ error: err.message ?? 'Failed to take seat' });
          }
          return;
        }

        // Queue path: apply-for-mic enabled — add to pending list.
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            ...userSummarySelect(),
            role: true, hostType: true, isVerified: true,
            gender: true, dateOfBirth: true, country: true,
            level: { select: { richLevel: true, charmLevel: true } },
            tags: { include: { tag: true }, orderBy: { tag: { sortOrder: 'asc' } } },
          },
        });
        if (!user) { ack?.({ error: 'User not found' }); return; }
        const summary = serializeUserSummary(user);

        // Prevent duplicate application
        const alreadyApplied = await redis.hexists(`room:${roomId}:applicants`, userId);
        if (alreadyApplied) { ack?.({ error: 'You have already applied' }); return; }

        const applicant: Applicant = {
          userId,
          displayName: user.displayName,
          avatar: user.avatar ?? '',
          username: user.username ?? null,
          hakaId: summary.hakaId,
          seatPosition: position ?? null,
          richLevel: user.level?.richLevel ?? 0,
          charmLevel: user.level?.charmLevel ?? 0,
          role: user.role,
          hostType: user.hostType,
          isVerified: user.isVerified,
          gender: user.gender,
          age: computeAge(user.dateOfBirth),
          country: user.country,
          tags: mapSortedUserTags(user.tags),
          equippedFrame: summary.equippedFrame,
          activeSpecialId: summary.activeSpecialId,
          activeSpecialIdLevel: summary.activeSpecialIdLevel,
          createdAt: Date.now(),
        };
        await redis.hset(`room:${roomId}:applicants`, userId, JSON.stringify(applicant));
        await redis.expire(`room:${roomId}:applicants`, 3600);

        io.to(roomId).emit('seat.application.added', { applicant });
        // Ensure host/admin see the applicant even if they are not currently joined to `roomId`.
        void emitToRoomManagers(io, roomId, 'seat.application.added', { applicant }, room.hostId);

        // System chat notice so everyone sees who applied (null sender = no user attribution).
        try {
          const msg = await chatService.sendSystemMessage(
            roomId,
            null,
            `${user.displayName} applied for a seat`,
          );
          io.to(roomId).emit('message.sent', msg);
        } catch { /* non-fatal */ }

        ack?.({ ok: true, queued: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to apply for seat' });
      }
    });

    // ── seat:cancel-apply ────────────────────────────────────────────────
    socket.on('seat:cancel-apply', async ({ roomId }: { roomId: string }, ack?: Function) => {
      try {
        const removed = await redis.hdel(`room:${roomId}:applicants`, userId);
        if (removed) {
          io.to(roomId).emit('seat.application.removed', { userId });
          void emitToRoomManagers(io, roomId, 'seat.application.removed', { userId });
        }
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to cancel application' });
      }
    });

    // ── seat:approve (host / room admin only) ────────────────────────────
    socket.on('seat:approve', async (
      { roomId, applicantUserId }: { roomId: string; applicantUserId: string },
      ack?: Function,
    ) => {
      try {
        if (!(await isHostOrRoomAdmin(roomId, userId))) {
          ack?.({ error: 'Only host or admins can approve' });
          return;
        }
        const raw = await redis.hget(`room:${roomId}:applicants`, applicantUserId);
        const applicant = raw ? (JSON.parse(raw) as Applicant) : null;
        if (!applicant) { ack?.({ error: 'Applicant not found' }); return; }

        const target = await pickFirstFreeSeat(roomId, applicant.seatPosition);
        if (!target) { ack?.({ error: 'No available seats' }); return; }

        const { seat, releasedPositions } = await roomsService.takeSeat(roomId, target, applicantUserId);

        await redis.hdel(`room:${roomId}:applicants`, applicantUserId);

        io.to(roomId).emit('seat.updated', {
          position: seat.position,
          userId: seat.userId,
          user: seat.user,
          isLocked: seat.isLocked,
          isMuted: seat.isMuted,
        });
        for (const pos of releasedPositions) {
          io.to(roomId).emit('seat.updated', {
            position: pos,
            userId: null, user: null, isLocked: false, isMuted: false,
          });
        }
        io.to(roomId).emit('seat.application.removed', { userId: applicantUserId });
        io.to(roomId).emit('seat.application.resolved', {
          userId: applicantUserId,
          approved: true,
          seatPosition: seat.position,
        });
        void emitToRoomManagers(io, roomId, 'seat.application.removed', { userId: applicantUserId });
        void emitToRoomManagers(io, roomId, 'seat.application.resolved', {
          userId: applicantUserId,
          approved: true,
          seatPosition: seat.position,
        });

        ack?.({ ok: true, seatPosition: seat.position });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to approve applicant' });
      }
    });

    // ── PK: forfeit ───────────────────────────────────────────────────────
    socket.on(PK_EVENTS.FORFEIT, async ({ matchId }: { matchId: string }) => {
      try {
        const result = await pkService.forfeit(matchId, userId);
        io.to(`pk:${matchId}`).emit(PK_EVENTS.ENDED, result);
        io.in(`pk:${matchId}`).socketsLeave(`pk:${matchId}`);
      } catch (err: any) {
        socket.emit('error', { message: err?.message ?? 'Forfeit failed' });
      }
    });

    // ── Battle: vote ──────────────────────────────────────────────────────
    socket.on(BATTLE_EVENTS.VOTE, async ({ battleId, voteFor }: { battleId: string; voteFor: 'A' | 'B' }, ack?: Function) => {
      try {
        await assertNoRiskBlock(userId, 'disableGames');
        const activeBattle = await prisma.normalBattle.findFirst({
          where: { id: battleId, status: 'active', mode: 'votes' },
        });
        if (!activeBattle) { ack?.({ error: 'No active votes-mode battle' }); return; }
        const scores = await normalBattleService.addScore(battleId, voteFor, 1);
        io.to(`battle:${battleId}`).emit(BATTLE_EVENTS.SCORE_UPDATED, { battleId, ...scores });
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Vote failed' });
      }
    });

    // ── Battle: cancel (via socket) ───────────────────────────────────────
    socket.on(BATTLE_EVENTS.CANCEL, async ({ roomId: cancelRoomId }: { roomId: string }, ack?: Function) => {
      try {
        const room = await prisma.room.findUnique({ where: { id: cancelRoomId }, select: { hostId: true } });
        if (room?.hostId !== userId) { ack?.({ error: 'Not the host' }); return; }
        const battle = await normalBattleService.getActiveBattle(cancelRoomId);
        if (!battle) { ack?.({ error: 'No active battle' }); return; }
        await normalBattleService.cancelBattle(battle.id);
        io.to(`battle:${battle.id}`).emit(BATTLE_EVENTS.CANCELLED, { battleId: battle.id });
        io.in(`battle:${battle.id}`).socketsLeave(`battle:${battle.id}`);
        ack?.({ ok: true });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Cancel failed' });
      }
    });

    // ── disconnecting (before rooms are torn down) ─────────────────────────
    // `disconnect` fires after `leaveAll()` — `socket.rooms` is already empty there,
    // so we must capture membership on `disconnecting` for seat/viewer cleanup.
    socket.on('disconnecting', () => {
      const roomIds = [...socket.rooms].filter((id) => id !== socket.id);
      void (async () => {
        for (const roomId of roomIds) {
          await handleLeaveRoom(socket, io, roomId, userId, 'disconnect');
        }
      })();
    });
  });
}

// ── Helper: handle user leaving a room ─────────────────────────────────────

/**
 * Per-socket leave: always removes this socket from the room channel.
 * Full leave (seats, viewers, broadcasts) runs only when no other connection for this user
 * remains in the room. `disconnect` debounces full leave so reconnect can `room:join` first.
 */
async function handleLeaveRoom(
  socket: Socket,
  io: Server,
  roomId: string,
  userId: string,
  mode: RoomLeaveMode,
) {
  socket.leave(roomId);

  // Auth middleware joins `user:<id>` for admin / commission fan-out — not a voice room.
  if (roomId.startsWith('user:')) {
    return;
  }

  if (mode === 'explicit') {
    await clearUserRoomChatSession(roomId, userId).catch(() => {});
  }

  if (await hasOtherUserSocketInRoom(io, roomId, userId, socket.id)) {
    return;
  }

  if (mode === 'explicit') {
    cancelPendingFullRoomLeave(roomId, userId);
    await performFullRoomUserLeave(io, roomId, userId, 'explicit');
    return;
  }

  scheduleDebouncedFullRoomLeave(io, roomId, userId);
}
