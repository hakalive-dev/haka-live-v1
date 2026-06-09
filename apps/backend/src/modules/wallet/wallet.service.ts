import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { getIO } from '../../sockets';
import { assertNoRiskBlock } from '../../utils/risk-control';
import { createAdminNotification } from '../admin/notifications/admin-notifications.service';
import {
  scheduleWalletCoinsNotify,
  type WalletCoinsNotifyOptions,
} from '../chat/haka-team-coins-notify.service';

const TX_TIMEOUT = 15_000; // 15s — handles cold DB connections

export type TxClient = Prisma.TransactionClient;

/**
 * Get or create a wallet for a user.
 */
export async function getOrCreateWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/**
 * Get wallet balance.
 */
export async function getBalance(userId: string) {
  const wallet = await getOrCreateWallet(userId);
  return {
    coinBalance: Number(wallet.coinBalance),
    beanBalance: Number(wallet.beanBalance),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

/**
 * Get paginated transaction history.
 */
export async function getTransactions(userId: string, page: number, limit: number) {
  const wallet = await getOrCreateWallet(userId);

  const where = { walletId: wallet.id };
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/** Bean ledger references shown on mobile Withdraw → Record. */
export const BEAN_RECORD_REFERENCES = [
  'gift_received',
  'gift_commission',
  'exchange',
  'withdrawal_hold',
  'withdrawal_rejected',
  'withdrawal_agent_payout',
  'withdrawal_agent_commission',
] as const;

const HOST_BEAN_SHARE = 0.7;

function beanRecordCategory(
  reference: string,
):
  | 'gift_received'
  | 'creator_commission'
  | 'exchange'
  | 'withdrawal'
  | 'payroll_payout'
  | 'payroll_commission' {
  if (reference === 'gift_received') return 'gift_received';
  if (reference === 'gift_commission') return 'creator_commission';
  if (reference === 'exchange') return 'exchange';
  if (reference === 'withdrawal_agent_payout') return 'payroll_payout';
  if (reference === 'withdrawal_agent_commission') return 'payroll_commission';
  return 'withdrawal';
}

function hostShareBeans(beanValue: number): number {
  return Math.floor(beanValue * HOST_BEAN_SHARE);
}

/** Parse seed/demo descriptions: "Received Magic Lamp 🧞 from Raj Kumar" */
function parseLegacyGiftDescription(description: string): {
  giftName: string;
  senderName: string;
} | null {
  const m = description.match(/^Received\s+(.+?)\s+from\s+(.+)$/i);
  if (!m) return null;
  return { giftName: m[1].trim(), senderName: m[2].trim() };
}

function giftIconFromName(name: string, icon: string): string {
  if (icon.trim()) return icon.trim();
  const emojiMatch = name.match(/(\p{Extended_Pictographic}+)\s*$/u);
  return emojiMatch ? emojiMatch[1] : '';
}

async function enrichGiftReceivedRecords(
  userId: string,
  items: Array<{
    id: string;
    amount: number | bigint;
    description: string;
    createdAt: Date;
    reference: string;
  }>,
) {
  const giftTxs = items.filter((t) => t.reference === 'gift_received');
  if (giftTxs.length === 0) return new Map<string, Record<string, unknown>>();

  const candidates = await prisma.giftTransaction.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      gift: { select: { name: true, icon: true, image: true } },
      sender: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatar: true,
          hakaId: true,
          activeSpecialId: true,
        },
      },
    },
  });

  const usedGiftIds = new Set<string>();
  const byWalletTxId = new Map<string, Record<string, unknown>>();

  for (const tx of giftTxs) {
    const amount = Number(tx.amount);
    const txTime = tx.createdAt.getTime();
    let match = candidates.find(
      (g) =>
        !usedGiftIds.has(g.id)
        && hostShareBeans(g.beanValue) === amount
        && Math.abs(g.createdAt.getTime() - txTime) <= 15_000,
    );
    if (!match) {
      match = candidates.find(
        (g) =>
          !usedGiftIds.has(g.id)
          && hostShareBeans(g.beanValue) === amount
          && Math.abs(g.createdAt.getTime() - txTime) <= 120_000,
      );
    }
    if (match) {
      usedGiftIds.add(match.id);
      const sender = match.sender;
      const publicId = sender.activeSpecialId ?? sender.hakaId ?? '';
      byWalletTxId.set(tx.id, {
        gift_name: match.gift.name,
        gift_icon: giftIconFromName(match.gift.name, match.gift.icon),
        gift_image_url: match.gift.image,
        gift_qty: match.qty,
        sender_id: sender.id,
        sender_display_name: sender.displayName || sender.username || 'User',
        sender_haka_id: publicId,
        sender_avatar: sender.avatar || null,
      });
      continue;
    }

    const legacy = parseLegacyGiftDescription(tx.description);
    if (legacy) {
      byWalletTxId.set(tx.id, {
        gift_name: legacy.giftName,
        gift_icon: giftIconFromName(legacy.giftName, ''),
        gift_image_url: null,
        gift_qty: 1,
        sender_id: '',
        sender_display_name: legacy.senderName,
        sender_haka_id: '',
        sender_avatar: null,
      });
    }
  }

  return byWalletTxId;
}

