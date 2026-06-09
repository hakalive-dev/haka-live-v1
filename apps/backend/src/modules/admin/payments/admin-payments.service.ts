import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { AppError } from "../../../middleware/error.middleware";
import { getIO } from "../../../sockets";
import { logAdminAction } from "../../../utils/audit";
import { assertNoRiskBlock } from "../../../utils/risk-control";
import * as walletService from "../../wallet/wallet.service";
import {
  applySellerPointsExchangeWithinTx,
  notifySellerRechargeApproved,
} from "../../payments/coinSeller.service";
import { emitAdminDataChanged } from "../../../sockets/admin-realtime";
import { scheduleWithdrawalSuccess } from "../../chat/withdrawal-message-notify.service";

const TX_TIMEOUT_MS = 15_000;

export const PAYROLL_AGENT_ROLE = "payroll_agent";

const withdrawalListInclude = {
  user: { select: { id: true, displayName: true, hakaId: true, avatar: true } },
  assignedAgent: {
    select: {
      id: true,
      displayName: true,
      hakaId: true,
      username: true,
      avatar: true,
    },
  },
};

type PayrollSettlementResult = {
  payoutBeans: number;
  commissionBeans: number;
  totalCredited: number;
  agentNewBalance: number;
  settled: boolean;
};

type WithdrawalForSettlement = {
  id: string;
  assignedAgentId: string | null;
  beansAmount: bigint;
  orderId: string;
};

/** Idempotent: credits agent payout + commission beans and payroll ledger when not yet settled. */
async function settlePayrollAgent(
  tx: Prisma.TransactionClient,
  request: WithdrawalForSettlement,
): Promise<PayrollSettlementResult> {
  if (!request.assignedAgentId) {
    return {
      payoutBeans: 0,
      commissionBeans: 0,
      totalCredited: 0,
      agentNewBalance: 0,
      settled: false,
    };
  }

  const existingLedger = await tx.payrollLedgerEntry.findUnique({
    where: { withdrawalRequestId: request.id },
  });
  if (existingLedger) {
    return {
      payoutBeans: 0,
      commissionBeans: 0,
      totalCredited: 0,
      agentNewBalance: 0,
      settled: false,
    };
  }

  const profile = await tx.payrollAgentProfile.findUnique({
    where: { userId: request.assignedAgentId },
  });
  const commissionPercent = profile ? Number(profile.commissionPercent) : 0;
  const beansTotal = Number(request.beansAmount);
  const commissionBeans = Math.floor((beansTotal * commissionPercent) / 100);
  const payoutBeans = beansTotal - commissionBeans;

  await tx.payrollLedgerEntry.create({
    data: {
      agentUserId: request.assignedAgentId,
      withdrawalRequestId: request.id,
      beansAmount: BigInt(beansTotal),
      commissionBeans: BigInt(commissionBeans),
      type: "withdrawal_payout",
    },
  });

  const orderLabel = request.orderId?.trim() || request.id.slice(0, 8);
  let agentNewBalance = 0;

  if (payoutBeans > 0) {
    const wallet = await walletService.creditBeansInTx(
      tx,
      request.assignedAgentId,
      payoutBeans,
      "withdrawal_agent_payout",
      `Payroll payout reimbursement for order ${orderLabel}: ${payoutBeans.toLocaleString()} beans`,
    );
    if (wallet) agentNewBalance = Number(wallet.beanBalance);
  }

  if (commissionBeans > 0) {
    const wallet = await walletService.creditBeansInTx(
      tx,
      request.assignedAgentId,
      commissionBeans,
      "withdrawal_agent_commission",
      `Payroll commission for order ${orderLabel}: ${commissionBeans.toLocaleString()} beans`,
    );
    if (wallet) agentNewBalance = Number(wallet.beanBalance);
  }

  return {
    payoutBeans,
    commissionBeans,
    totalCredited: payoutBeans + commissionBeans,
    agentNewBalance,
    settled: true,
  };
}

