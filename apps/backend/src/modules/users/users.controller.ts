import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './users.service';
import { ok, fail } from '../../utils/response';

const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const searchSchema = paginationSchema.extend({
  q: z.string().min(1, 'Search query required'),
});

/** GET /api/v1/users/search */
export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const { q, page, limit } = parsed.data;
    const result = await service.searchUsers(q, req.user?.id ?? null, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

/** GET /api/v1/users/me/special-attention */
export async function getSpecialAttentionList(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await service.getSpecialAttentionList(req.user!.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

/** GET /api/v1/users/me/visitors */
export async function getMyVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await service.getMyVisitors(req.user!.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(500).default(50),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/v1/users/nearby */
export async function getNearby(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = nearbySchema.safeParse(req.query);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const { lat, lng, radiusKm, limit } = parsed.data;
    const items = await service.getNearbyUsers(req.user?.id ?? null, lat, lng, radiusKm, limit);
    ok(res, { items });
  } catch (err) { next(err); }
}

/** GET /api/v1/users/:id */
export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getProfile(req.params.id, req.user?.id ?? null);
    ok(res, result);
  } catch (err) { next(err); }
}

/** POST /api/v1/users/:id/follow */
export async function followUser(req: Request, res: Response, next: NextFunction) {
  try {
    await service.followUser(req.user!.id, req.params.id);
    ok(res, null, 'Followed successfully');
  } catch (err) { next(err); }
}

/** DELETE /api/v1/users/:id/follow */
export async function unfollowUser(req: Request, res: Response, next: NextFunction) {
  try {
    await service.unfollowUser(req.user!.id, req.params.id);
    ok(res, null, 'Unfollowed successfully');
  } catch (err) { next(err); }
}

/** GET /api/v1/users/:id/followers */
export async function getFollowers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await service.getFollowers(req.params.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

/** GET /api/v1/users/:id/friends */
export async function getFriends(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await service.getFriends(req.params.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

/** GET /api/v1/users/:id/following */
export async function getFollowing(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await service.getFollowing(req.params.id, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}

/** POST /api/v1/users/:id/special-attention */
export async function addSpecialAttention(req: Request, res: Response, next: NextFunction) {
  try {
    await service.addSpecialAttention(req.user!.id, req.params.id);
    ok(res, null, 'Added to special attention');
  } catch (err) { next(err); }
}

/** DELETE /api/v1/users/:id/special-attention */
export async function removeSpecialAttention(req: Request, res: Response, next: NextFunction) {
  try {
    await service.removeSpecialAttention(req.user!.id, req.params.id);
    ok(res, null, 'Removed from special attention');
  } catch (err) { next(err); }
}

/** GET /api/v1/users/:id/presence */
export async function getPresence(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getPresence(req.params.id, req.user?.id ?? null);
    ok(res, result);
  } catch (err) { next(err); }
}

/** POST /api/v1/users/:id/visit */
export async function logVisit(req: Request, res: Response, next: NextFunction) {
  try {
    await service.logVisit(req.user!.id, req.params.id);
    ok(res, null);
  } catch (err) { next(err); }
}