function normalizeWithdrawalStatus(status: string): string {
  if (status === 'pending') return 'pending_review';
  return status;
}

function formatBeanRecord(
  tx: {
    id: string;
    transactionType: string;
    amount: number | bigint;
    balanceAfter: number | bigint;
    reference: string;
    description: string;
    createdAt: Date;
  },
  withdrawalStatus: string | null,
  giftIncome: Record<string, unknown> | null,
  withdrawalId: string | null = null,
  orderId: string | null = null,
) {
  return {
    id: tx.id,
    transactionType: tx.transactionType,
    amount: Number(tx.amount),
    balanceAfter: Number(tx.balanceAfter),
    reference: tx.reference,
    description: tx.description,
    createdAt: tx.createdAt.toISOString(),
    category: beanRecordCategory(tx.reference),
    withdrawalStatus,
    withdrawalId,
    orderId,
    gift_income: giftIncome,
  };
}

/**
 * Paginated bean activity for Withdraw → Record: gifts received, exchanges, withdrawals.
 */
export async function getBeanRecords(userId: string, page: number, limit: number) {
  const wallet = await getOrCreateWallet(userId);

  const where = {
    walletId: wallet.id,
    currency: 'beans' as const,
    reference: { in: [...BEAN_RECORD_REFERENCES] },
  };

  const [items, total, withdrawalRequests] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.walletTransaction.count({ where }),
    prisma.withdrawalRequest.findMany({
      where: { userId },
      select: { id: true, orderId: true, beansAmount: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const resolveWithdrawalInfo = (
    tx: (typeof items)[number],
  ): { status: string | null; withdrawalId: string | null; orderId: string | null } => {
    if (tx.reference === 'withdrawal_rejected') {
      return { status: 'rejected', withdrawalId: null, orderId: null };
    }
    if (tx.reference !== 'withdrawal_hold') {
      return { status: null, withdrawalId: null, orderId: null };
    }

    const txAmount = Number(tx.amount);
    const txTime = tx.createdAt.getTime();
    for (const wr of withdrawalRequests) {
      if (Number(wr.beansAmount) !== txAmount) continue;
      if (Math.abs(wr.createdAt.getTime() - txTime) <= 60_000) {
        const orderId = wr.orderId?.trim() || null;
        return {
          status: normalizeWithdrawalStatus(wr.status),
          withdrawalId: wr.id,
          orderId,
        };
      }
    }
    return { status: 'pending_review', withdrawalId: null, orderId: null };
  };

  const giftIncomeByTxId = await enrichGiftReceivedRecords(userId, items);

  return {
    items: items.map((tx) => {
      const { status, withdrawalId, orderId } = resolveWithdrawalInfo(tx);
      return formatBeanRecord(
        tx,
        status,
        giftIncomeByTxId.get(tx.id) ?? null,
        withdrawalId,
        orderId,
      );
    }),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Tx-scoped coin credit — no Haka Team notify. Prefer {@link creditCoins} or
 * {@link creditCoinsInTransaction} so post-commit DM + push are not skipped.
 */
export async function creditCoinsInTx(
  tx: TxClient,
  userId: string,
  amount: number,
  reference: string,
  description: string,
  _options?: WalletCoinsNotifyOptions,
) {
  if (amount <= 0) throw new AppError('Amount must be positive');

  const [wallet] = await tx.$queryRaw<Array<{ id: string; coinBalance: bigint }>>`
    SELECT id, "coinBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
  `;
  if (!wallet) {
    const created = await tx.wallet.create({ data: { userId } });
    const updated = await tx.wallet.update({
      where: { id: created.id },
      data: { coinBalance: amount },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: created.id,
        transactionType: 'credit',
        currency: 'coins',
        amount,
        balanceAfter: amount,
        reference,
        description,
      },
    });
    return updated;
  }

  const newBalance = Number(wallet.coinBalance) + amount;
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { coinBalance: newBalance },
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: 'credit',
      currency: 'coins',
      amount,
      balanceAfter: newBalance,
      reference,
      description,
    },
  });

  return updated;
}

function scheduleCoinCreditNotify(
  userId: string,
  amount: number,
  wallet: { coinBalance: bigint | number },
  reference: string,
  description: string,
  options?: WalletCoinsNotifyOptions,
) {
  scheduleWalletCoinsNotify({
    userId,
    coinsAmount: amount,
    newBalance: Number(wallet.coinBalance),
    reference,
    description,
    notifyMeta: options?.notifyMeta,
    skipHakaTeamNotify: options?.skipHakaTeamNotify,
  });
}

/**
 * Atomic coin credit with optional sibling writes in the same transaction.
 * Always schedules Haka Team DM + push after commit (unless skipHakaTeamNotify).
 */
export async function creditCoinsInTransaction<T>(opts: {
  userId: string;
  amount: number;
  reference: string;
  description: string;
  notifyOptions?: WalletCoinsNotifyOptions;
  timeout?: number;
  runInTransaction: (tx: TxClient) => Promise<T>;
}): Promise<{ wallet: Awaited<ReturnType<typeof creditCoinsInTx>>; result: T }> {
  const { userId, amount, reference, description, notifyOptions, timeout, runInTransaction } =
    opts;

  const { wallet, result } = await prisma.$transaction(
    async (tx) => {
      const result = await runInTransaction(tx);
      const wallet = await creditCoinsInTx(
        tx,
        userId,
        amount,
        reference,
        description,
        notifyOptions,
      );
      return { wallet, result };
    },
    { timeout: timeout ?? TX_TIMEOUT },
  );

  scheduleCoinCreditNotify(userId, amount, wallet, reference, description, notifyOptions);
  return { wallet, result };
}

/** Credit coins in a standalone transaction + Haka Team notify. */
export async function creditCoins(
  userId: string,
  amount: number,
  reference: string,
  description: string,
  options?: WalletCoinsNotifyOptions,
) {
  const { wallet } = await creditCoinsInTransaction({
    userId,
    amount,
    reference,
    description,
    notifyOptions: options,
    runInTransaction: async () => undefined,
  });
  return wallet;
}

/**
 * Debit coins from a user's wallet (atomic with row-level locking).
 * Used by: sending gifts.
 */
export async function debitCoins(
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  if (amount <= 0) throw new AppError('Amount must be positive');

  return prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw<Array<{ id: string; coinBalance: bigint }>>`
      SELECT id, "coinBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (!wallet) throw new AppError('Wallet not found', 404);
    if (Number(wallet.coinBalance) < amount) throw new AppError('Insufficient coins', 400);

    const newBalance = Number(wallet.coinBalance) - amount;
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { coinBalance: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'debit',
        currency: 'coins',
        amount,
        balanceAfter: newBalance,
        reference,
        description,
      },
    });

    return updated;
  }, { timeout: TX_TIMEOUT });
}

/**
 * Credit beans to a user's wallet (atomic with row-level locking).
 * Used by: receiving gifts (distributeBeans).
 */
export async function creditBeans(
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  if (amount <= 0) throw new AppError('Amount must be positive');

  return prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw<Array<{ id: string; beanBalance: bigint }>>`
      SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (!wallet) {
      const created = await tx.wallet.create({ data: { userId } });
      const updated = await tx.wallet.update({
        where: { id: created.id },
        data: { beanBalance: amount },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: created.id,
          transactionType: 'credit',
          currency: 'beans',
          amount,
          balanceAfter: amount,
          reference,
          description,
        },
      });
      return updated;
    }

    const newBalance = Number(wallet.beanBalance) + amount;
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { beanBalance: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'credit',
        currency: 'beans',
        amount,
        balanceAfter: newBalance,
        reference,
        description,
      },
    });

    return updated;
  }, { timeout: TX_TIMEOUT });
}