import {
  normalizeWithdrawalStatus,
  isActiveWithdrawalStatus,
  isTerminalWithdrawalStatus,
} from "../../../shared-types/withdrawal-status";
import { listAgentsForCountry } from "../../payroll-agent/payroll-agent-profile.service";
import { notifyAgentAssigned } from "../../payroll-agent/payroll-agent.service";
import { parsePayoutSnapshot, ensureFullPayoutSnapshotForWithdrawal } from "../../payroll-agent/payout-snapshot";

type WithdrawalListRow = Prisma.WithdrawalRequestGetPayload<{
  include: typeof withdrawalListInclude;
}>;

/** JSON-safe withdrawal row (BigInt/Decimal → number) for admin API responses. */
function serializeAdminWithdrawal(row: WithdrawalListRow) {
  return {
    ...row,
    beansAmount: Number(row.beansAmount),
    localAmount: row.localAmount != null ? Number(row.localAmount) : null,
    payout: parsePayoutSnapshot(row.payoutSnapshot),
  };
}

export interface ListParams {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export async function listWallets(params: ListParams) {
  const { page, limit, search, sort = "createdAt", order = "desc" } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.WalletWhereInput = {};
  if (search) {
    where.user = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { hakaId: { contains: search, mode: "insensitive" } },
        { activeSpecialId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        user: {
          select: { id: true, displayName: true, hakaId: true, avatar: true },
        },
      },
    }),
    prisma.wallet.count({ where }),
  ]);

  return {
    wallets,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function listWalletTransactions(
  params: ListParams & {
    walletId?: string;
    userId?: string;
    currency?: string;
    transactionType?: string;
  },
) {
  const {
    page,
    limit,
    walletId,
    userId,
    currency,
    transactionType,
    sort = "createdAt",
    order = "desc",
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.WalletTransactionWhereInput = {};
  if (walletId) where.walletId = walletId;
  if (userId) where.wallet = { userId };
  if (currency) where.currency = currency;
  if (transactionType) where.transactionType = transactionType;

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        wallet: {
          include: {
            user: { select: { id: true, displayName: true, hakaId: true } },
          },
        },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

type PaymentTransactionFilters = ListParams & {
  status?: string;
  userId?: string;
  method?: string;
  from?: string;
  to?: string;
  packageId?: string;
};

function buildPaymentTransactionWhere(
  params: PaymentTransactionFilters,
): Prisma.PaymentTransactionWhereInput {
  const { search, status, userId, method, from, to, packageId } = params;
  const where: Prisma.PaymentTransactionWhereInput = {};

  if (status) where.status = status;
  if (packageId) where.packageId = packageId;
  if (userId) {
    where.userId = userId;
  } else if (search) {
    where.user = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { hakaId: { contains: search, mode: "insensitive" } },
        { activeSpecialId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  if (method) {
    where.method = method;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
  }

  return where;
}

export async function listPaymentTransactions(
  params: PaymentTransactionFilters,
) {
  const { page, limit, sort = "createdAt", order = "desc" } = params;
  const skip = (page - 1) * limit;
  const where = buildPaymentTransactionWhere(params);

  const [items, total] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        user: {
          select: { id: true, displayName: true, hakaId: true, avatar: true },
        },
        package: {
          select: { id: true, coins: true, bonusCoins: true },
        },
      },
    }),
    prisma.paymentTransaction.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function paymentTransactionsSummary(
  params: PaymentTransactionFilters,
) {
  const where = buildPaymentTransactionWhere(params);
  const succeededWhere = { ...where, status: "succeeded" };

  const [amountAgg, byStatus, byMethod, creditedRows, succeededPackages] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: succeededWhere,
      _sum: { amountGbp: true },
    }),
    prisma.paymentTransaction.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.paymentTransaction.groupBy({
      by: ["method"],
      where,
      _count: { _all: true },
    }),
    prisma.paymentTransaction.findMany({
      where: { ...succeededWhere, coinsCredited: true },
      select: { package: { select: { coins: true, bonusCoins: true } } },
    }),
    prisma.paymentTransaction.findMany({
      where: succeededWhere,
      select: { package: { select: { coins: true, bonusCoins: true } } },
    }),
  ]);

  const counts = byStatus.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
  const methodCounts = byMethod.reduce<Record<string, number>>((acc, row) => {
    acc[row.method] = row._count._all;
    return acc;
  }, {});
  const totalCoinsCredited = creditedRows.reduce((sum, row) => {
    return sum + (row.package?.coins ?? 0) + (row.package?.bonusCoins ?? 0);
  }, 0);
  const totalAmountUsd = (
    succeededPackages.reduce((sum, row) =>
      sum + (row.package?.coins ?? 0) + (row.package?.bonusCoins ?? 0), 0) / 10_000
  ).toFixed(2);

  return {
    totalAmountGbp: amountAgg._sum.amountGbp?.toString() ?? "0",
    totalAmountUsd,
    succeededCount: counts.succeeded ?? 0,
    failedCount: counts.failed ?? 0,
    pendingCount: counts.pending ?? 0,
    totalCoinsCredited,
    byMethod: methodCounts,
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportPaymentTransactionsCsv(
  params: PaymentTransactionFilters,
) {
  const where = buildPaymentTransactionWhere(params);
  const rows = await prisma.paymentTransaction.findMany({
    where,
    take: 10_000,
    orderBy: { [params.sort ?? "createdAt"]: params.order ?? "desc" },
    include: {
      user: { select: { displayName: true, hakaId: true } },
      package: { select: { id: true, coins: true, bonusCoins: true } },
    },
  });

  const header = [
    "userHakaId",
    "userName",
    "coins",
    "bonusCoins",
    "packageId",
    "amountGbp",
    "method",
    "status",
    "coinsCredited",
    "paymentIntent",
    "createdAt",
  ];
  const lines = rows.map((row) =>
    [
      row.user?.hakaId,
      row.user?.displayName,
      row.package?.coins,
      row.package?.bonusCoins,
      row.package?.id,
      row.amountGbp.toString(),
      row.method,
      row.status,
      row.coinsCredited,
      row.stripePaymentIntentId,
      row.createdAt.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

export async function getWalletByUserId(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      user: {
        select: { id: true, displayName: true, hakaId: true, avatar: true },
      },
      transactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!wallet) throw new AppError("Wallet not found", 404);
  return wallet;
}

// ── Withdrawal Requests ───────────────────────────────────────────────────────

export async function listWithdrawals(
  params: ListParams & { status?: string; userId?: string; countryCode?: string },
) {
  const {
    page,
    limit,
    search,
    status,
    userId,
    countryCode,
    sort = "createdAt",
    order = "desc",
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.WithdrawalRequestWhereInput = {};
  if (status) where.status = status;
  if (countryCode) where.countryCode = countryCode.toUpperCase();
  if (userId) {
    where.userId = userId;
  } else if (search) {
    where.user = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { hakaId: { contains: search, mode: "insensitive" } },
        { activeSpecialId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: withdrawalListInclude,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return {
    items: items.map(serializeAdminWithdrawal),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function listPayrollAgentsForWithdrawals(countryCode?: string) {
  const profiles = await listAgentsForCountry(countryCode);
  return profiles.map((p) => ({
    id: p.user.id,
    displayName: p.user.displayName,
    hakaId: p.user.hakaId,
    username: p.user.username,
    countryCode: p.countryCode,
    payrollId: p.payrollId,
    commissionPercent: Number(p.commissionPercent),
  }));
}

/** Admin confirms off-app payout; user beans were already held on request. */
export async function approveWithdrawal(id: string, adminId: string, ip: string) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);

  if (isTerminalWithdrawalStatus(request.status)) {
    throw new AppError("Request is already finalized", 400);
  }
  if (!isActiveWithdrawalStatus(request.status)) {
    throw new AppError("Request cannot be approved in its current state", 400);
  }

  let totalCredited = 0;
  let agentNewBalance = 0;
  const updated = await prisma.$transaction(async (tx) => {
    const settlement = await settlePayrollAgent(tx, request);
    totalCredited = settlement.totalCredited;
    agentNewBalance = settlement.agentNewBalance;

    return tx.withdrawalRequest.update({
      where: { id },
      data: {
        status: "completed",
        verifiedByAdminId: adminId,
        verifiedAt: new Date(),
        processedAt: new Date(),
      },
      include: withdrawalListInclude,
    });
  }, { timeout: TX_TIMEOUT_MS });

  if (totalCredited > 0 && request.assignedAgentId) {
    walletService.emitWalletBeansUpdated(request.assignedAgentId, {
      beansAdded: totalCredited,
      newBalance: agentNewBalance,
      reference: "withdrawal_agent_payout",
    });
  }

  emitAdminDataChanged("withdrawals", { withdrawalId: id, status: "completed" });
  scheduleWithdrawalSuccess(id);

  await logAdminAction(
    adminId,
    "withdrawal.approve",
    "WithdrawalRequest",
    id,
    {
      beansAmount: Number(request.beansAmount),
      previousStatus: request.status,
    },
    ip,
  );

  return serializeAdminWithdrawal(updated);
}

export async function assignWithdrawal(
  id: string,
  agentUserId: string,
  adminId: string,
  ip: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);

  const st = normalizeWithdrawalStatus(request.status);
  if (st !== "pending_review") {
    throw new AppError("Request is not awaiting payroll agent assignment", 400);
  }

  const agent = await prisma.user.findUnique({ where: { id: agentUserId } });
  if (!agent) {
    throw new AppError("User is not an active payroll agent", 400);
  }
  if (!agent.isActive)
    throw new AppError("Payroll agent account is inactive", 400);

  const profile = await prisma.payrollAgentProfile.findUnique({
    where: { userId: agentUserId },
  });
  if (!profile || profile.status !== "active") {
    throw new AppError("Payroll agent profile is not active", 400);
  }
  if (
    request.countryCode &&
    profile.countryCode.toUpperCase() !== request.countryCode.toUpperCase()
  ) {
    throw new AppError(
      `Agent country (${profile.countryCode}) does not match withdrawal (${request.countryCode})`,
      400,
    );
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      assignedAgentId: agentUserId,
      assignedAt: new Date(),
      assignedByAdminId: adminId,
      status: "assigned",
    },
    include: withdrawalListInclude,
  });

  if (request.paymentMethodId) {
    await ensureFullPayoutSnapshotForWithdrawal(
      id,
      request.paymentMethodId,
      request.payoutSnapshot,
    );
  }

  emitAdminDataChanged("withdrawals", { withdrawalId: id, status: "assigned" });

  await logAdminAction(
    adminId,
    "withdrawal.assign_agent",
    "WithdrawalRequest",
    id,
    {
      agentUserId,
      beansAmount: Number(request.beansAmount),
    },
    ip,
  );

  try {
    await notifyAgentAssigned(
      agentUserId,
      id,
      Number(request.beansAmount),
      request.countryCode || '',
    );
  } catch (err) {
    console.error('[assignWithdrawal] notifyAgentAssigned failed:', err);
  }

  return serializeAdminWithdrawal(updated);
}

export async function verifyWithdrawalProof(
  id: string,
  adminId: string,
  ip: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);
  if (normalizeWithdrawalStatus(request.status) !== "proof_submitted") {
    throw new AppError("Proof has not been submitted for this request", 400);
  }
  if (!request.assignedAgentId)
    throw new AppError("No payroll agent assigned", 400);
  if (!request.proofUrl) throw new AppError("Missing payment proof", 400);

  const existingLedger = await prisma.payrollLedgerEntry.findUnique({
    where: { withdrawalRequestId: id },
  });
  if (existingLedger) {
    throw new AppError("Withdrawal already verified and ledger recorded", 400);
  }

  let totalCredited = 0;
  let agentNewBalance = 0;
  const updated = await prisma.$transaction(async (tx) => {
    const settlement = await settlePayrollAgent(tx, request);
    totalCredited = settlement.totalCredited;
    agentNewBalance = settlement.agentNewBalance;

    if (!settlement.settled) {
      throw new AppError("Failed to record payroll settlement", 500);
    }

    return tx.withdrawalRequest.update({
      where: { id },
      data: {
        status: "completed",
        verifiedByAdminId: adminId,
        verifiedAt: new Date(),
        processedAt: new Date(),
      },
      include: withdrawalListInclude,
    });
  }, { timeout: TX_TIMEOUT_MS });

  if (totalCredited > 0) {
    walletService.emitWalletBeansUpdated(request.assignedAgentId!, {
      beansAdded: totalCredited,
      newBalance: agentNewBalance,
      reference: "withdrawal_agent_payout",
    });
  }

  emitAdminDataChanged("withdrawals", { withdrawalId: id, status: "completed" });
  scheduleWithdrawalSuccess(id);

  await logAdminAction(
    adminId,
    "withdrawal.verify_proof",
    "WithdrawalRequest",
    id,
    {
      agentUserId: request.assignedAgentId,
      beansAmount: Number(request.beansAmount),
      proofUrl: request.proofUrl,
    },
    ip,
  );

  return serializeAdminWithdrawal(updated);
}

// ── Manual Balance Adjustment ─────────────────────────────────────────────────

export async function adjustBalance(
  adminId: string,
  userId: string,
  currency: "coins" | "beans",
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  const { logAdminAction } = await import("../../../utils/audit");

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new AppError("Wallet not found", 404);

  const balanceField = currency === "coins" ? "coinBalance" : "beanBalance";
  const currentBalance = Number(wallet[balanceField]);
  const newBalance = currentBalance + amount;
  if (newBalance < 0)
    throw new AppError("Adjustment would result in negative balance", 400);

  const txType = amount >= 0 ? "credit" : "debit";

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { [balanceField]: newBalance },
    }),
    prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: txType,
        currency,
        amount: Math.abs(amount),
        balanceAfter: newBalance,
        reference: "admin_adjustment",
        description: reason || "Manual admin balance adjustment",
      },
    }),
  ]);

  await logAdminAction(
    adminId,
    "wallet.adjust",
    "Wallet",
    wallet.id,
    { currency, amount, reason },
    ipAddress,
  );
  return { userId, currency, amount, newBalance, reason };
}

