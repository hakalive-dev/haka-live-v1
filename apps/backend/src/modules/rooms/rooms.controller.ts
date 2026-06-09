import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './rooms.service';
import * as agoraService from './agora.service';
import * as calcService from './calculator.service';
import { ok, created, fail } from '../../utils/response';
import { uploadToStorage } from '../../utils/storage';
import { storageFilename } from '../../utils/upload';
import { getIO } from '../../sockets';
import { createNotification } from '../notifications/notifications.service';
import { insertServerDirectMessage } from '../chat/chat.service';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { serializeUserSummary, userSummarySelect, emptyEquippedCosmetics } from '../users/user-summary';
import { prisma } from '../../config/prisma';

// ── Validation schemas ─────────────────────────────────────────────────────────

const createSchema = z.object({
  title:       z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  coverImage:  z.string().url().optional(),
  category:    z.enum(['general', 'music', 'talk', 'gaming', 'dating', 'education']).optional(),
  type:        z.enum(['public', 'private']).optional(),
  micConfig:   z.number().int().refine((v) => service.VALID_MIC_CONFIGS.includes(v as (typeof service.VALID_MIC_CONFIGS)[number]), {
    message: 'micConfig must be 5, 10, 15, 20, 25, or 30',
  }).optional(),
  password:    z.string().length(6).regex(/^\d{6}$/, 'Password must be exactly 6 digits').optional(),
  roomMode:    z.enum(['chat', 'live']).optional(),
});

const updateSchema = z.object({
  title:       z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  coverImage:  z.string().url().optional(),
  category:    z.enum(['general', 'music', 'talk', 'gaming', 'dating', 'education']).optional(),
  type:        z.enum(['public', 'private']).optional(),
  micConfig:   z.number().int().refine((v) => service.VALID_MIC_CONFIGS.includes(v as (typeof service.VALID_MIC_CONFIGS)[number]), {
    message: 'micConfig must be 5, 10, 15, 20, 25, or 30',
  }).optional(),
  password:    z.union([
    z.string().length(6).regex(/^\d{6}$/, 'Password must be exactly 6 digits'),
    z.literal(''),
    z.null(),
  ]).optional(),
  applyForMic: z.boolean().optional(),
  chatLocked:  z.boolean().optional(),
  gameType:    z.string().max(50).optional(),
  fanBadge:    z.string().max(50).optional(),
  roomMode:    z.enum(['chat', 'live']).optional(),
});

const adminSchema = z.object({
  userId: z.string().uuid(),
});

const kickUserSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

const listSchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(50).default(20),
  category:  z.enum(['general', 'music', 'talk', 'gaming', 'dating', 'education']).optional(),
  following: z.coerce.boolean().optional(),
  nearby:    z.coerce.boolean().optional(),
  newest:    z.coerce.boolean().optional(),
  roomMode:  z.enum(['chat', 'live']).optional(),
});

const lockSchema = z.object({
  lock: z.boolean(),
});

// ── Controllers ────────────────────────────────────────────────────────────────

export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const room = await service.createRoom(req.user!.id, parsed.data);
    created(res, room, 'Room created');
  } catch (err) { next(err); }
}

export async function getMyActiveRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.getMyActiveRoom(req.user!.id);
    ok(res, room);
  } catch (err) { next(err); }
}

export async function listRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, category, following, nearby, newest, roomMode } = listSchema.parse(req.query);
    const result = await service.listLiveRooms({
      page,
      limit,
      category,
      following,
      nearby,
      newest,
      roomMode,
      userId: req.user?.id,
    });
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.getRoomById(req.params.id, req.user?.id);
    ok(res, room);
  } catch (err) { next(err); }
}