/** Credit beans inside an existing Prisma transaction (e.g. payroll commission). */
export async function creditBeansInTx(
  tx: TxClient,
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  if (amount <= 0) return null;

  const [wallet] = await tx.$queryRaw<Array<{ id: string; beanBalance: bigint }>>`
    SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
  `;
  if (!wallet) {
    const created = await tx.wallet.create({ data: { userId, beanBalance: amount } });
    await tx.walletTransaction.create({
      data: {
        walletId: created.id,
        transactionType: 'credit',
        currency: 'beans',
        amount,
        balanceAfter: amount,
        reference,
        description,
      },
    });
    return created;
  }

  const newBalance = Number(wallet.beanBalance) + amount;
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { beanBalance: newBalance },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: 'credit',
      currency: 'beans',
      amount,
      balanceAfter: newBalance,
      reference,
      description,
    },
  });
  return updated;
}

export function emitWalletBeansUpdated(
  userId: string,
  payload: { beansAdded: number; newBalance: number; reference: string },
) {
  getIO().to(`user:${userId}`).emit('wallet:beans_updated', payload);
}

/**
 * Debit beans from a user's wallet (atomic with row-level locking).
 * Used by: withdrawal.
 */
export async function debitBeans(
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  if (amount <= 0) throw new AppError('Amount must be positive');

  return prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw<Array<{ id: string; beanBalance: bigint }>>`
      SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (!wallet) throw new AppError('Wallet not found', 404);
    if (Number(wallet.beanBalance) < amount) throw new AppError('Insufficient beans', 400);

    const newBalance = Number(wallet.beanBalance) - amount;
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { beanBalance: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'debit',
        currency: 'beans',
        amount,
        balanceAfter: newBalance,
        reference,
        description,
      },
    });

    return updated;
  }, { timeout: TX_TIMEOUT });
}

/**
 * Top-up coins directly (dev/agent manual top-up — no payment gateway).
 */
export async function topUp(userId: string, coins: number) {
  if (coins <= 0) throw new AppError('Coins must be positive');
  const wallet = await creditCoins(userId, coins, 'top_up', `Manual top-up of ${coins.toLocaleString()} coins`);
  return {
    coinBalance: wallet.coinBalance,
    coinsAdded: coins,
  };
}

/**
 * Request a bean withdrawal. Holds beans (debit) until payout is verified or the request is rejected.
 */
export async function requestWithdrawal(
  userId: string,
  beans: number,
  notes: string,
  countryCode: string,
  paymentMethodId: string,
  ipAddress: string = '',
) {
  await assertNoRiskBlock(userId, 'freezeBeans');
  if (beans <= 0) throw new AppError('Beans must be positive');
  if (!countryCode?.trim()) throw new AppError('Withdrawal country is required', 400);
  if (!paymentMethodId?.trim()) throw new AppError('Payment method is required', 400);

  const { assertActiveCountry, computeLocalAmount } = await import('../payments/currency.service');
  const { buildPayoutSnapshotFromMethod } = await import('../payroll-agent/payout-snapshot');
  const {
    WITHDRAWAL_MIN_BEANS,
    WITHDRAWAL_BEAN_STEP,
  } = await import('../../shared-types/withdrawal-limits');
  const rateRow = await assertActiveCountry(countryCode);
  await assertWithdrawalsNotFrozen(rateRow.countryCode);
  const beansNum = Number(beans);
  if (beansNum % WITHDRAWAL_BEAN_STEP !== 0) {
    throw new AppError(
      `Withdrawal amount must be in multiples of ${WITHDRAWAL_BEAN_STEP} beans`,
      400,
    );
  }
  const minBeans = Math.max(WITHDRAWAL_MIN_BEANS, rateRow.minWithdrawalBeans);
  if (beansNum < minBeans) {
    throw new AppError(
      `Minimum withdrawal is ${minBeans.toLocaleString()} beans`,
      400,
    );
  }

  const paymentMethod = await prisma.userPaymentMethod.findFirst({
    where: { id: paymentMethodId, userId },
  });
  if (!paymentMethod) throw new AppError('Payment method not found', 404);
  if (paymentMethod.countryCode.toUpperCase() !== rateRow.countryCode.toUpperCase()) {
    throw new AppError('Payment method does not match withdrawal country', 400);
  }

  await assertWithdrawalDailyLimit(userId, beansNum);
  await assertWithdrawalDailyCount(userId);

  const kycRequired = await getWithdrawalKycRequired();
  if (kycRequired) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { faceVerificationStatus: true },
    });
    if (user?.faceVerificationStatus !== 'approved') {
      throw new AppError('Face verification must be approved before withdrawing', 403);
    }
  }

  const usdRate = rateRow.usdRate.toNumber();
  const localAmount = computeLocalAmount(beansNum, usdRate);
  const payoutSnapshot = buildPayoutSnapshotFromMethod(paymentMethod);
  const ipRiskFlagged = await checkIpRiskFlag(ipAddress);
  const { generateUniqueWithdrawalOrderId } = await import('../../utils/withdrawal-order-id');
  const orderId = await generateUniqueWithdrawalOrderId();

  await debitBeans(
    userId,
    beans,
    'withdrawal_hold',
    `Withdrawal hold: ${beans.toLocaleString()} beans (pending payroll payout)`,
  );

  const request = await prisma.withdrawalRequest.create({
    data: {
      orderId,
      userId,
      beansAmount: beans,
      notes,
      countryCode: rateRow.countryCode,
      currency: rateRow.currency,
      localAmount,
      usdRateAtRequest: usdRate,
      paymentMethodId,
      payoutSnapshot,
      ipAddress,
      ipRiskFlagged,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { preferredWithdrawalCountryCode: rateRow.countryCode },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  await createAdminNotification({
    type: 'withdrawal_requested',
    title: 'New withdrawal request',
    body: `${user?.displayName ?? 'User'} requested ${beans.toLocaleString()} beans`,
    linkPath: '/withdrawals',
    entityType: 'WithdrawalRequest',
    entityId: request.id,
  });

  return request;
}

async function assertWithdrawalsNotFrozen(countryCode: string) {
  const code = (countryCode || '').trim().toUpperCase();
  if (!code) return;

  const freeze = await prisma.adminWithdrawalFreeze.findUnique({
    where: { countryCode: code },
    select: { isFrozen: true, reason: true },
  });

  if (freeze?.isFrozen) {
    throw new AppError(
      freeze.reason?.trim()
        ? `Withdrawals are temporarily disabled in this region: ${freeze.reason.trim()}`
        : 'Withdrawals are temporarily disabled in this region',
      403,
    );
  }
}

/**
 * Get withdrawal history for a user.
 */
export async function getWithdrawals(userId: string, page: number, limit: number) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export async function getWithdrawalDetail(userId: string, withdrawalId: string) {
  const { parsePayoutSnapshot } = await import('../payroll-agent/payout-snapshot');
  const { payoutDisplayRows } = await import('../../shared-types/payout-display');
  const { normalizeWithdrawalStatus } = await import('../../shared-types/withdrawal-status');

  const row = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      assignedAgent: { select: { displayName: true } },
    },
  });
  if (!row || row.userId !== userId) {
    throw new AppError('Withdrawal request not found', 404);
  }

  const snap = parsePayoutSnapshot(row.payoutSnapshot);
  const status = normalizeWithdrawalStatus(row.status);
  const showProof = status === 'completed' || status === 'approved';

  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    beansAmount: Number(row.beansAmount),
    localAmount: row.localAmount != null ? Number(row.localAmount) : null,
    currency: row.currency,
    countryCode: row.countryCode,
    payout: snap,
    accountRows: payoutDisplayRows(snap),
    proofUrl: showProof && row.proofUrl ? row.proofUrl : null,
    agentDisplayName: row.assignedAgent?.displayName ?? null,
    userConfirmedAt: row.userConfirmedAt?.toISOString() ?? null,
    userConfirmAutoAt: row.userConfirmAutoAt?.toISOString() ?? null,
    proofUploadedAt: row.proofUploadedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
  };
}

export async function confirmWithdrawalReceipt(userId: string, withdrawalId: string) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!request || request.userId !== userId) {
    throw new AppError('Withdrawal request not found', 404);
  }
  const { normalizeWithdrawalStatus } = await import('../../shared-types/withdrawal-status');
  const status = normalizeWithdrawalStatus(request.status);
  if (status !== 'proof_submitted') {
    throw new AppError('This withdrawal is not awaiting receipt confirmation', 400);
  }
  if (request.userConfirmedAt) {
    return request;
  }

  return prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: { userConfirmedAt: new Date() },
  });
}

/** Auto-acknowledge receipt after 2h (cron). Does not complete the withdrawal. */
export async function runWithdrawalAutoConfirm(): Promise<number> {
  const cutoff = new Date();
  const rows = await prisma.withdrawalRequest.findMany({
    where: {
      status: 'proof_submitted',
      userConfirmedAt: null,
      userConfirmAutoAt: { lte: cutoff },
    },
    take: 200,
    select: { id: true },
  });

  if (rows.length === 0) return 0;

  await prisma.withdrawalRequest.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { userConfirmedAt: new Date() },
  });

  return rows.length;
}

/**
 * Exchange beans for coins (atomic).
 * Rate: 1 bean = 1 coin
 */
export async function exchangeBeansToCoins(userId: string, beansToSpend: number) {
  if (beansToSpend <= 0) throw new AppError('Amount must be positive');
  await assertNoRiskBlock(userId, 'freezeBeans');

  const coinsToGain = beansToSpend; // 1 bean = 1 coin

  const { wallet, newBeanBalance } = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; beanBalance: bigint }>>`
      SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (!locked) throw new AppError('Wallet not found', 404);
    if (Number(locked.beanBalance) < beansToSpend) throw new AppError('Insufficient beans', 400);

    const newBeanBalance = Number(locked.beanBalance) - beansToSpend;
    await tx.wallet.update({
      where: { id: locked.id },
      data: { beanBalance: newBeanBalance },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: locked.id,
        transactionType: 'debit',
        currency: 'beans',
        amount: beansToSpend,
        balanceAfter: newBeanBalance,
        reference: 'exchange',
        description: `Exchanged ${beansToSpend.toLocaleString()} beans → ${coinsToGain.toLocaleString()} coins`,
      },
    });

    const wallet = await creditCoinsInTx(
      tx,
      userId,
      coinsToGain,
      'bean_exchange',
      `Received ${coinsToGain.toLocaleString()} coins from bean exchange`,
    );

    return { wallet, newBeanBalance };
  }, { timeout: TX_TIMEOUT });

  scheduleCoinCreditNotify(
    userId,
    coinsToGain,
    wallet,
    'bean_exchange',
    `Received ${coinsToGain.toLocaleString()} coins from bean exchange`,
  );

  return {
    beansSpent: beansToSpend,
    coinsEarned: coinsToGain,
    coinBalance: Number(wallet.coinBalance),
    beanBalance: newBeanBalance,
  };
}

