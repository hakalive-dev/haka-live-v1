import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

/** Matches `distributeBeans`: host-side beans from total gift bean value. */
export function hostBeansFromGiftBeanValue(totalBeanValue: number): number {
  return Math.floor(totalBeanValue * 0.7);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling window for gift-bonus tier lookup (sliding). */
export const GIFT_BONUS_ROLLING_DAYS = 7;

/** Rolling window for agency commission % tier lookup (sliding). */
export const COMMISSION_ROLLING_DAYS = 30;

export interface RollingIncomeParams {
  agencyId: string;
  agentOwnerId: string;
  /** Upper bound for the rolling window (exclusive of gifts after this instant). */
  windowEnd: Date;
  /** Exclude this transaction when computing PRE-update income inside `distributeBeans`. */
  excludeGiftTransactionId?: string | null;
  /**
   * Sliding window length in days. Default: {@link GIFT_BONUS_ROLLING_DAYS} (7).
   * Use {@link COMMISSION_ROLLING_DAYS} (30) for commission tier input.
   */
  rollingDays?: number;
  /**
   * When true, include immediate child agencies: gifts to their `recipientAgencyId` and to their
   * agent_hosts. Used for parent commission-tier turnover (PDF: sub-agency volume maintains parent rate).
   */
  rollUpSubAgencyVolume?: boolean;
  /**
   * When set, `createdAt` window start is max(slidingStart, this instant) — e.g. agency.createdAt
   * so new agencies only accrue turnover over elapsed lifetime until a full rolling window applies.
   */
  windowStartNotBefore?: Date | null;
}

function rollingWindowMs(rollingDays: number): number {
  return rollingDays * DAY_MS;
}

/**
 * Lower bound for rolling-window queries: never count activity before `notBefore`
 * (e.g. agency.createdAt). After the agency is older than the rolling length, this equals
 * the usual sliding start (windowEnd − rollingDays).
 */
export function clampRollingWindowStart(
  windowEnd: Date,
  rollingDays: number,
  notBefore: Date,
): Date {
  const slidingStart = new Date(
    windowEnd.getTime() - rollingWindowMs(rollingDays),
  );
  return slidingStart.getTime() >= notBefore.getTime()
    ? slidingStart
    : notBefore;
}

/**
 * Sum of hostBeans (floor(beanValue × 0.70)) from **gift transactions** attributed to this
 * agency in the sliding window ending at `windowEnd`, optionally excluding one transaction.
 * Coin recharge / wallet top-up does **not** contribute — only qualifying `gift_transactions`.
 *
 * Default window: 7 days — used for gift-bonus tiers. Pass `rollingDays: COMMISSION_ROLLING_DAYS`
 * for agency commission % tier lookup.
 *
 * Attribution matches commission scope: gifts to `recipientAgencyId`, or to hosts where
 * `agentId` is this agency's owner (agent_host). With `rollUpSubAgencyVolume`, also gifts to
 * child agencies and their agent_hosts.
 */
export async function sumRollingAgencyHostIncome(
  tx: { $queryRaw: typeof prisma.$queryRaw },
  params: RollingIncomeParams,
): Promise<bigint> {
  const days = params.rollingDays ?? GIFT_BONUS_ROLLING_DAYS;
  const windowStart = params.windowStartNotBefore
    ? clampRollingWindowStart(
        params.windowEnd,
        days,
        params.windowStartNotBefore,
      )
    : new Date(params.windowEnd.getTime() - rollingWindowMs(days));
  const exclude = params.excludeGiftTransactionId
    ? Prisma.sql`AND gt.id <> ${params.excludeGiftTransactionId}`
    : Prisma.empty;

  const attribution = params.rollUpSubAgencyVolume
    ? Prisma.sql`(
        gt."recipientAgencyId" = ${params.agencyId}
        OR gt."recipientAgencyId" IN (
          SELECT id FROM agencies WHERE "parentAgencyId" = ${params.agencyId}
        )
        OR gt."recipientId" IN (
          SELECT u.id FROM users u
          WHERE u.role = 'host' AND u."hostType" = 'agent_host'
          AND (
            u."agentId" = ${params.agentOwnerId}
            OR u."agentId" IN (
              SELECT "ownerId" FROM agencies WHERE "parentAgencyId" = ${params.agencyId}
            )
          )
        )
      )`
    : Prisma.sql`(
        gt."recipientAgencyId" = ${params.agencyId}
        OR gt."recipientId" IN (
          SELECT u.id FROM users u
          WHERE u."agentId" = ${params.agentOwnerId}
            AND u.role = 'host'
            AND u."hostType" = 'agent_host'
        )
      )`;

  const rows = await tx.$queryRaw<[{ sum: bigint | null }]>`
    SELECT COALESCE(SUM(FLOOR(gt."beanValue"::numeric * 0.70)), 0)::bigint AS sum
    FROM gift_transactions gt
    WHERE gt."createdAt" >= ${windowStart}
      AND gt."createdAt" <= ${params.windowEnd}
      ${exclude}
      AND ${attribution}
  `;
  const raw = rows[0]?.sum;
  return BigInt(raw ?? 0);
}

/**
 * Sum of turnover coins from **gift transactions** attributed to this agency in the sliding window.
 *
 * Turnover coins are computed from the stored `gift_transactions.coinCost` which is already the
 * total coin cost for the transaction (i.e. includes qty at write time).
 *
 * Attribution matches commission scope: gifts to `recipientAgencyId`, or to agent_hosts under the
 * agency owner. With `rollUpSubAgencyVolume`, also includes immediate child agencies and their
 * agent_hosts (used for parent agency tier lookup).
 */
export async function sumRollingAgencyTurnoverCoins(
  tx: { $queryRaw: typeof prisma.$queryRaw },
  params: RollingIncomeParams,
): Promise<bigint> {
  const days = params.rollingDays ?? COMMISSION_ROLLING_DAYS;
  const windowStart = params.windowStartNotBefore
    ? clampRollingWindowStart(
        params.windowEnd,
        days,
        params.windowStartNotBefore,
      )
    : new Date(params.windowEnd.getTime() - rollingWindowMs(days));
  const exclude = params.excludeGiftTransactionId
    ? Prisma.sql`AND gt.id <> ${params.excludeGiftTransactionId}`
    : Prisma.empty;

  const attribution = params.rollUpSubAgencyVolume
    ? Prisma.sql`(
        gt."recipientAgencyId" = ${params.agencyId}
        OR gt."recipientAgencyId" IN (
          SELECT id FROM agencies WHERE "parentAgencyId" = ${params.agencyId}
        )
        OR gt."recipientId" IN (
          SELECT u.id FROM users u
          WHERE u.role = 'host' AND u."hostType" = 'agent_host'
          AND (
            u."agentId" = ${params.agentOwnerId}
            OR u."agentId" IN (
              SELECT "ownerId" FROM agencies WHERE "parentAgencyId" = ${params.agencyId}
            )
          )
        )
      )`
    : Prisma.sql`(
        gt."recipientAgencyId" = ${params.agencyId}
        OR gt."recipientId" IN (
          SELECT u.id FROM users u
          WHERE u."agentId" = ${params.agentOwnerId}
            AND u.role = 'host'
            AND u."hostType" = 'agent_host'
        )
      )`;

  const rows = await tx.$queryRaw<[{ sum: bigint | null }]>`
    SELECT COALESCE(SUM(gt."coinCost"::bigint), 0)::bigint AS sum
    FROM gift_transactions gt
    WHERE gt."createdAt" >= ${windowStart}
      AND gt."createdAt" <= ${params.windowEnd}
      ${exclude}
      AND ${attribution}
  `;
  const raw = rows[0]?.sum;
  return BigInt(raw ?? 0);
}

/**
 * Sum of own-agency-ID hostBeans (floor(beanValue × 0.70)) from **agency-destination**
 * gift transactions only (gt.recipientAgencyId = agencyId) in the sliding window.
 *
 * Historical direct-agency-only helper. Current gift-bonus tier lookup uses
 * `sumRollingAgencyHostIncome` so hosts under the agency are included.
 */
export async function sumRollingAgencyOwnIdIncome(
  tx: { $queryRaw: typeof prisma.$queryRaw },
  params: {
    agencyId: string;
    windowEnd: Date;
    excludeGiftTransactionId?: string | null;
    rollingDays?: number;
  },
): Promise<bigint> {
  const days = params.rollingDays ?? GIFT_BONUS_ROLLING_DAYS;
  const windowStart = new Date(
    params.windowEnd.getTime() - rollingWindowMs(days),
  );
  const exclude = params.excludeGiftTransactionId
    ? Prisma.sql`AND gt.id <> ${params.excludeGiftTransactionId}`
    : Prisma.empty;

  const rows = await tx.$queryRaw<[{ sum: bigint | null }]>`
    SELECT COALESCE(SUM(FLOOR(gt."beanValue"::numeric * 0.70)), 0)::bigint AS sum
    FROM gift_transactions gt
    WHERE gt."createdAt" >= ${windowStart}
      AND gt."createdAt" <= ${params.windowEnd}
      ${exclude}
      AND gt."recipientAgencyId" = ${params.agencyId}
  `;
  const raw = rows[0]?.sum;
  return BigInt(raw ?? 0);
}

/** Reference gross for admin “illustrative” company-share line (stable rounding). */
export const ILLUSTRATIVE_POLICY_GROSS_BEANS = 1_000_000;

/**
 * Integer split matching `distributeBeans` (host 70%, then floors on hostBeans × rates).
 * Used for admin policy copy only — not persisted.
 */
export function illustrativeCompanyShareForAgencyPath(opts: {
  commissionRate: number;
  giftBonusRate?: number;
  parentDeltaRate?: number;
  grossBeans?: number;
}): {
  illustrativeGrossBeans: number;
  hostBeans: number;
  directCommissionBeans: number;
  giftBonusBeans: number;
  parentDeltaBeans: number;
  companyBeans: number;
  companyPercentOfGross: number;
} {
  const gross = opts.grossBeans ?? ILLUSTRATIVE_POLICY_GROSS_BEANS;
  const giftBonusRate = opts.giftBonusRate ?? 0;
  const parentDeltaRate = opts.parentDeltaRate ?? 0;
  const hostBeans = Math.floor(gross * 0.7);
  const direct = Math.floor(hostBeans * opts.commissionRate);
  const giftBonus = Math.floor(hostBeans * giftBonusRate);
  const parentDelta = Math.floor(hostBeans * parentDeltaRate);
  const company = gross - hostBeans - direct - giftBonus - parentDelta;
  return {
    illustrativeGrossBeans: gross,
    hostBeans,
    directCommissionBeans: direct,
    giftBonusBeans: giftBonus,
    parentDeltaBeans: parentDelta,
    companyBeans: company,
    companyPercentOfGross: gross > 0 ? (company / gross) * 100 : 0,
  };
}