export async function updateRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const room = await service.updateRoom(req.params.id, req.user!.id, parsed.data);

    // Broadcast config change so all room members update in real-time
    try {
      getIO().to(req.params.id).emit('room.configUpdated', {
        micConfig: room.micConfig,
        chatLocked: room.chatLocked,
        applyForMic: room.applyForMic,
        roomMode: room.roomMode,
        description: room.description,
        seats: (room.seats ?? []).map((s: any) => ({
          position: s.position,
          userId: s.userId,
          user: s.user ? serializeUserSummary(s.user) : null,
          isLocked: s.isLocked,
          isMuted: s.isMuted,
        })),
      });
    } catch { /* socket layer may be unavailable in tests */ }

    ok(res, room, 'Room updated');
  } catch (err) { next(err); }
}

export async function clearChat(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.clearRoomChat(req.params.id, req.user!.id);
    try {
      const io = getIO();
      io.to(req.params.id).emit('chat:cleared', { chatClearedAt: result.chatClearedAt });
    } catch { /* socket layer may be unavailable in tests */ }
    ok(res, result, 'Chat cleared');
  } catch (err) {
    next(err);
  }
}

const chatLockSchema = z.object({ locked: z.boolean() });

export async function toggleChatLock(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = chatLockSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const { room, systemMessage } = await service.toggleChatLock(
      req.params.id,
      req.user!.id,
      parsed.data.locked,
    );
    try {
      const io = getIO();
      io.to(req.params.id).emit('room.configUpdated', { chatLocked: room.chatLocked });
      io.to(req.params.id).emit('message.sent', systemMessage);
    } catch { /* socket layer may be unavailable in tests */ }
    ok(res, { chatLocked: room.chatLocked }, 'Chat lock updated');
  } catch (err) {
    next(err);
  }
}

export async function togglePublicMsg(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.togglePublicMsg(req.params.id, req.user!.id);
    try {
      const io = getIO();
      io.to(req.params.id).emit('room.configUpdated', { publicMsgEnabled: room.publicMsgEnabled });
    } catch { /* socket layer may be unavailable in tests */ }
    ok(res, { publicMsgEnabled: room.publicMsgEnabled }, 'Public message setting updated');
  } catch (err) {
    next(err);
  }
}

export async function startRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.startRoom(req.params.id, req.user!.id);
    ok(res, room, 'Room is now live');
  } catch (err) { next(err); }
}

export async function endRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.endRoom(req.params.id, req.user!.id);
    try { getIO().to(room.id).emit('room.ended', {}); } catch { /* socket may be unavailable */ }
    ok(res, room, 'Room ended');
  } catch (err) { next(err); }
}

export async function getSeats(req: Request, res: Response, next: NextFunction) {
  try {
    const seats = await service.getSeats(req.params.id);
    ok(res, seats);
  } catch (err) { next(err); }
}

function emitSeatUpdate(roomId: string, seat: {
  position: number;
  userId: string | null;
  user: { id: string; username: string | null; displayName: string; avatar: string } | null;
  isLocked: boolean;
  isMuted: boolean;
}) {
  try {
    getIO().to(roomId).emit('seat.updated', {
      position: seat.position,
      userId: seat.userId,
      user: seat.user,
      isLocked: seat.isLocked,
      isMuted: seat.isMuted,
    });
  } catch { /* socket layer may be unavailable in tests */ }
}

export async function takeSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const position = parseInt(req.params.pos, 10);
    if (isNaN(position)) { fail(res, 'Invalid seat position', 400); return; }
    const { seat, releasedPositions } = await service.takeSeat(req.params.id, position, req.user!.id);
    emitSeatUpdate(req.params.id, seat as any);
    for (const pos of releasedPositions) {
      emitSeatUpdate(req.params.id, {
        position: pos,
        userId: null,
        user: null,
        isLocked: false,
        isMuted: false,
      });
    }
    ok(res, seat, 'Seat taken');
  } catch (err) { next(err); }
}