const DEFAULT_DAILY_WITHDRAWAL_BEANS = 5_000_000;

async function getWithdrawalKycRequired(): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'withdrawal_kyc_required' },
  });
  return row?.value === true || row?.value === 'true';
}

async function getDailyWithdrawalLimitBeans(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'withdrawal_daily_limit_beans' },
  });
  if (row?.value == null) return DEFAULT_DAILY_WITHDRAWAL_BEANS;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_WITHDRAWAL_BEANS;
}

async function assertWithdrawalDailyLimit(userId: string, beans: number): Promise<void> {
  const limit = await getDailyWithdrawalLimitBeans();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const agg = await prisma.withdrawalRequest.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfDay },
      status: { notIn: ['rejected'] },
    },
    _sum: { beansAmount: true },
  });
  const used = Number(agg._sum.beansAmount ?? 0);
  if (used + beans > limit) {
    throw new AppError(
      `Daily withdrawal limit exceeded (${limit.toLocaleString()} beans per day)`,
      400,
    );
  }
}

const DEFAULT_DAILY_WITHDRAWAL_COUNT = 3;
const DEFAULT_IP_MAX_PER_DAY = 5;

async function getDailyWithdrawalCount(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'withdrawal_daily_count' },
  });
  if (row?.value == null) return DEFAULT_DAILY_WITHDRAWAL_COUNT;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_WITHDRAWAL_COUNT;
}

