import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListGamesParams {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CreateGameData {
  name: string;
  description?: string;
  imageUrl?: string;
  apiEndpoint?: string;
  apiKey?: string;
  rtpPercent?: number;
}

export interface UpdateGameData {
  name?: string;
  description?: string;
  imageUrl?: string;
  apiEndpoint?: string;
  apiKey?: string;
  rtpPercent?: number;
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listGames(params: ListGamesParams) {
  const { page, limit, search, isActive, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.GameWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (isActive !== undefined) where.isActive = isActive;

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
    }),
    prisma.game.count({ where }),
  ]);

  return {
    games,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getGameDetail(gameId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);
  return game;
}

export async function createGame(adminId: string, data: CreateGameData, ipAddress?: string) {
  const game = await prisma.game.create({
    data: {
      name: data.name,
      description: data.description ?? '',
      imageUrl: data.imageUrl ?? '',
      apiEndpoint: data.apiEndpoint ?? '',
      apiKey: data.apiKey ?? '',
      rtpPercent: data.rtpPercent ?? 95.00,
    },
  });

  await logAdminAction(adminId, 'game.create', 'Game', game.id, { name: game.name }, ipAddress);
  return game;
}

export async function updateGame(adminId: string, gameId: string, data: UpdateGameData, ipAddress?: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.apiEndpoint !== undefined && { apiEndpoint: data.apiEndpoint }),
      ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
      ...(data.rtpPercent !== undefined && { rtpPercent: data.rtpPercent }),
    },
  });

  await logAdminAction(adminId, 'game.update', 'Game', gameId, { fields: Object.keys(data) }, ipAddress);
  return updated;
}

export async function deleteGame(adminId: string, gameId: string, ipAddress?: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);

  await logAdminAction(adminId, 'game.delete', 'Game', gameId, { name: game.name }, ipAddress);
  await prisma.game.delete({ where: { id: gameId } });
  return { message: `Game "${game.name}" deleted` };
}

export async function toggleGameStatus(adminId: string, gameId: string, isActive: boolean, ipAddress?: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);

  const updated = await prisma.game.update({ where: { id: gameId }, data: { isActive } });
  const action = isActive ? 'game.activate' : 'game.deactivate';
  await logAdminAction(adminId, action, 'Game', gameId, { name: game.name }, ipAddress);
  return updated;
}

export async function pingGameApi(adminId: string, gameId: string, ipAddress?: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);
  if (!game.apiEndpoint) throw new AppError('Game has no API endpoint configured', 400);

  let pingOk = false;
  let pingMs = 0;
  let errorMessage = '';

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(game.apiEndpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: game.apiKey ? { Authorization: `Bearer ${game.apiKey}` } : {},
    });
    clearTimeout(timeout);
    pingMs = Date.now() - start;
    pingOk = response.ok;
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (err: any) {
    errorMessage = err?.name === 'AbortError' ? 'Timeout (5s)' : (err?.message || 'Connection failed');
  }

  await prisma.game.update({
    where: { id: gameId },
    data: { lastPingAt: new Date(), lastPingOk: pingOk },
  });

  await logAdminAction(adminId, 'game.ping', 'Game', gameId, { pingOk, pingMs, errorMessage }, ipAddress);

  return { pingOk, pingMs, errorMessage, lastPingAt: new Date() };
}

export async function updateGameRevenue(
  gameId: string,
  revenueDelta: number,
  betsDelta: number,
) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError('Game not found', 404);

  return prisma.game.update({
    where: { id: gameId },
    data: {
      totalRevenue: { increment: revenueDelta },
      totalBets: { increment: betsDelta },
    },
  });
}