export async function leaveSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const position = parseInt(req.params.pos, 10);
    if (isNaN(position)) { fail(res, 'Invalid seat position', 400); return; }
    const seat = await service.leaveSeat(req.params.id, position, req.user!.id);
    emitSeatUpdate(req.params.id, {
      position: seat.position,
      userId: null,
      user: null,
      isLocked: seat.isLocked,
      isMuted: false,
    });
    // Any mic exit ends the calculator session immediately and declares results.
    void calcService.endActiveSessionForRoom(req.params.id).catch(() => undefined);
    ok(res, seat, 'Left seat');
  } catch (err) { next(err); }
}

export async function lockSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const position = parseInt(req.params.pos, 10);
    if (isNaN(position)) { fail(res, 'Invalid seat position', 400); return; }
    const parsed = lockSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const seat = await service.lockSeat(req.params.id, position, req.user!.id, parsed.data.lock);
    emitSeatUpdate(req.params.id, seat as any);
    ok(res, seat, parsed.data.lock ? 'Seat locked' : 'Seat unlocked');
  } catch (err) { next(err); }
}

const inviteSchema = z.object({
  userId: z.string().uuid(),
  position: z.number().int().positive().optional(),
});

export async function inviteToSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }

    const result = await service.inviteToSeat(
      req.params.id,
      req.user!.id,
      parsed.data.userId,
      parsed.data.position,
    );

    const payload = {
      roomId: result.room.id,
      roomTitle: result.room.title,
      roomCode: result.room.roomCode,
      coverImage: result.room.coverImage,
      roomMode: result.room.roomMode === 'live' ? 'live' : 'chat',
      position: result.position,
      fromUser: result.fromUser,
    };

    try {
      getIO().to(`user:${result.target.id}`).emit('seat.invitation', payload);
    } catch { /* socket layer may be unavailable in tests */ }

    createNotification(
      result.target.id,
      'room_seat_invite',
      'Invitation to Seat',
      `${result.fromUser?.displayName ?? 'Someone'} invited you to seat ${result.position} in ${result.room.title}`,
      {
        roomId: result.room.id,
        position: result.position,
        fromUserId: req.user!.id,
        roomTitle: result.room.title,
        roomCode: result.room.roomCode ?? '',
        coverImage: result.room.coverImage ?? '',
        roomMode: result.room.roomMode === 'live' ? 'live' : 'chat',
        fromUserDisplayName: result.fromUser?.displayName ?? '',
        fromUserAvatar: result.fromUser?.avatar ?? '',
      },
      undefined,
      { highPriority: true },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: result.target.id,
      content: `${result.fromUser?.displayName ?? 'Someone'} invited you to seat ${result.position} in ${result.room.title}.`,
      messageType: 'room_seat_invite',
      skipRecipientNotify: true,
    }).catch(() => {});

    ok(res, payload, 'Invitation sent');
  } catch (err) { next(err); }
}

export async function getViewers(req: Request, res: Response, next: NextFunction) {
  try {
    const roomId = req.params.id;
    const io = getIO();
    const socketIds = [...(io.sockets.adapter.rooms.get(roomId) ?? [])];
    const userIds = Array.from(new Set(
      socketIds
        .map((sid) => io.sockets.sockets.get(sid)?.data?.userId as string | undefined)
        .filter((v): v is string => Boolean(v)),
    ));
    const [rawViewers, hiddenSettings] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: userSummarySelect() }),
      prisma.userSettings.findMany({ where: { userId: { in: userIds }, mysteryManLive: true }, select: { userId: true } }),
    ]);
    const hiddenIds = new Set(hiddenSettings.map((s) => s.userId));
    const viewers = rawViewers.map((v) => {
      const summary = serializeUserSummary(v);
      return hiddenIds.has(v.id)
        ? { id: v.id, displayName: 'Mystery', avatar: '', username: null, hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, ...emptyEquippedCosmetics() }
        : summary;
    });
    ok(res, { viewers, count: viewers.length });
  } catch (err) { next(err); }
}

// ── Room members (permanent joins) ────────────────────────────────────────────