async function assertWithdrawalDailyCount(userId: string): Promise<void> {
  const limit = await getDailyWithdrawalCount();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const count = await prisma.withdrawalRequest.count({
    where: {
      userId,
      createdAt: { gte: startOfDay },
      status: { notIn: ['rejected'] },
    },
  });
  if (count >= limit) {
    throw new AppError(
      `Daily withdrawal count limit reached (${limit} per day)`,
      429,
    );
  }
}

async function getIpMaxPerDay(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'withdrawal_ip_max_per_day' },
  });
  if (row?.value == null) return DEFAULT_IP_MAX_PER_DAY;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IP_MAX_PER_DAY;
}

async function checkIpRiskFlag(ipAddress: string): Promise<boolean> {
  if (!ipAddress) return false;
  const limit = await getIpMaxPerDay();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.withdrawalRequest.count({
    where: { ipAddress, createdAt: { gte: since } },
  });
  return count >= limit;
}

export async function userDisputeWithdrawal(
  userId: string,
  withdrawalId: string,
  reason: string,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!request || request.userId !== userId) {
    throw new AppError('Withdrawal request not found', 404);
  }
  if (request.status !== 'completed') {
    throw new AppError('You can only dispute completed withdrawals', 400);
  }
  if (request.disputedAt) {
    throw new AppError('This withdrawal has already been disputed', 400);
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      status: 'disputed',
      disputedAt: new Date(),
      disputedByUserId: userId,
      disputeReason: reason,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  await createAdminNotification({
    type: 'withdrawal_disputed',
    title: 'User raised a withdrawal dispute',
    body: `${user?.displayName ?? 'User'} disputed withdrawal ${withdrawalId.slice(0, 8)}… — "${reason}"`,
    linkPath: '/withdrawals',
    entityType: 'WithdrawalRequest',
    entityId: withdrawalId,
  });

  return updated;
}
