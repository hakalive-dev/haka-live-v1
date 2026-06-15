/**
 * Admin-seeded "house" ranking entries (see specs/ranking-house-entries.md).
 *
 * Company-owned accounts placed into a ranking at a chosen income to raise the competitive
 * bar. They are merged into rankings at READ time (real Redis/DB scores stay untouched) and
 * are NEVER paid by reward settlement. Temporary — deactivating an entry removes it instantly.
 */
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import {
  isValidStateForCountry,
  normalizeCountryCode,
} from './state-ranking.constants';

export type HouseBoard = 'agent' | 'creator' | 'state';
export const HOUSE_BOARDS: readonly HouseBoard[] = ['agent', 'creator', 'state'];

export function isHouseBoard(board: string): board is HouseBoard {
  return (HOUSE_BOARDS as readonly string[]).includes(board);
}

export type ScoredEntry = { userId: string; score: number };
export type RankedEntry = { userId: string; score: number; rank: number; isHouse: boolean };

/**
 * Merge house entries into a real top-N list, re-sort by score desc, and re-rank from 1.
 * A house account that also has a real score keeps `max(income, realScore)` so injecting can
 * never *lower* a real standing. Pure + deterministic → unit-tested.
 */
export function mergeAndRank(
  real: ScoredEntry[],
  house: Array<{ userId: string; income: number }>,
  limit: number,
): { entries: RankedEntry[]; houseIds: Set<string> } {
  const houseIncome = new Map(house.map((h) => [h.userId, h.income]));
  const merged = new Map<string, { userId: string; score: number; isHouse: boolean }>();

  for (const r of real) {
    const inc = houseIncome.get(r.userId);
    merged.set(r.userId, {
      userId: r.userId,
      score: inc != null ? Math.max(inc, r.score) : r.score,
      isHouse: inc != null,
    });
  }
  for (const [userId, income] of houseIncome) {
    if (!merged.has(userId)) merged.set(userId, { userId, score: income, isHouse: true });
  }

  const entries = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { entries, houseIds: new Set(houseIncome.keys()) };
}

/** Active {userId, income} house entries for a board (used by read + settlement merges). */
export async function getActiveHouseEntries(board: HouseBoard): Promise<Array<{ userId: string; income: number }>> {
  const rows = await prisma.rankingHouseEntry.findMany({
    where: { board, active: true },
    select: { userId: true, income: true },
  });
  return rows.map((r) => ({ userId: r.userId, income: r.income }));
}

/**
 * Active 'state' house entries with the host's state resolved from their profile. The State
 * board is two-level (states ranked by total; hosts ranked within a state), so a house host's
 * income both rolls into its state's total and ranks it among that state's hosts.
 */
export async function getActiveStateHouseHosts(): Promise<
  Array<{ userId: string; income: number; stateCode: string }>
> {
  const rows = await prisma.rankingHouseEntry.findMany({
    where: { board: 'state', active: true },
    select: { userId: true, income: true, user: { select: { state: true } } },
  });
  return rows
    .map((r) => ({ userId: r.userId, income: r.income, stateCode: (r.user.state ?? '').trim().toUpperCase() }))
    .filter((r) => r.stateCode.length > 0);
}

/**
 * Add house incomes to real state totals and re-sort desc. Unlike host-level merge (max),
 * a host's income *adds* to its state's total (it's one contributor among many). Pure.
 */
export function mergeStateTotals(
  real: Array<{ stateCode: string; score: number }>,
  houseByState: Map<string, number>,
): Array<{ stateCode: string; score: number }> {
  const totals = new Map(real.map((r) => [r.stateCode, r.score]));
  for (const [stateCode, add] of houseByState) {
    totals.set(stateCode, (totals.get(stateCode) ?? 0) + add);
  }
  return [...totals.entries()]
    .map(([stateCode, score]) => ({ stateCode, score }))
    .sort((a, b) => b.score - a.score);
}

/** Group house hosts by state into a {stateCode → summed income} map (for totals merge). */
export function houseIncomeByState(
  hosts: Array<{ income: number; stateCode: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of hosts) map.set(h.stateCode, (map.get(h.stateCode) ?? 0) + h.income);
  return map;
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

/** Resolve a house-entry account — must be an existing female host. */
async function resolveHouseUserId(idOrHaka: string): Promise<string> {
  const value = idOrHaka.trim();
  if (!value) throw new AppError('Select a female host', 400);
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: value }, { hakaId: value }] },
    select: { id: true, role: true, gender: true },
  });
  if (!user) throw new AppError('No user found for that id', 404);
  if (user.role !== 'host') {
    throw new AppError('House entries must use a host account', 400);
  }
  if (user.gender !== 'female') {
    throw new AppError('House entries must use a female host account', 400);
  }
  return user.id;
}

export async function listHouseEntries(board: HouseBoard) {
  return prisma.rankingHouseEntry.findMany({
    where: { board },
    orderBy: { income: 'desc' },
    include: {
      user: { select: { id: true, displayName: true, hakaId: true, state: true, country: true } },
    },
  });
}

export async function upsertHouseEntry(opts: {
  board: HouseBoard;
  idOrHaka: string;
  income: number;
  note?: string;
  createdBy: string;
}) {
  if (!Number.isFinite(opts.income) || opts.income < 0) {
    throw new AppError('Income must be a non-negative number', 400);
  }
  const userId = await resolveHouseUserId(opts.idOrHaka);
  if (opts.board === 'state') {
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: { state: true, country: true },
    });
    const stateCode = (profile?.state ?? '').trim().toUpperCase();
    const country = normalizeCountryCode(profile?.country ?? '');
    if (!stateCode) {
      throw new AppError(
        'House account must have a profile state set before it can appear on State Ranking',
        400,
      );
    }
    if (!isValidStateForCountry(country, stateCode)) {
      throw new AppError(
        `Profile state "${stateCode}" is not valid for country ${country || 'unknown'}`,
        400,
      );
    }
  }
  const income = Math.floor(opts.income);
  return prisma.rankingHouseEntry.upsert({
    where: { board_userId: { board: opts.board, userId } },
    create: { board: opts.board, userId, income, note: opts.note ?? '', createdBy: opts.createdBy },
    update: { income, ...(opts.note !== undefined ? { note: opts.note } : {}), active: true },
    include: {
      user: { select: { id: true, displayName: true, hakaId: true, state: true, country: true } },
    },
  });
}

export async function setHouseEntryActive(id: string, active: boolean) {
  return prisma.rankingHouseEntry.update({ where: { id }, data: { active } });
}

export async function deleteHouseEntry(id: string) {
  await prisma.rankingHouseEntry.delete({ where: { id } });
}