export async function joinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    await service.joinRoom(req.params.id, req.user!.id);
    ok(res, null, 'Joined room');
  } catch (err) { next(err); }
}

export async function unjoinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    await service.unjoinRoom(req.params.id, req.user!.id);
    ok(res, null, 'Left room');
  } catch (err) { next(err); }
}

export async function listRoomMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const result = await service.listMembers(req.params.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function isRoomMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { isMember, isRoomAdmin } = await service.getMembershipForUser(req.params.id, req.user!.id);
    ok(res, { isMember, isRoomAdmin });
  } catch (err) { next(err); }
}

export async function kickFromSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const position = parseInt(req.params.pos, 10);
    if (isNaN(position)) { fail(res, 'Invalid seat position', 400); return; }
    const result = await service.kickFromSeat(req.params.id, position, req.user!.id);
    emitSeatUpdate(req.params.id, {
      position: result.position,
      userId: null,
      user: null,
      isLocked: result.isLocked,
      isMuted: false,
    });
    // Any mic drop ends the calculator session immediately and declares results.
    if (result.kickedUserId) {
      void calcService.endActiveSessionForRoom(req.params.id).catch(() => undefined);

      try {
        const io = getIO();
        const kickedSockets = [...(io.sockets.adapter.rooms.get(req.params.id) ?? [])]
          .map((sid) => io.sockets.sockets.get(sid))
          .filter((s) => s?.data?.userId === result.kickedUserId);
        for (const socket of kickedSockets) {
          socket?.emit('room:kicked', {
            roomId: req.params.id,
            reason: 'You have been kicked from this room.',
            cooldownMinutes: result.cooldownMinutes,
          });
          socket?.leave(req.params.id);
        }
      } catch { /* socket layer may be unavailable in tests */ }
    }
    ok(res, {
      ...result,
      cooldownMinutes: result.cooldownMinutes ?? 0,
      expiresAt: result.expiresAt ?? null,
    }, 'User kicked from seat');
  } catch (err) { next(err); }
}

export async function kickUserFromRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = kickUserSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }

    const result = await service.kickUserFromRoom(
      req.params.id,
      parsed.data.userId,
      req.user!.id,
      parsed.data.reason,
    );

    for (const seat of result.releasedSeats) {
      emitSeatUpdate(req.params.id, {
        position: seat.position,
        userId: null,
        user: null,
        isLocked: seat.isLocked,
        isMuted: false,
      });
    }

    // If the kicked user was on mic (releasedSeats), end calculator immediately.
    if (result.releasedSeats.length > 0) {
      void calcService.endActiveSessionForRoom(req.params.id).catch(() => undefined);
    }

    try {
      const io = getIO();
      const kickedSockets = [...(io.sockets.adapter.rooms.get(req.params.id) ?? [])]
        .map((sid) => io.sockets.sockets.get(sid))
        .filter((s) => s?.data?.userId === result.kickedUserId);
      for (const socket of kickedSockets) {
        socket?.emit('room:kicked', {
          roomId: req.params.id,
          reason: 'You have been kicked from this room.',
          cooldownMinutes: result.cooldownMinutes,
        });
        socket?.leave(req.params.id);
      }
    } catch { /* socket layer may be unavailable in tests */ }

    ok(res, {
      kickedUserId: result.kickedUserId,
      cooldownMinutes: result.cooldownMinutes,
      expiresAt: result.expiresAt,
    }, 'User kicked from room');
  } catch (err) { next(err); }
}

export async function uploadCover(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { fail(res, 'No file uploaded', 400); return; }
    const filename = `room-covers/room-${req.params.id}-${storageFilename(req.file.originalname)}`;
    const coverUrl = await uploadToStorage(req.file.buffer, filename, req.file.mimetype, undefined, undefined, {
      resize: { maxDim: 1080, format: 'jpeg', quality: 78 },
      cacheControl: '2592000',
    });
    const room = await service.updateRoom(req.params.id, req.user!.id, { coverImage: coverUrl });
    ok(res, { coverImage: room.coverImage, room }, 'Room cover updated');
  } catch (err) { next(err); }
}

