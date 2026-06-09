import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import {
  notifySellerRechargeApproved,
  syncCoinSellerProfileRatesFromTier,
} from '../../payments/coinSeller.service';
import { emitAdminDataChanged } from '../../../sockets/admin-realtime';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListSellersParams {
  page: number;
  limit: number;
  search?: string;
}

/** Fields safe to expose to admin Seller Coins UI (no password, tokens, supabase UID, etc.). */
const sellerCoinsListUserSelect = {
  id: true,
  username: true,
  displayName: true,
  hakaId: true,
  avatar: true,
  createdAt: true,
  coinSellerProfile: true,
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

const sellerCoinsDetailUserSelect = {
  id: true,
  username: true,
  displayName: true,
  hakaId: true,
  avatar: true,
  phone: true,
  country: true,
  createdAt: true,
  isActive: true,
  coinSellerProfile: true,
} satisfies Prisma.UserSelect;

/** Agents are coin sellers by role; profiles are created lazily on first app use. */
function sellerUserWhere(search?: string): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    OR: [
      { role: 'agent' },
      { coinSellerProfile: { isNot: null } },
    ],
  };

  if (search) {
    where.AND = [
      {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { hakaId: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  return where;
}

async function ensureCoinSellerProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, coinSellerProfile: { select: { id: true } } },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.coinSellerProfile) return;
  if (user.role !== 'agent') {
    throw new AppError('Coin seller profile not found', 404);
  }
  await prisma.coinSellerProfile.create({ data: { userId } });
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listSellers(params: ListSellersParams) {
  const { page, limit, search } = params;
  const skip = (page - 1) * limit;

  const where = sellerUserWhere(search);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: sellerCoinsListUserSelect,
    }),
    prisma.user.count({ where }),
  ]);

  const sellers = users.map((u) => {
    const p = u.coinSellerProfile;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      hakaId: u.hakaId,
      avatar: u.avatar,
      createdAt: u.createdAt,
      coinBalance: p?.availableBalance ?? 0,
      totalBalance: p?.totalBalance ?? 0,
      totalSold: p?.totalCoinsSold ?? 0,
      level: p?.sellerLevel ?? null,
      tags: u.tags.map((ut) => ut.tag.name),
    };
  });

  return {
    sellers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSellerDetail(userId: string) {
  await ensureCoinSellerProfile(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: sellerCoinsDetailUserSelect,
  });

  if (!user?.coinSellerProfile) {
    throw new AppError('Coin seller profile not found', 404);
  }

  const [rechargeRequests, sellerTransactions] = await Promise.all([
    prisma.sellerRechargeRequest.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.coinSellerTransaction.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        counterparty: {
          select: { id: true, displayName: true, hakaId: true, username: true },
        },
      },
    }),
  ]);

  await syncCoinSellerProfileRatesFromTier(userId);
  const userFresh = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: sellerCoinsDetailUserSelect,
  });
  const profile = userFresh.coinSellerProfile!;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    hakaId: user.hakaId,
    avatar: user.avatar,
    phone: user.phone,
    country: user.country,
    createdAt: user.createdAt,
    isActive: user.isActive,
    coinSellerProfile: profile,
    coinBalance: profile.availableBalance ?? 0,
    totalBalance: profile.totalBalance ?? 0,
    securityDeposit: profile.securityDeposit ?? 0,
    totalCustomers: profile.totalCustomers ?? 0,
    totalSold: profile.totalCoinsSold ?? 0,
    level: profile.sellerLevel ?? null,
    rechargeRequests,
    sellerTransactions,
  };
}

export async function listRechargeRequests(status?: string) {
  const where: Record<string, any> = {};
  if (status) where.status = status;
  const requests = await prisma.sellerRechargeRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      seller: {
        select: { id: true, displayName: true, hakaId: true, avatar: true },
      },
    },
  });
  return requests;
}

export async function approveRecharge(requestId: string, adminId: string, ip?: string) {
  const req = await prisma.sellerRechargeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Recharge request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is not pending', 400);

  /** Same credit path as payments.admin approveSellerRecharge — upsert so sellers without a row still get funded. */
  let newBalance = 0;

  await prisma.$transaction(async (tx) => {
    const profile = await tx.coinSellerProfile.upsert({
      where: { userId: req.sellerId },
      create: {
        userId: req.sellerId,
        availableBalance: req.coinsToCredit,
        totalBalance: req.coinsToCredit,
      },
      update: {
        availableBalance: { increment: req.coinsToCredit },
        totalBalance: { increment: req.coinsToCredit },
      },
    });
    newBalance = Number(profile.availableBalance);

    await tx.coinSellerTransaction.create({
      data: {
        sellerId: req.sellerId,
        transactionType: 'recharge',
        coinsAmount: req.coinsToCredit,
        operatorName: 'admin',
        notes: `Recharge approved (request ${requestId})`,
      },
    });
    await tx.sellerRechargeRequest.update({
      where: { id: requestId },
      data: { status: 'approved', processedAt: new Date(), processedById: adminId },
    });
  });

  void notifySellerRechargeApproved({
    sellerId: req.sellerId,
    rechargeId: requestId,
    coinsAdded: Number(req.coinsToCredit),
    amountUsd: Number(req.amountUsd),
    newBalance,
  });

  await logAdminAction(adminId, 'seller.recharge.approve', 'SellerRechargeRequest', requestId, { coins: req.coinsToCredit }, ip);
  return { approved: true, coinsToCredit: req.coinsToCredit, newBalance };
}