// ── Seller Recharge Requests ──────────────────────────────────────────────────

export async function listSellerRecharges(
  params: ListParams & { status?: string; userId?: string },
) {
  const {
    page,
    limit,
    search,
    status,
    userId,
    sort = "createdAt",
    order = "desc",
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.SellerRechargeRequestWhereInput = {};
  if (status) where.status = status;
  if (userId) {
    where.sellerId = userId;
  } else if (search) {
    where.seller = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { hakaId: { contains: search, mode: "insensitive" } },
        { activeSpecialId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [items, total] = await Promise.all([
    prisma.sellerRechargeRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        seller: {
          select: { id: true, displayName: true, hakaId: true, avatar: true },
        },
      },
    }),
    prisma.sellerRechargeRequest.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function approveSellerRecharge(id: string, adminId: string) {
  const request = await prisma.sellerRechargeRequest.findUnique({
    where: { id },
  });
  if (!request) throw new AppError("Request not found", 404);
  if (request.status !== "pending")
    throw new AppError("Request is not pending", 400);

  let newBalance = 0;

  await prisma.$transaction(async (tx) => {
    const profile = await tx.coinSellerProfile.upsert({
      where: { userId: request.sellerId },
      create: {
        userId: request.sellerId,
        availableBalance: request.coinsToCredit,
        totalBalance: request.coinsToCredit,
      },
      update: {
        availableBalance: { increment: request.coinsToCredit },
        totalBalance: { increment: request.coinsToCredit },
      },
    });
    newBalance = Number(profile.availableBalance);

    await tx.coinSellerTransaction.create({
      data: {
        sellerId: request.sellerId,
        transactionType: "recharge",
        coinsAmount: request.coinsToCredit,
        notes: `Funded recharge — $${request.amountUsd} via ${request.paymentMethod}`,
      },
    });
    await tx.sellerRechargeRequest.update({
      where: { id },
      data: {
        status: "approved",
        processedAt: new Date(),
        processedById: adminId,
      },
    });
  });

  void notifySellerRechargeApproved({
    sellerId: request.sellerId,
    rechargeId: id,
    coinsAdded: Number(request.coinsToCredit),
    amountUsd: Number(request.amountUsd),
    newBalance,
  });

  return prisma.sellerRechargeRequest.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, displayName: true, hakaId: true } },
    },
  });
}