// ── Room Admins ───────────────────────────────────────────────────────────────

export async function listRoomAdmins(req: Request, res: Response, next: NextFunction) {
  try {
    const admins = await service.listRoomAdmins(req.params.id);
    ok(res, admins);
  } catch (err) { next(err); }
}

export async function addRoomAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = adminSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const admin = await service.addRoomAdmin(req.params.id, req.user!.id, parsed.data.userId);
    created(res, admin, 'Admin added');
  } catch (err) { next(err); }
}

export async function removeRoomAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    await service.removeRoomAdmin(req.params.id, req.user!.id, req.params.userId);
    ok(res, null, 'Admin removed');
  } catch (err) { next(err); }
}

// ── Room stats ────────────────────────────────────────────────────────────────

const statsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function getRoomStats(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = statsQuerySchema.safeParse(req.query);
    if (!parsed.success) { fail(res, 'Invalid date (YYYY-MM-DD)', 400); return; }
    const stats = await service.getRoomStats(req.params.id, req.user?.id, parsed.data.date);
    ok(res, stats);
  } catch (err) { next(err); }
}

// ── Room contribution ranking ─────────────────────────────────────────────────

export async function getContributions(req: Request, res: Response, next: NextFunction) {
  try {
    const { period } = z.object({
      period: z.enum(['all', 'daily', 'weekly', 'monthly']).default('all'),
    }).parse(req.query);
    const data = await service.getRoomContributions(req.params.id, period);
    ok(res, data);
  } catch (err) { next(err); }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function serializeTheme(theme: {
  id: string; name: string; gradientFrom: string; gradientTo: string;
  backgroundImageUrl: string | null; svgaUrl: string | null;
  accentColor: string; chatBubbleColor: string;
}) {
  return {
    id: theme.id,
    name: theme.name,
    gradientFrom: theme.gradientFrom,
    gradientTo: theme.gradientTo,
    backgroundImageUrl: theme.backgroundImageUrl,
    svgaUrl: theme.svgaUrl,
    accentColor: theme.accentColor,
    chatBubbleColor: theme.chatBubbleColor,
  };
}

export async function applyTheme(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z.object({ themeId: z.string() }).safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const theme = await service.applyTheme(req.params.id, req.user!.id, parsed.data.themeId);
    try {
      getIO().to(req.params.id).emit('room:theme_changed', {
        themeId: theme.id,
        theme: serializeTheme(theme),
      });
    } catch {}
    ok(res, { theme: serializeTheme(theme) });
  } catch (err) { next(err); }
}

export async function resetTheme(req: Request, res: Response, next: NextFunction) {
  try {
    await service.resetTheme(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('room:theme_changed', { themeId: null, theme: null });
    } catch {}
    ok(res, null, 'Theme reset');
  } catch (err) { next(err); }
}

// ── Agora RTC Token ───────────────────────────────────────────────────────────

const tokenQuerySchema = z.object({
  role: z.enum(['publisher', 'subscriber']).default('publisher'),
});

export async function getToken(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.getRoomById(req.params.id, req.user!.id);
    if (room.status === 'ended') { fail(res, 'Room has ended', 400); return; }
    if (await agoraService.isChannelRevoked(room.agoraChannel)) {
      fail(res, 'This room has been closed by an administrator', 403);
      return;
    }

    const { role } = tokenQuerySchema.parse(req.query);
    if (role === 'publisher') {
      const u = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { isHostBanned: true },
      });
      if (u?.isHostBanned) { fail(res, 'You are not allowed to host rooms.', 403); return; }
    }
    const uid = await agoraService.getOrAssignUid(req.user!.id, room.agoraChannel);
    const result = agoraService.generateRtcToken(room.agoraChannel, uid, role);
    ok(res, result);
  } catch (err) { next(err); }
}