export async function rejectRecharge(requestId: string, adminId: string, notes: string, ip?: string) {
  const req = await prisma.sellerRechargeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Recharge request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is not pending', 400);

  await prisma.sellerRechargeRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', adminNotes: notes, processedAt: new Date(), processedById: adminId },
  });

  emitAdminDataChanged('seller_recharges', { rechargeId: requestId, status: 'rejected' });

  await logAdminAction(adminId, 'seller.recharge.reject', 'SellerRechargeRequest', requestId, { notes }, ip);
  return { rejected: true };
}

export async function deductSellerCoins(
  userId: string,
  coins: number,
  reason: string,
  adminId: string,
  adminDisplayName: string,
  ip?: string,
) {
  if (coins <= 0) throw new AppError('Amount must be positive', 400);
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new AppError('Reason is required', 400);

  await ensureCoinSellerProfile(userId);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM coin_seller_profiles
      WHERE "userId" = ${userId}
      FOR UPDATE
    `;

    const profile = await tx.coinSellerProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError('Coin seller profile not found', 404);

    const available = Number(profile.availableBalance);
    if (available < coins) {
      throw new AppError(`Insufficient seller balance (available: ${available})`, 400);
    }

    const updated = await tx.coinSellerProfile.update({
      where: { userId },
      data: { availableBalance: { decrement: coins } },
    });

    await tx.coinSellerTransaction.create({
      data: {
        sellerId: userId,
        transactionType: 'admin_deduct',
        coinsAmount: BigInt(coins),
        operatorName: adminDisplayName,
        notes: trimmedReason,
      },
    });

    return updated;
  });

  await logAdminAction(adminId, 'seller.deduct_coins', 'User', userId, { coins, reason: trimmedReason }, ip);
  emitAdminDataChanged('seller_coins', { userId, action: 'deduct', coins });

  return {
    deducted: coins,
    newAvailableBalance: Number(result.availableBalance),
  };
}

export async function assignSeniorSellerTag(userId: string, adminId: string, ip?: string) {
  await ensureCoinSellerProfile(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { coinSellerProfile: true },
  });
  if (!user?.coinSellerProfile) {
    throw new AppError('Coin seller profile not found', 404);
  }

  // Find or create the senior_seller AdminTag
  let tag = await prisma.adminTag.findUnique({ where: { name: 'senior_seller' } });
  if (!tag) {
    tag = await prisma.adminTag.create({
      data: {
        name: 'senior_seller',
        displayName: 'Senior Seller',
        color: '#E8A020',
        iconUrl: '/tag-icons/senior_seller.png',
        isBuiltIn: false,
      },
    });
  }

  // Check if assignment already exists
  const existing = await prisma.userTag.findUnique({
    where: { userId_tagId: { userId, tagId: tag.id } },
  });
  if (existing) {
    throw new AppError('Senior seller tag already assigned to this user', 400);
  }

  // Create assignment
  const assignment = await prisma.userTag.create({
    data: {
      userId,
      tagId: tag.id,
      assignedBy: adminId,
    },
  });

  await logAdminAction(adminId, 'seller.tag.assign', 'User', userId, { tag: 'senior_seller' }, ip);
  return assignment;
}

export async function removeSeniorSellerTag(userId: string, adminId: string, ip?: string) {
  // Find the senior_seller AdminTag
  const tag = await prisma.adminTag.findUnique({ where: { name: 'senior_seller' } });
  if (!tag) {
    throw new AppError('Senior seller tag not found', 404);
  }

  // Find assignment
  const assignment = await prisma.userTag.findUnique({
    where: { userId_tagId: { userId, tagId: tag.id } },
  });
  if (!assignment) {
    throw new AppError('Senior seller tag assignment not found', 404);
  }

  await prisma.userTag.delete({
    where: { userId_tagId: { userId, tagId: tag.id } },
  });

  await logAdminAction(adminId, 'seller.tag.remove', 'User', userId, { tag: 'senior_seller' }, ip);
  return { message: 'Senior seller tag removed' };
}