export async function rejectSellerRecharge(
  id: string,
  adminId: string,
  notes: string,
) {
  const request = await prisma.sellerRechargeRequest.findUnique({
    where: { id },
  });
  if (!request) throw new AppError("Request not found", 404);
  if (request.status !== "pending")
    throw new AppError("Request is not pending", 400);

  const updated = await prisma.sellerRechargeRequest.update({
    where: { id },
    data: {
      status: "rejected",
      adminNotes: notes,
      processedAt: new Date(),
      processedById: adminId,
    },
    include: {
      seller: { select: { id: true, displayName: true, hakaId: true } },
    },
  });

  emitAdminDataChanged("seller_recharges", { rechargeId: id, status: "rejected" });
  return updated;
}

// ── Seller exchange requests (wallet points → seller offline coins) ─────────────

export async function listSellerExchangeRequests(
  params: ListParams & { status?: string; userId?: string },
) {
  const {
    page,
    limit,
    search,
    status,
    userId,
    sort = "createdAt",
    order = "desc",
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.SellerExchangeRequestWhereInput = {};
  if (status) where.status = status;
  if (userId) {
    where.sellerId = userId;
  } else if (search) {
    where.seller = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { hakaId: { contains: search, mode: "insensitive" } },
        { activeSpecialId: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [items, total] = await Promise.all([
    prisma.sellerExchangeRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        seller: {
          select: { id: true, displayName: true, hakaId: true, avatar: true },
        },
      },
    }),
    prisma.sellerExchangeRequest.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function approveSellerExchange(
  id: string,
  adminId: string,
  ip?: string,
) {
  const pending = await prisma.sellerExchangeRequest.findUnique({
    where: { id },
  });
  if (!pending) throw new AppError("Request not found", 404);
  if (pending.status !== "pending")
    throw new AppError("Request is not pending", 400);

  await assertNoRiskBlock(pending.sellerId, "freezeBeans");

  let newSellerBalance = 0;
  let newBeanBalance = 0;

  await prisma.$transaction(
    async (tx) => {
      const request = await tx.sellerExchangeRequest.findUnique({
        where: { id },
      });
      if (!request || request.status !== "pending")
        throw new AppError("Request is not pending", 400);

      const balances = await applySellerPointsExchangeWithinTx(tx, {
        sellerId: request.sellerId,
        pointsAmount: Number(request.pointsAmount),
        exchangeRequestId: id,
        coinSellerTransactionNotes: `Points exchange approved (request ${id})`,
      });
      newBeanBalance = balances.newBeanBalance;
      newSellerBalance = balances.newSellerBalance;

      await tx.sellerExchangeRequest.update({
        where: { id },
        data: {
          status: "approved",
          processedAt: new Date(),
          processedById: adminId,
        },
      });
    },
    { timeout: TX_TIMEOUT_MS },
  );

  try {
    getIO().to(`user:${pending.sellerId}`).emit("seller:exchange_approved", {
      exchangeId: id,
      pointsAmount: Number(pending.pointsAmount),
      newSellerBalance,
      newBeanBalance,
    });
  } catch {
    // Socket.io not yet initialised (e.g. test env)
  }

  emitAdminDataChanged("seller_exchanges", { exchangeId: id, status: "approved" });

  await logAdminAction(
    adminId,
    "seller.exchange.approve",
    "SellerExchangeRequest",
    id,
    { points: Number(pending.pointsAmount) },
    ip,
  );

  return prisma.sellerExchangeRequest.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, displayName: true, hakaId: true } },
    },
  });
}

