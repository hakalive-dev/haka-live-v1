import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as roomsService from './admin-rooms.service';
import * as pinService from './admin-room-pin.service';
import { ok } from '../../../utils/response';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function listRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await roomsService.listRooms(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getRoomDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomsService.getRoomDetail(req.params.id);
    ok(res, room);
  } catch (err) { next(err); }
}

const updateSchema = z.object({
  title:       z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  coverImage:  z.string().url().optional().or(z.literal('')),
  category:    z.enum(['general', 'music', 'talk', 'gaming', 'dating', 'education']).optional(),
});

export async function updateRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const room = await roomsService.updateRoom(req.admin!.id, req.params.id, data, req.ip);
    ok(res, room);
  } catch (err) { next(err); }
}

export async function deleteRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await roomsService.deleteRoom(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getRoomMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }).parse(req.query);
    const result = await roomsService.getRoomMessages(req.params.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function forceEndRoom(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await roomsService.forceEndRoom(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

export async function getViewers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }).parse(req.query);
    ok(res, await roomsService.getRoomViewers(req.params.id, page, limit));
  } catch (err) { next(err); }
}

const kickSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export async function kickUserFromRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const body = kickSchema.parse(req.body);
    ok(res, await roomsService.kickUserFromRoom(req.admin!.id, req.params.id, body.userId, body.reason, req.ip));
  } catch (err) { next(err); }
}

const booleanStateSchema = z.object({ value: z.boolean() });

export async function setSeatLock(req: Request, res: Response, next: NextFunction) {
  try {
    const { value } = booleanStateSchema.parse(req.body);
    const pos = z.coerce.number().int().positive().parse(req.params.pos);
    ok(res, await roomsService.setSeatLock(req.admin!.id, req.params.id, pos, value, req.ip));
  } catch (err) { next(err); }
}

export async function setSeatMute(req: Request, res: Response, next: NextFunction) {
  try {
    const { value } = booleanStateSchema.parse(req.body);
    const pos = z.coerce.number().int().positive().parse(req.params.pos);
    ok(res, await roomsService.setSeatMute(req.admin!.id, req.params.id, pos, value, req.ip));
  } catch (err) { next(err); }
}

export async function kickFromSeat(req: Request, res: Response, next: NextFunction) {
  try {
    const pos = z.coerce.number().int().positive().parse(req.params.pos);
    ok(res, await roomsService.kickFromSeat(req.admin!.id, req.params.id, pos, req.ip));
  } catch (err) { next(err); }
}

export async function listBans(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }).parse(req.query);
    ok(res, await roomsService.listRoomBans(req.params.id, page, limit));
  } catch (err) { next(err); }
}

const createBanSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(300).optional(),
  durationHours: z.coerce.number().int().positive().optional(),
});

export async function createBan(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await roomsService.createRoomBan(req.admin!.id, req.params.id, createBanSchema.parse(req.body), req.ip));
  } catch (err) { next(err); }
}

export async function deleteBan(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await roomsService.deleteRoomBan(req.admin!.id, req.params.id, req.params.banId, req.ip));
  } catch (err) { next(err); }
}

// ── Reset endpoints ────────────────────────────────────────────────────────────

export async function resetRoomCover(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await roomsService.resetRoomCover(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

export async function resetRoomAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await roomsService.resetRoomAnnouncement(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

// ── Room Pin endpoints ────────────────────────────────────────────────────────

const pinSchema = z.object({
  duration: z.enum(['2h', '1d', '3d', '5d', '7d', 'permanent']).default('1d'),
  reason: z.string().max(300).default(''),
  expiresAt: z.string().datetime().optional(), // custom expiry overrides duration
});

export async function pinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { duration, reason } = pinSchema.parse(req.body);
    ok(res, await pinService.pinRoom(req.admin!.id, req.params.id, duration, reason, req.ip));
  } catch (err) { next(err); }
}

export async function unpinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await pinService.unpinRoom(req.admin!.id, req.params.id, req.ip));
  } catch (err) { next(err); }
}

export async function listPinnedRooms(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await pinService.listPinnedRooms());
  } catch (err) { next(err); }
}

export async function getRoomPinStatus(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await pinService.getRoomPinStatus(req.params.id));
  } catch (err) { next(err); }
}
