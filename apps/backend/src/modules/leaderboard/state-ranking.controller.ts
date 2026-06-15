import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import { prisma } from '../../config/prisma';
import {
  canInspectAllStateRankings,
  getMyHostRankInState,
  getMyStateRankingRow,
  getPublicStateConfig,
  getStateRankingConfig,
  getStateRankingSummary,
  listStateHosts,
  listStateRankings,
  resolveCountryCodeForRequest,
  suggestStateFromCoords,
} from './state-ranking.service';
import { dailyDateKey } from './state-ranking-keys';
import { isValidStateForCountry, normalizeCountryCode } from './state-ranking.constants';

const dateQuerySchema = z.object({
  period: z.enum(['daily']).default('daily'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  countryCode: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function loadUserForGate(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      country: true,
      state: true,
      role: true,
      gender: true,
      faceVerificationStatus: true,
    },
  });
}

export async function requireStateRankingAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const inspector = await canInspectAllStateRankings(userId);
    if (inspector) {
      next();
      return;
    }
    const config = await getStateRankingConfig();
    if (!config.requireFaceVerification) {
      next();
      return;
    }
    const user = await loadUserForGate(userId);
    if (user?.faceVerificationStatus === 'approved') {
      next();
      return;
    }
    throw new AppError('Face verification required to view state rankings', 403);
  } catch (err) {
    next(err);
  }
}

export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const { countryCode: requested } = dateQuerySchema.parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = await resolveCountryCodeForRequest(
      user.id,
      user.country,
      requested,
    );
    const rankingConfig = await getStateRankingConfig();
    ok(res, {
      ...getPublicStateConfig(countryCode),
      requireFaceVerification: rankingConfig.requireFaceVerification,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRewardsConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getStateRankingConfig();
    ok(res, {
      hostSplitPercentages: config.hostSplitPercentages,
      stateRankTiers: config.stateRankTiers,
      topHostsPerState: config.topHostsPerState,
    });
  } catch (err) {
    next(err);
  }
}

export async function getStates(req: Request, res: Response, next: NextFunction) {
  try {
    const { date, countryCode: requested } = dateQuerySchema.parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = await resolveCountryCodeForRequest(
      user.id,
      user.country,
      requested,
    );
    const dateKey = date ?? dailyDateKey();
    const items = await listStateRankings(countryCode, dateKey, 5);
    ok(res, { items, dateKey, countryCode });
  } catch (err) {
    next(err);
  }
}

export async function getStatesSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { date, countryCode: requested } = dateQuerySchema.parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = await resolveCountryCodeForRequest(
      user.id,
      user.country,
      requested,
    );
    const dateKey = date ?? dailyDateKey();
    const summary = await getStateRankingSummary(countryCode, dateKey);
    ok(res, summary);
  } catch (err) {
    next(err);
  }
}

export async function getStateHosts(req: Request, res: Response, next: NextFunction) {
  try {
    const { date, countryCode: requested } = dateQuerySchema.parse(req.query);
    const { page, limit } = paginationSchema.parse(req.query);
    const stateCode = req.params.stateCode;
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = await resolveCountryCodeForRequest(
      user.id,
      user.country,
      requested,
    );
    if (!isValidStateForCountry(countryCode, stateCode)) {
      throw new AppError('Invalid state for country', 400);
    }
    const dateKey = date ?? dailyDateKey();
    const data = await listStateHosts(countryCode, stateCode, dateKey, page, limit);
    ok(res, { ...data, stateCode, countryCode, dateKey });
  } catch (err) {
    next(err);
  }
}

export async function getMyState(req: Request, res: Response, next: NextFunction) {
  try {
    const { date } = dateQuerySchema.parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = normalizeCountryCode(user.country);
    const dateKey = date ?? dailyDateKey();
    if (!user.state.trim()) {
      ok(res, { row: null, hasState: false });
      return;
    }
    const row = await getMyStateRankingRow(user.id, countryCode, user.state, dateKey);
    ok(res, { row, hasState: true, countryCode, dateKey });
  } catch (err) {
    next(err);
  }
}

export async function getMyHostRank(req: Request, res: Response, next: NextFunction) {
  try {
    const { date } = dateQuerySchema.parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = normalizeCountryCode(user.country);
    const dateKey = date ?? dailyDateKey();
    if (!user.state.trim()) {
      ok(res, { rank: null, score: null, eligible: false });
      return;
    }
    const data = await getMyHostRankInState(user.id, countryCode, user.state, dateKey);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getSuggestState(req: Request, res: Response, next: NextFunction) {
  try {
    const { lat, lng } = z
      .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
      })
      .parse(req.query);
    const user = await loadUserForGate(req.user!.id);
    if (!user) throw new AppError('User not found', 404);
    const countryCode = normalizeCountryCode(user.country);
    const suggestion = await suggestStateFromCoords(countryCode, lat, lng);
    ok(res, suggestion);
  } catch (err) {
    next(err);
  }
}

export async function getCanInspect(req: Request, res: Response, next: NextFunction) {
  try {
    const canInspect = await canInspectAllStateRankings(req.user!.id);
    ok(res, { canInspectStateRankings: canInspect });
  } catch (err) {
    next(err);
  }
}