export async function rejectSellerExchange(
  id: string,
  adminId: string,
  notes: string,
  ip?: string,
) {
  const request = await prisma.sellerExchangeRequest.findUnique({
    where: { id },
  });
  if (!request) throw new AppError("Request not found", 404);
  if (request.status !== "pending")
    throw new AppError("Request is not pending", 400);

  const updated = await prisma.sellerExchangeRequest.update({
    where: { id },
    data: {
      status: "rejected",
      adminNotes: notes,
      processedAt: new Date(),
      processedById: adminId,
    },
    include: {
      seller: { select: { id: true, displayName: true, hakaId: true } },
    },
  });

  emitAdminDataChanged("seller_exchanges", { exchangeId: id, status: "rejected" });

  await logAdminAction(
    adminId,
    "seller.exchange.reject",
    "SellerExchangeRequest",
    id,
    { notes },
    ip,
  );
  return updated;
}

export async function freezeWithdrawal(
  id: string,
  adminId: string,
  ip: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);
  if (isTerminalWithdrawalStatus(request.status)) {
    throw new AppError("Cannot freeze a finalized withdrawal", 400);
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: { frozenByAdminId: adminId },
    include: withdrawalListInclude,
  });

  await logAdminAction(
    adminId,
    "withdrawal.freeze",
    "WithdrawalRequest",
    id,
    {},
    ip,
  );

  return serializeAdminWithdrawal(updated);
}