// ── Calculator ────────────────────────────────────────────────────────────────

const startCalcSchema = z.object({
  durationSeconds: z.number().int().positive().nullable(),
});

export async function startCalculator(req: Request, res: Response, next: NextFunction) {
  try {
    const { durationSeconds } = startCalcSchema.parse(req.body);
    const session = await calcService.startSession(req.params.id, req.user!.id, durationSeconds);
    created(res, session);
  } catch (err) { next(err); }
}

export async function endCalculator(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await calcService.endSessionByRoomId(req.params.id, req.user!.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getCalculator(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await calcService.getActiveSession(req.params.id);
    ok(res, data);
  } catch (err) { next(err); }
}

export async function getCalculatorContributors(req: Request, res: Response, next: NextFunction) {
  try {
    const contributors = await calcService.getContributors(req.params.id);
    ok(res, contributors);
  } catch (err) { next(err); }
}

export async function getCalculatorRecipientContributors(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await calcService.getRecipientContributors(req.params.id, req.params.userId);
    ok(res, data);
  } catch (err) { next(err); }
}

function emitMusicChanged(roomId: string, track: { id: string; name: string; url: string; index: number; total: number }) {
  getIO().to(roomId).emit('music:changed', {
    url: track.url,
    name: track.name,
    trackId: track.id,
    index: track.index,
    total: track.total,
    roomId,
  });
}

export async function getMusicQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getMusicQueue(req.params.id, req.user!.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function addMusicTrack(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { fail(res, 'No audio file uploaded', 400); return; }
    const filename = `room-music/room-${req.params.id}-${storageFilename(req.file.originalname)}`;
    const url = await uploadToStorage(req.file.buffer, filename, req.file.mimetype, undefined, undefined, {
      cacheControl: '31536000',
      immutable: true,
    });
    const name = req.file.originalname?.trim() || 'Untitled';
    const track = await service.addMusicTrack(req.params.id, req.user!.id, url, name);
    const queue = await service.getMusicQueue(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('music:queue:updated', { tracks: queue.tracks });
      if (queue.tracks.length === 1) {
        emitMusicChanged(req.params.id, {
          url: track.url,
          name: track.name,
          id: track.id,
          index: 0,
          total: 1,
        });
      }
    } catch {}
    ok(res, { track, queue }, 'Track added');
  } catch (err) { next(err); }
}

export async function addFromLibrary(req: Request, res: Response, next: NextFunction) {
  try {
    const { libraryTrackId, playNow } = req.body as { libraryTrackId: string; playNow?: boolean };
    if (!libraryTrackId) { fail(res, 'libraryTrackId is required', 400); return; }
    const track = await service.addMusicFromLibrary(
      req.params.id,
      req.user!.id,
      libraryTrackId,
      playNow === true,
    );
    const queue = await service.getMusicQueue(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('music:queue:updated', { tracks: queue.tracks });
      if (track.playNow) {
        emitMusicChanged(req.params.id, {
          url: track.url,
          name: track.name,
          id: track.id,
          index: track.index,
          total: track.total,
        });
      }
    } catch {}
    ok(res, { track, queue }, playNow ? 'Track playing' : 'Track added to queue');
  } catch (err) { next(err); }
}

export async function removeMusicTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const nextTrack = await service.removeMusicTrack(req.params.id, req.params.trackId, req.user!.id);
    const queue = await service.getMusicQueue(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('music:queue:updated', { tracks: queue.tracks });
      if (nextTrack) {
        emitMusicChanged(req.params.id, {
          url: nextTrack.url,
          name: nextTrack.name,
          id: nextTrack.id,
          index: queue.currentIndex,
          total: queue.tracks.length,
        });
      } else {
        getIO().to(req.params.id).emit('music:stopped', { roomId: req.params.id });
      }
    } catch {}
    ok(res, { queue }, 'Track removed');
  } catch (err) { next(err); }
}

