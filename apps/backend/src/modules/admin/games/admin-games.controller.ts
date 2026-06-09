import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as gamesService from './admin-games.service';
import { ok } from '../../../utils/response';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
  search:   z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort:     z.enum(['createdAt', 'name', 'totalRevenue', 'totalBets']).default('createdAt'),
  order:    z.enum(['asc', 'desc']).default('desc'),
});

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl:    z.string().url().optional().or(z.literal('')),
  apiEndpoint: z.string().url().optional().or(z.literal('')),
  apiKey:      z.string().max(500).optional(),
  rtpPercent:  z.number().min(0).max(100).optional(),
});

const updateSchema = createSchema.partial();

const toggleSchema = z.object({
  isActive: z.boolean(),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function listGames(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await gamesService.listGames(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getGameDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const game = await gamesService.getGameDetail(req.params.id);
    ok(res, game);
  } catch (err) { next(err); }
}

export async function createGame(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    const game = await gamesService.createGame(req.admin!.id, data, req.ip);
    ok(res, game);
  } catch (err) { next(err); }
}

export async function updateGame(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const game = await gamesService.updateGame(req.admin!.id, req.params.id, data, req.ip);
    ok(res, game);
  } catch (err) { next(err); }
}

export async function deleteGame(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await gamesService.deleteGame(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function toggleGameStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = toggleSchema.parse(req.body);
    const game = await gamesService.toggleGameStatus(req.admin!.id, req.params.id, isActive, req.ip);
    ok(res, game);
  } catch (err) { next(err); }
}

export async function pingGameApi(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await gamesService.pingGameApi(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}