export async function rejectWithdrawal(
  id: string,
  adminNotes: string,
  adminId: string,
  ip: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);
  if (isTerminalWithdrawalStatus(request.status)) {
    throw new AppError("Request is already finalized", 400);
  }
  if (!isActiveWithdrawalStatus(request.status)) {
    throw new AppError("Request cannot be rejected in its current state", 400);
  }

  await walletService.creditBeans(
    request.userId,
    Number(request.beansAmount),
    "withdrawal_rejected",
    `Withdrawal rejected — beans returned (request ${id})`,
  );

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      status: "rejected",
      adminRejectionNotes: adminNotes,
      processedAt: new Date(),
    },
    include: withdrawalListInclude,
  });

  emitAdminDataChanged("withdrawals", { withdrawalId: id, status: "rejected" });

  await logAdminAction(
    adminId,
    "withdrawal.reject",
    "WithdrawalRequest",
    id,
    {
      adminNotes,
      beansReturned: Number(request.beansAmount),
    },
    ip,
  );

  return serializeAdminWithdrawal(updated);
}

export async function disputeWithdrawal(
  id: string,
  reason: string,
  adminId: string,
  ip: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw new AppError("Withdrawal request not found", 404);
  if (isTerminalWithdrawalStatus(request.status)) {
    throw new AppError("Cannot dispute a finalised withdrawal", 400);
  }
  if (request.status === "disputed") {
    throw new AppError("Withdrawal is already disputed", 400);
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      status: "disputed",
      disputedAt: new Date(),
      disputedByUserId: adminId,
      disputeReason: reason,
    },
    include: withdrawalListInclude,
  });

  emitAdminDataChanged("withdrawals", { withdrawalId: id, status: "disputed" });
  await logAdminAction(adminId, "withdrawal.dispute", "WithdrawalRequest", id, { reason }, ip);
  return serializeAdminWithdrawal(updated);
}
