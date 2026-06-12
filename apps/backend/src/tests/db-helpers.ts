import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { clearLuckySettingCache } from '../modules/lucky-gifts/lucky-setting';

/**
 * Truncate all transactional tables between tests. Reference tables
 * (gifts, agency_tiers, gift_bonus_settings) are preserved.
 */
export async function resetDb(): Promise<void> {
  // Order matters only for non-cascading FKs, but we CASCADE anyway.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "phone_otps",
      "admin_notifications",
      "staff_targets",
      "gift_commission_ledger",
      "gift_transactions",
      "wallet_transactions",
      "wallets",
      "agency_invitations",
      "agencies",
      "users",
      "admin_users"
    RESTART IDENTITY CASCADE
  `);
  // Reset the singletons to defaults.
  await prisma.giftBonusSetting.upsert({
    where: { id: 'singleton' },
    update: { enabled: true, bonusRate: 0.15, updatedBy: '' },
    create: { id: 'singleton', enabled: true, bonusRate: 0.15, updatedBy: '' },
  });
  await prisma.luckyGiftSetting.upsert({
    where: { id: 'singleton' },
    update: {
      enabled: true,
      winProbability: 0.98,
      winMultiplier: 3.0,
      winMultiplierTiers: [
        { multiplier: 2, weight: 50 },
        { multiplier: 3, weight: 25 },
        { multiplier: 5, weight: 15 },
        { multiplier: 10, weight: 7 },
        { multiplier: 50, weight: 2 },
        { multiplier: 100, weight: 1 },
      ],
      receiverBenefitPercent: 1.5,
      updatedBy: '',
    },
    create: { id: 'singleton', enabled: true },
  });
  clearLuckySettingCache();
}

interface CreateUserInput {
  role?: 'normal_user' | 'host' | 'agent';
  hostType?: 'independent' | 'agent_host' | '';
  agentId?: string | null;
  coinBalance?: number;
  beanBalance?: number;
  displayName?: string;
  gender?: string;
  isVerifiedHost?: boolean;
}

export async function createTestUser(input: CreateUserInput = {}): Promise<{
  id: string; supabaseUid: string;
}> {
  const id = randomUUID();
  const supabaseUid = `sb-${id}`;
  await prisma.user.create({
    data: {
      id,
      supabaseUid,
      role: input.role ?? 'normal_user',
      hostType: input.hostType ?? '',
      agentId: input.agentId ?? null,
      displayName: input.displayName ?? `User ${id.slice(0, 6)}`,
      username: `u_${id.slice(0, 8)}`,
      gender: input.gender ?? (input.role === 'host' ? 'female' : ''),
      isVerifiedHost: input.isVerifiedHost ?? input.role === 'host',
      wallet: {
        create: {
          coinBalance: input.coinBalance ?? 0,
          beanBalance: input.beanBalance ?? 0,
        },
      },
    },
  });
  return { id, supabaseUid };
}

export async function createTestAdmin(input: {
  role?: string;
  roles?: string[];
  region?: string | null;
  managerId?: string | null;
  hakaId?: string | null;
  username?: string | null;
  phone?: string | null;
  country?: string;
} = {}): Promise<{ id: string; email: string }> {
  const email = `admin_${Math.random().toString(36).slice(2)}@test.local`;
  const role = input.role ?? 'admin';
  const admin = await prisma.adminUser.create({
    data: {
      email,
      passwordHash: 'x', // never used; tests mint JWTs directly
      displayName: 'Test Staff',
      role,
      roles: input.roles ?? [role],
      region: input.region ?? null,
      managerId: input.managerId ?? null,
      hakaId: input.hakaId ?? null,
      username: input.username ?? null,
      phone: input.phone ?? null,
      country: input.country ?? '',
    },
  });
  return { id: admin.id, email: admin.email };
}

interface CreateAgencyInput {
  ownerId: string;
  parentAgencyId?: string | null;
  status?: 'active' | 'suspended' | 'banned';
  commissionRateOverride?: number | null;
  commissionRateOverrideValidUntil?: Date | null;
  giftBonusRateOverride?: number | null;
  giftBonusRateOverrideValidUntil?: Date | null;
  giftBonusEnabled?: boolean;
  cumulativeHostIncome?: bigint;
}

export async function createTestAgency(input: CreateAgencyInput): Promise<{ id: string }> {
  const agency = await prisma.agency.create({
    data: {
      name: `Agency ${input.ownerId.slice(0, 6)}`,
      ownerId: input.ownerId,
      parentAgencyId: input.parentAgencyId ?? null,
      status: input.status ?? 'active',
      commissionRateOverride: input.commissionRateOverride ?? null,
      commissionRateOverrideValidUntil: input.commissionRateOverrideValidUntil ?? null,
      giftBonusRateOverride:  input.giftBonusRateOverride  ?? null,
      giftBonusRateOverrideValidUntil: input.giftBonusRateOverrideValidUntil ?? null,
      giftBonusEnabled: input.giftBonusEnabled ?? true,
      cumulativeHostIncome: input.cumulativeHostIncome ?? 0n,
    },
  });
  return { id: agency.id };
}

interface CreateCoinSellerProfileInput {
  userId: string;
  giftCommissionRate?: number;
  incomeRewardRate?: number;
  giftBonusRate?: number;
  totalCommissionRate?: number;
}

export async function createTestCoinSellerProfile(
  input: CreateCoinSellerProfileInput,
): Promise<{ id: string }> {
  const profile = await prisma.coinSellerProfile.create({
    data: {
      userId: input.userId,
      giftCommissionRate: input.giftCommissionRate ?? 0,
      incomeRewardRate: input.incomeRewardRate ?? 0,
      giftBonusRate: input.giftBonusRate ?? 0,
      totalCommissionRate: input.totalCommissionRate ?? 0,
    },
  });
  return { id: profile.id };
}

/**
 * Mint a JWT accepted by the auth middleware. The middleware reads
 * JWT_ACCESS_SECRET from env (set in setup.ts); we match it here.
 */
export function mintJwt(userId: string, role: 'normal_user' | 'host' | 'agent' = 'normal_user'): string {
  return jwt.sign({ sub: userId, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
}

/**
 * Mint a JWT accepted by the admin auth middleware (uses ADMIN_JWT_SECRET).
 */
export function mintAdminJwt(adminId: string, role = 'super_admin'): string {
  return jwt.sign({ sub: adminId, role }, process.env.ADMIN_JWT_SECRET!, { expiresIn: '15m' });
}

export async function getWalletBalance(userId: string): Promise<{ coins: number; beans: number }> {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return { coins: Number(w?.coinBalance ?? 0), beans: Number(w?.beanBalance ?? 0) };
}

export async function getLedgerRows(giftTransactionId: string) {
  return prisma.giftCommissionLedger.findMany({
    where: { giftTransactionId },
    orderBy: { commissionType: 'asc' },
  });
}

export async function getCumulativeBeansEarned(userId: string): Promise<bigint> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { cumulativeBeansEarned: true },
  });
  return BigInt(u.cumulativeBeansEarned as unknown as string | number | bigint);
}

export async function getAgencyCounters(agencyId: string) {
  const a = await prisma.agency.findUniqueOrThrow({
    where: { id: agencyId },
    select: { cumulativeHostIncome: true, beanBalance: true },
  });
  return {
    cumulativeHostIncome: BigInt(a.cumulativeHostIncome as unknown as string | number | bigint),
    beanBalance: BigInt(a.beanBalance as unknown as string | number | bigint),
  };
}

export async function setAgencyParent(agencyId: string, parentAgencyId: string | null): Promise<void> {
  await prisma.agency.update({ where: { id: agencyId }, data: { parentAgencyId } });
}

/** Sets singleton fallback gift-bonus rate when no GiftBonusTier rows exist (tests delete tiers in beforeEach). */
export async function setGiftBonusFallbackRate(bonusRate = 0.15): Promise<void> {
  await prisma.giftBonusSetting.update({
    where: { id: 'singleton' },
    data: { bonusRate, enabled: true },
  });
}

/**
 * Prime a user's cumulative beans earned (used to land hosts at specific tier boundaries).
 */
export async function setCumulativeBeans(userId: string, value: bigint): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { cumulativeBeansEarned: value } });
}

/**
 * Prime an agency's cumulative host income (tier-lookup boundary tests).
 */
export async function setAgencyCumulative(agencyId: string, value: bigint): Promise<void> {
  await prisma.agency.update({ where: { id: agencyId }, data: { cumulativeHostIncome: value } });
}

export type SeedRollingRecipient =
  | { kind: 'host'; recipientId: string }
  | { kind: 'agency'; recipientId: string; recipientAgencyId: string };

/**
 * Inserts synthetic gift_transactions whose rolling-window contribution is
 * SUM(FLOOR(beanValue×0.70)) ≈ targetHostBeans (last chunk adjusted). Use to
 * prime 30-day commission tier lookups in tests.
 */
export async function seedRollingAgencyHostBeansSum(params: {
  senderId: string;
  giftId: string;
  targetHostBeans: bigint;
  /**
   * Defaults to "now" so rows fall inside rolling windows **and** after `agency.createdAt`
   * when the agency is created in the same test before seeding.
   */
  createdAt?: Date;
  recipient: SeedRollingRecipient;
}): Promise<void> {
  const createdAt = params.createdAt ?? new Date();
  let remaining = params.targetHostBeans;
  /** Large gifts minimize row count; stay within signed 32-bit Int and realistic coin cost. */
  const MAX_BEAN_VALUE = 2_000_000_000;
  const maxHostBeansPerTx = BigInt(Math.floor(MAX_BEAN_VALUE * 0.7));

  while (remaining > 0n) {
    const chunk = remaining > maxHostBeansPerTx ? maxHostBeansPerTx : remaining;
    let beanValue = Math.min(MAX_BEAN_VALUE, Math.ceil(Number(chunk) / 0.7));
    let contrib = BigInt(Math.floor(beanValue * 0.7));
    while (contrib > remaining && beanValue > 1) {
      beanValue -= 1;
      contrib = BigInt(Math.floor(beanValue * 0.7));
    }
    if (contrib <= 0n) {
      throw new Error(`seedRollingAgencyHostBeansSum: cannot represent remaining=${remaining}`);
    }

    const base = {
      senderId: params.senderId,
      giftId: params.giftId,
      qty: 1,
      coinCost: beanValue,
      beanValue,
      createdAt,
    };

    if (params.recipient.kind === 'host') {
      await prisma.giftTransaction.create({
        data: {
          ...base,
          recipientId: params.recipient.recipientId,
          recipientType: 'user',
          recipientAgencyId: null,
        },
      });
    } else {
      await prisma.giftTransaction.create({
        data: {
          ...base,
          recipientId: params.recipient.recipientId,
          recipientType: 'agency',
          recipientAgencyId: params.recipient.recipientAgencyId,
        },
      });
    }

    remaining -= contrib;
  }
}

/**
 * Inserts synthetic gift_transactions whose rolling-window contribution is
 * SUM(coinCost) ≈ targetTurnoverCoins. Use to prime 30-day turnover tiers in tests.
 *
 * Note: gift_transactions.coinCost is stored as the total coin cost of the transaction
 * (already includes qty), so we set qty=1 and coinCost=chunk for predictability.
 */
export async function seedRollingAgencyTurnoverCoinsSum(params: {
  senderId: string;
  giftId: string;
  targetTurnoverCoins: bigint;
  /**
   * Defaults to "now" so rows fall inside rolling windows **and** after `agency.createdAt`
   * when the agency is created in the same test before seeding.
   */
  createdAt?: Date;
  recipient: SeedRollingRecipient;
}): Promise<void> {
  const createdAt = params.createdAt ?? new Date();
  let remaining = params.targetTurnoverCoins;
  const MAX_COIN_COST = 2_000_000_000n; // keep within Int32

  while (remaining > 0n) {
    const chunk = remaining > MAX_COIN_COST ? MAX_COIN_COST : remaining;
    if (chunk <= 0n) throw new Error(`seedRollingAgencyTurnoverCoinsSum: invalid chunk=${chunk.toString()}`);

    const coinCost = Number(chunk);
    const beanValue = coinCost; // arbitrary; not used for turnover coins tiering
    const base = {
      senderId: params.senderId,
      giftId: params.giftId,
      qty: 1,
      coinCost,
      beanValue,
      createdAt,
    };

    if (params.recipient.kind === 'host') {
      await prisma.giftTransaction.create({
        data: {
          ...base,
          recipientId: params.recipient.recipientId,
          recipientType: 'user',
          recipientAgencyId: null,
        },
      });
    } else {
      await prisma.giftTransaction.create({
        data: {
          ...base,
          recipientId: params.recipient.recipientId,
          recipientType: 'agency',
          recipientAgencyId: params.recipient.recipientAgencyId,
        },
      });
    }

    remaining -= chunk;
  }
}