export async function reorderMusicQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { positions } = req.body as { positions: Array<{ id: string; position: number }> };
    if (!Array.isArray(positions)) { fail(res, 'positions must be an array', 400); return; }
    const tracks = await service.reorderMusicQueue(req.params.id, req.user!.id, positions);
    try { getIO().to(req.params.id).emit('music:queue:updated', { tracks }); } catch {}
    ok(res, { tracks }, 'Queue reordered');
  } catch (err) { next(err); }
}

export async function skipMusicTrack(req: Request, res: Response, next: NextFunction) {
  try {
    const { direction } = req.body as { direction: 'next' | 'prev' };
    if (direction !== 'next' && direction !== 'prev') {
      fail(res, 'direction must be "next" or "prev"', 400);
      return;
    }
    const next = await service.skipMusicTrack(req.params.id, req.user!.id, direction);
    try {
      if (next) {
        emitMusicChanged(req.params.id, {
          url: next.url,
          name: next.name,
          id: next.id,
          index: next.index,
          total: next.total,
        });
      } else {
        getIO().to(req.params.id).emit('music:stopped', { roomId: req.params.id });
      }
    } catch {}
    ok(res, next ? { track: next } : { track: null }, 'Skipped');
  } catch (err) { next(err); }
}

export async function setMusicLoop(req: Request, res: Response, next: NextFunction) {
  try {
    const { loop } = req.body as { loop: boolean };
    if (typeof loop !== 'boolean') { fail(res, 'loop must be a boolean', 400); return; }
    await service.setMusicLoop(req.params.id, req.user!.id, loop);
    ok(res, { loop }, 'Loop updated');
  } catch (err) { next(err); }
}

/** Legacy — append track via POST /rooms/:id/music */
export async function setMusic(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { fail(res, 'No audio file uploaded', 400); return; }
    const filename = `room-music/room-${req.params.id}-${storageFilename(req.file.originalname)}`;
    const musicUrl = await uploadToStorage(req.file.buffer, filename, req.file.mimetype, undefined, undefined, {
      cacheControl: '31536000',
      immutable: true,
    });
    const name = req.file.originalname?.trim() || 'Untitled';
    const track = await service.addMusicTrack(req.params.id, req.user!.id, musicUrl, name);
    const queue = await service.getMusicQueue(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('music:queue:updated', { tracks: queue.tracks });
      if (queue.tracks.length === 1) {
        emitMusicChanged(req.params.id, {
          url: track.url,
          name: track.name,
          id: track.id,
          index: 0,
          total: 1,
        });
      }
    } catch {}
    ok(res, { bgMusicUrl: track.url, track, queue }, 'Music set');
  } catch (err) { next(err); }
}

/** Legacy — clear entire queue via DELETE /rooms/:id/music */
export async function clearMusic(req: Request, res: Response, next: NextFunction) {
  try {
    await service.clearRoomMusic(req.params.id, req.user!.id);
    try {
      getIO().to(req.params.id).emit('music:queue:updated', { tracks: [] });
      getIO().to(req.params.id).emit('music:stopped', { roomId: req.params.id });
    } catch {}
    ok(res, { bgMusicUrl: null }, 'Music cleared');
  } catch (err) { next(err); }
}

export async function toggleHdMic(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await service.toggleHdMic(req.params.id, req.user!.id);
    try { getIO().to(req.params.id).emit('mic:hd_changed', { hdMicEnabled: room.hdMicEnabled, roomId: req.params.id }); } catch {}
    ok(res, { hdMicEnabled: room.hdMicEnabled }, 'HD mic setting updated');
  } catch (err) { next(err); }
}

/** GET seat-application queue (Redis). Host or room admin only. */
export async function listSeatApplicants(req: Request, res: Response, next: NextFunction) {
  try {
    const applicants = await service.listSeatApplicantsForManagers(req.params.id, req.user!.id);
    ok(res, { applicants });
  } catch (err) { next(err); }
}
