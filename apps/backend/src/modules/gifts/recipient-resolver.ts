import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export interface ResolvedAgency {
  id: string;
  ownerId: string;
  status: string;
  parentAgencyId: string | null;
  commissionRateOverride: number | null;
  commissionRateOverrideValidUntil: Date | null;
  giftBonusRateOverride: number | null;
  giftBonusRateOverrideValidUntil: Date | null;
  giftBonusEnabled: boolean;
  cumulativeHostIncome: bigint;
  createdAt: Date;
}

export interface ResolvedUser {
  id: string;
  role: string;
  hostType: string;
  agentId: string | null;
  displayName: string;
  avatar: string;
  username: string | null;
}

export interface ResolvedCoinSeller {
  userId: string;
  totalCommissionRate: number;
  giftCommissionRate: number;
  incomeRewardRate: number;
  giftBonusRate: number;
}

const COIN_SELLER_RATE_SELECT = {
  totalCommissionRate: true,
  giftCommissionRate: true,
  incomeRewardRate: true,
  giftBonusRate: true,
} as const;

export interface GiftRecipientContext {
  destinationKind: 'user' | 'agency';
  hostUser: ResolvedUser;                  // user who receives the 70% host share
  agency: ResolvedAgency | null;           // context for direct commission + parent delta
  coinSeller: ResolvedCoinSeller | null;
  giftTransaction: {
    recipientId: string;                   // always set — the user FK
    recipientType: 'user' | 'agency';
    recipientAgencyId: string | null;
  };
}

interface Input {
  recipientId?: string;
  recipientAgencyId?: string;
}

function asAgency(a: {
  id: string; ownerId: string; status: string; parentAgencyId: string | null;
  commissionRateOverride: unknown;
  commissionRateOverrideValidUntil: Date | null;
  giftBonusRateOverride: unknown;
  giftBonusRateOverrideValidUntil: Date | null;
  giftBonusEnabled: boolean;
  cumulativeHostIncome: unknown;
  createdAt: Date;
}): ResolvedAgency {
  return {
    id: a.id,
    ownerId: a.ownerId,
    status: a.status,
    parentAgencyId: a.parentAgencyId,
    commissionRateOverride: a.commissionRateOverride == null ? null : Number(a.commissionRateOverride),
    commissionRateOverrideValidUntil: a.commissionRateOverrideValidUntil ?? null,
    giftBonusRateOverride:  a.giftBonusRateOverride  == null ? null : Number(a.giftBonusRateOverride),
    giftBonusRateOverrideValidUntil: a.giftBonusRateOverrideValidUntil ?? null,
    giftBonusEnabled: a.giftBonusEnabled,
    cumulativeHostIncome:   BigInt(a.cumulativeHostIncome as string | number | bigint),
    createdAt: a.createdAt,
  };
}

function asUser(u: {
  id: string; role: string; hostType: string; agentId: string | null;
  displayName: string; avatar: string; username: string | null;
}): ResolvedUser {
  return {
    id: u.id, role: u.role, hostType: u.hostType, agentId: u.agentId,
    displayName: u.displayName, avatar: u.avatar, username: u.username,
  };
}

function asCoinSeller(
  userId: string,
  profile: {
    totalCommissionRate: unknown;
    giftCommissionRate: unknown;
    incomeRewardRate: unknown;
    giftBonusRate: unknown;
  },
): ResolvedCoinSeller {
  return {
    userId,
    totalCommissionRate: Number(profile.totalCommissionRate),
    giftCommissionRate: Number(profile.giftCommissionRate),
    incomeRewardRate: Number(profile.incomeRewardRate),
    giftBonusRate: Number(profile.giftBonusRate),
  };
}

const USER_SELECT = {
  id: true, role: true, hostType: true, agentId: true,
  displayName: true, avatar: true, username: true,
  coinSellerProfile: { select: COIN_SELLER_RATE_SELECT },
  ownedAgency: {
    select: {
      id: true, ownerId: true, status: true, parentAgencyId: true,
      commissionRateOverride: true,
      commissionRateOverrideValidUntil: true,
      giftBonusRateOverride: true,
      giftBonusRateOverrideValidUntil: true,
      giftBonusEnabled: true,
      cumulativeHostIncome: true,
      createdAt: true,
    },
  },
} as const;

const AGENCY_SELECT = {
  id: true, ownerId: true, status: true, parentAgencyId: true,
  commissionRateOverride: true,
  commissionRateOverrideValidUntil: true,
  giftBonusRateOverride: true,
  giftBonusRateOverrideValidUntil: true,
  giftBonusEnabled: true,
  cumulativeHostIncome: true,
  createdAt: true,
  owner: {
    select: {
      id: true, role: true, hostType: true, agentId: true,
      displayName: true, avatar: true, username: true,
      coinSellerProfile: { select: COIN_SELLER_RATE_SELECT },
    },
  },
} as const;

export async function resolveGiftRecipient(input: Input): Promise<GiftRecipientContext> {
  const hasUser   = !!input.recipientId;
  const hasAgency = !!input.recipientAgencyId;
  if (hasUser === hasAgency) {
    throw new AppError('Provide exactly one of recipientId or recipientAgencyId', 400);
  }

  if (hasAgency) {
    const row = await prisma.agency.findUnique({
      where: { id: input.recipientAgencyId! },
      select: AGENCY_SELECT,
    });
    if (!row) throw new AppError('Agency not found', 404);
    if (row.status !== 'active') throw new AppError('Agency is not active', 400);

    const agency = asAgency(row);
    const owner  = asUser(row.owner);
    const coinSeller = row.owner.coinSellerProfile
      ? asCoinSeller(agency.ownerId, row.owner.coinSellerProfile)
      : null;
    return {
      destinationKind: 'agency',
      hostUser: owner,
      agency,
      coinSeller,
      giftTransaction: {
        recipientId: owner.id,
        recipientType: 'agency',
        recipientAgencyId: agency.id,
      },
    };
  }

  // User destination.
  const user = await prisma.user.findUnique({
    where: { id: input.recipientId! },
    select: USER_SELECT,
  });
  if (!user) throw new AppError('Recipient not found', 404);

  // Agent-going-live rewrite.
  if (user.role === 'agent' && user.ownedAgency && user.ownedAgency.status === 'active') {
    const agency = asAgency(user.ownedAgency);
    const coinSeller = user.coinSellerProfile
      ? asCoinSeller(user.id, user.coinSellerProfile)
      : null;
    return {
      destinationKind: 'agency',
      hostUser: asUser(user),
      agency,
      coinSeller,
      giftTransaction: {
        recipientId: user.id,
        recipientType: 'agency',
        recipientAgencyId: agency.id,
      },
    };
  }

  // Agent-host → attach agency context via agent.ownedAgency.
  let agency: ResolvedAgency | null = null;
  type CoinSellerRates = { [K in keyof typeof COIN_SELLER_RATE_SELECT]: unknown };
  let agentCoinSellerProfile: CoinSellerRates | null = null;
  if (user.role === 'host' && user.hostType === 'agent_host' && user.agentId) {
    const agent = await prisma.user.findUnique({
      where: { id: user.agentId },
      select: {
        coinSellerProfile: { select: COIN_SELLER_RATE_SELECT },
        ownedAgency: { select: AGENCY_SELECT },
      },
    });
    agentCoinSellerProfile = agent?.coinSellerProfile ?? null;
    if (agent?.ownedAgency && agent.ownedAgency.status === 'active') {
      agency = asAgency(agent.ownedAgency);
    }
  }

  const coinSeller =
    agentCoinSellerProfile && user.agentId
      ? asCoinSeller(user.agentId, agentCoinSellerProfile)
      : null;

  return {
    destinationKind: 'user',
    hostUser: asUser(user),
    agency,
    coinSeller,
    giftTransaction: {
      recipientId: user.id,
      recipientType: 'user',
      recipientAgencyId: null,
    },
  };
}
