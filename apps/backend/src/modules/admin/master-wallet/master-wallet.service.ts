/**
 * Master Wallet Service — Ledger-based coin economy
 *
 * PRINCIPLES:
 * 1. No coin is ever created without a SystemTransaction record
 * 2. No balance is ever directly edited — always through this service
 * 3. Mint requires 2 different super_admins (request → approve)
 * 4. Every credit/deduct routes through MASTER or RECOVERY wallet
 * 5. Every SystemTransaction records fromBalanceAfter + toBalanceAfter
 * 6. Reversals create a counter-transaction (coins are never silently moved)
 */

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { creditCoins, debitCoins } from '../../wallet/wallet.service';

type WalletType = 'MASTER' | 'RECOVERY' | 'BONUS' | 'REVENUE';

// ── Helper: get system wallet with row lock (must be inside $transaction) ─────

async function getWalletLocked(tx: any, type: WalletType) {
  const [row] = await tx.$queryRaw<Array<{ id: string; balance: bigint; walletType: string }>>`
    SELECT id, balance, "walletType" FROM system_wallets WHERE "walletType" = ${type} FOR UPDATE
  `;
  if (!row) throw new AppError(`System wallet ${type} not found — run seed`, 500);
  return row;
}

async function getWallet(type: WalletType) {
  const w = await prisma.systemWallet.findUnique({ where: { walletType: type } });
  if (!w) throw new AppError(`System wallet ${type} not found — run seed`, 500);
  return w;
}

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getOverview() {
  const [wallets, userWalletAgg, pendingMints] = await Promise.all([
    prisma.systemWallet.findMany({ orderBy: { walletType: 'asc' } }),
    prisma.wallet.aggregate({ _sum: { coinBalance: true, beanBalance: true } }),
    prisma.mintRequest.count({ where: { status: 'pending' } }),
  ]);

  const recovery = wallets.find(w => w.walletType === 'RECOVERY');
  const bonus    = wallets.find(w => w.walletType === 'BONUS');
  const revenue  = wallets.find(w => w.walletType === 'REVENUE');
  const master   = wallets.find(w => w.walletType === 'MASTER');

  return {
    wallets: wallets.map(w => ({
      walletType:  w.walletType,
      balance:     w.balance.toString(),
      totalIn:     w.totalIn.toString(),
      totalOut:    w.totalOut.toString(),
    })),
    circulation: {
      totalMinted:   (master?.totalIn  ?? 0n).toString(),
      totalIssued:   (master?.totalOut ?? 0n).toString(),
      userCoins:     String(userWalletAgg._sum.coinBalance ?? 0),
      recoveryCoins: (recovery?.balance ?? 0n).toString(),
      bonusCoins:    (bonus?.balance    ?? 0n).toString(),
      revenueCoins:  (revenue?.balance  ?? 0n).toString(),
    },
    pendingMints,
  };
}

// ── Mint Request (Step 1) — any super_admin can request ───────────────────────

export async function requestMint(adminId: string, amount: number, reason: string, ipAddress?: string) {
  if (amount <= 0) throw new AppError('Amount must be positive', 400);
  if (!reason.trim()) throw new AppError('Reason is required', 400);

  const req = await prisma.mintRequest.create({
    data: { requestedBy: adminId, amount: BigInt(amount), reason: reason.trim() },
  });

  await logAdminAction(adminId, 'master_wallet.request_mint', 'MintRequest', req.id, { amount, reason }, ipAddress);
  return req;
}

// ── Approve Mint (Step 2) — DIFFERENT super_admin must approve ────────────────

export async function approveMint(mintRequestId: string, approverAdminId: string, ipAddress?: string) {
  const req = await prisma.mintRequest.findUnique({ where: { id: mintRequestId } });
  if (!req) throw new AppError('Mint request not found', 404);
  if (req.status !== 'pending') throw new AppError(`Mint request is already ${req.status}`, 400);
  if (req.requestedBy === approverAdminId) {
    throw new AppError('You cannot approve your own mint request — requires a different super_admin', 403);
  }

  const amount = req.amount;

  await prisma.$transaction(async (tx) => {
    const master = await getWalletLocked(tx, 'MASTER');
    const newBalance = master.balance + amount;

    await tx.systemWallet.update({
      where: { walletType: 'MASTER' },
      data: { balance: { increment: amount }, totalIn: { increment: amount } },
    });

    await tx.systemTransaction.create({
      data: {
        toWalletId:      master.id,
        amount,
        txType:          'MINT',
        reason:          req.reason,
        performedBy:     approverAdminId,
        reference:       req.id,
        toBalanceAfter:  newBalance,
      },
    });

    await tx.mintRequest.update({
      where: { id: mintRequestId },
      data: { status: 'approved', approvedBy: approverAdminId },
    });
  });

  await logAdminAction(approverAdminId, 'master_wallet.approve_mint', 'MintRequest', mintRequestId, { amount: amount.toString() }, ipAddress);
  return { approved: true, amount: amount.toString() };
}

// ── Reject Mint ───────────────────────────────────────────────────────────────

export async function rejectMint(mintRequestId: string, adminId: string, rejectReason: string, ipAddress?: string) {
  const req = await prisma.mintRequest.findUnique({ where: { id: mintRequestId } });
  if (!req) throw new AppError('Mint request not found', 404);
  if (req.status !== 'pending') throw new AppError(`Mint request is already ${req.status}`, 400);

  await prisma.mintRequest.update({
    where: { id: mintRequestId },
    data: { status: 'rejected', approvedBy: adminId, rejectReason },
  });

  await logAdminAction(adminId, 'master_wallet.reject_mint', 'MintRequest', mintRequestId, { rejectReason }, ipAddress);
  return { rejected: true };
}

// ── List Mint Requests ─────────────────────────────────────────────────────────

export async function listMintRequests(status?: string) {
  const where: any = {};
  if (status) where.status = status;

  const requests = await prisma.mintRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return requests.map(r => ({
    id:          r.id,
    requestedBy: r.requestedBy,
    approvedBy:  r.approvedBy || null,
    amount:      r.amount.toString(),
    reason:      r.reason,
    status:      r.status,
    rejectReason: r.rejectReason || null,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  }));
}

// ── Transfer between system wallets ──────────────────────────────────────────

export async function transferBetweenWallets(
  adminId: string,
  fromType: WalletType,
  toType: WalletType,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  if (fromType === toType) throw new AppError('Source and destination must differ', 400);
  if (amount <= 0) throw new AppError('Amount must be positive', 400);

  const bigAmt = BigInt(amount);

  await prisma.$transaction(async (tx) => {
    const from = await getWalletLocked(tx, fromType);
    const to   = await tx.systemWallet.findUniqueOrThrow({ where: { walletType: toType } });

    if (from.balance < bigAmt) throw new AppError(`${fromType} wallet has insufficient balance`, 400);

    const fromNewBal = from.balance - bigAmt;
    const toNewBal   = to.balance + bigAmt;

    await tx.systemWallet.update({ where: { walletType: fromType }, data: { balance: { decrement: bigAmt }, totalOut: { increment: bigAmt } } });
    await tx.systemWallet.update({ where: { walletType: toType },   data: { balance: { increment: bigAmt }, totalIn:  { increment: bigAmt } } });

    await tx.systemTransaction.create({
      data: {
        fromWalletId:    from.id,
        toWalletId:      to.id,
        amount:          bigAmt,
        txType:          'TRANSFER',
        reason,
        performedBy:     adminId,
        fromBalanceAfter: fromNewBal,
        toBalanceAfter:   toNewBal,
      },
    });
  });

  await logAdminAction(adminId, 'master_wallet.transfer', 'SystemWallet', `${fromType}->${toType}`, { amount, reason }, ipAddress);
  return { transferred: amount, from: fromType, to: toType };
}

// ── Credit user from Master wallet (Double-entry: MASTER → User) ──────────────

export async function creditUser(
  adminId: string,
  userId: string,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  if (amount <= 0) throw new AppError('Amount must be positive', 400);
  const bigAmt = BigInt(amount);

  // Verify master has enough before any user credit
  const master = await getWallet('MASTER');
  if (master.balance < bigAmt) throw new AppError('Master wallet has insufficient balance. Request a mint first.', 400);

  // Credit user wallet (atomic with FOR UPDATE in wallet.service)
  await creditCoins(userId, amount, 'master_wallet_credit', `Admin credit: ${reason}`);

  // Debit master wallet + record double-entry system tx
  await prisma.$transaction(async (tx) => {
    const m = await getWalletLocked(tx, 'MASTER');
    const newBal = m.balance - bigAmt;
    await tx.systemWallet.update({ where: { walletType: 'MASTER' }, data: { balance: { decrement: bigAmt }, totalOut: { increment: bigAmt } } });
    await tx.systemTransaction.create({
      data: {
        fromWalletId:    m.id,
        amount:          bigAmt,
        txType:          'CREDIT_USER',
        targetUserId:    userId,
        reason,
        performedBy:     adminId,
        fromBalanceAfter: newBal,
      },
    });
  });

  await logAdminAction(adminId, 'master_wallet.credit_user', 'User', userId, { amount, reason }, ipAddress);
  return { credited: amount, userId };
}

// ── Deduct user coins → Recovery wallet (Double-entry: User → RECOVERY) ───────

export async function deductUser(
  adminId: string,
  userId: string,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  if (amount <= 0) throw new AppError('Amount must be positive', 400);
  const bigAmt = BigInt(amount);

  const recovery = await getWallet('RECOVERY');

  // Debit user wallet
  await debitCoins(userId, amount, 'master_wallet_deduct', `Admin deduction: ${reason}`);

  // Credit recovery wallet + record double-entry system tx
  await prisma.$transaction(async (tx) => {
    const r = await getWalletLocked(tx, 'RECOVERY');
    const newBal = r.balance + bigAmt;
    await tx.systemWallet.update({ where: { walletType: 'RECOVERY' }, data: { balance: { increment: bigAmt }, totalIn: { increment: bigAmt } } });
    await tx.systemTransaction.create({
      data: {
        toWalletId:      r.id,
        amount:          bigAmt,
        txType:          'DEDUCT_USER',
        targetUserId:    userId,
        reason,
        performedBy:     adminId,
        toBalanceAfter:  newBal,
      },
    });
  });

  await logAdminAction(adminId, 'master_wallet.deduct_user', 'User', userId, { amount, reason }, ipAddress);
  return { deducted: amount, userId };
}

// ── Reverse a SystemTransaction ───────────────────────────────────────────────
// Reversal rules:
//   CREDIT_USER → debit user back → credit to RECOVERY (coins may have been spent)
//   DEDUCT_USER → debit from RECOVERY → credit user back
//   TRANSFER    → reverse the from/to wallets

export async function reverseTransaction(txId: string, adminId: string, reason: string, ipAddress?: string) {
  const original = await prisma.systemTransaction.findUnique({
    where: { id: txId },
    include: { fromWallet: true, toWallet: true },
  });
  if (!original) throw new AppError('Transaction not found', 404);
  if (original.status === 'reversed') throw new AppError('Transaction is already reversed', 400);
  if (original.txType === 'REVERSAL') throw new AppError('Cannot reverse a reversal', 400);
  if (original.txType === 'MINT') throw new AppError('Use Burn to reverse a Mint', 400);

  const amt = original.amount;
  const bigAmt = BigInt(amt);

  if (original.txType === 'CREDIT_USER') {
    // Debit coins from user → credit to RECOVERY
    await debitCoins(original.targetUserId, Number(amt), `reversal_${txId}`, `Reversal: ${reason}`);
    await prisma.$transaction(async (tx) => {
      const r = await getWalletLocked(tx, 'RECOVERY');
      const newBal = r.balance + bigAmt;
      await tx.systemWallet.update({ where: { walletType: 'RECOVERY' }, data: { balance: { increment: bigAmt }, totalIn: { increment: bigAmt } } });
      await tx.systemTransaction.create({
        data: {
          toWalletId:     r.id,
          amount:         bigAmt,
          txType:         'REVERSAL',
          targetUserId:   original.targetUserId,
          reason:         `Reversal of CREDIT_USER: ${reason}`,
          performedBy:    adminId,
          reversalOf:     txId,
          toBalanceAfter: newBal,
        },
      });
      await tx.systemTransaction.update({ where: { id: txId }, data: { status: 'reversed' } });
    });
  } else if (original.txType === 'DEDUCT_USER') {
    // Debit coins from RECOVERY → credit back to user
    const recovery = await getWallet('RECOVERY');
    if (recovery.balance < bigAmt) throw new AppError('Recovery wallet has insufficient balance to reverse this deduction', 400);
    await creditCoins(original.targetUserId, Number(amt), `reversal_${txId}`, `Reversal: ${reason}`);
    await prisma.$transaction(async (tx) => {
      const r = await getWalletLocked(tx, 'RECOVERY');
      const newBal = r.balance - bigAmt;
      await tx.systemWallet.update({ where: { walletType: 'RECOVERY' }, data: { balance: { decrement: bigAmt }, totalOut: { increment: bigAmt } } });
      await tx.systemTransaction.create({
        data: {
          fromWalletId:    r.id,
          amount:          bigAmt,
          txType:          'REVERSAL',
          targetUserId:    original.targetUserId,
          reason:          `Reversal of DEDUCT_USER: ${reason}`,
          performedBy:     adminId,
          reversalOf:      txId,
          fromBalanceAfter: newBal,
        },
      });
      await tx.systemTransaction.update({ where: { id: txId }, data: { status: 'reversed' } });
    });
  } else if (original.txType === 'TRANSFER') {
    // Reverse the transfer — swap from/to
    const fromType = original.toWallet?.walletType as WalletType;
    const toType   = original.fromWallet?.walletType as WalletType;
    if (!fromType || !toType) throw new AppError('Cannot determine wallet types for reversal', 400);

    await prisma.$transaction(async (tx) => {
      const from = await getWalletLocked(tx, fromType);
      const to   = await tx.systemWallet.findUniqueOrThrow({ where: { walletType: toType } });
      if (from.balance < bigAmt) throw new AppError(`${fromType} wallet has insufficient balance to reverse`, 400);

      const fromNewBal = from.balance - bigAmt;
      const toNewBal   = to.balance + bigAmt;

      await tx.systemWallet.update({ where: { walletType: fromType }, data: { balance: { decrement: bigAmt }, totalOut: { increment: bigAmt } } });
      await tx.systemWallet.update({ where: { walletType: toType },   data: { balance: { increment: bigAmt }, totalIn:  { increment: bigAmt } } });

      await tx.systemTransaction.create({
        data: {
          fromWalletId:    from.id,
          toWalletId:      to.id,
          amount:          bigAmt,
          txType:          'REVERSAL',
          reason:          `Reversal of TRANSFER: ${reason}`,
          performedBy:     adminId,
          reversalOf:      txId,
          fromBalanceAfter: fromNewBal,
          toBalanceAfter:   toNewBal,
        },
      });
      await tx.systemTransaction.update({ where: { id: txId }, data: { status: 'reversed' } });
    });
  } else {
    throw new AppError(`Reversal not supported for txType ${original.txType}`, 400);
  }

  await logAdminAction(adminId, 'master_wallet.reverse_tx', 'SystemTransaction', txId, { reason }, ipAddress);
  return { reversed: true, originalTxId: txId };
}

// ── Transactions list ─────────────────────────────────────────────────────────

export async function listTransactions(params: {
  page: number;
  limit: number;
  txType?: string;
  targetUserId?: string;
  status?: string;
}) {
  const { page, limit, txType, targetUserId, status } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (txType)       where.txType       = txType;
  if (targetUserId) where.targetUserId = targetUserId;
  if (status)       where.status       = status;

  const [txs, total] = await Promise.all([
    prisma.systemTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromWallet: { select: { walletType: true } },
        toWallet:   { select: { walletType: true } },
      },
    }),
    prisma.systemTransaction.count({ where }),
  ]);

  return {
    transactions: txs.map(t => ({
      id:               t.id,
      txType:           t.txType,
      amount:           t.amount.toString(),
      fromWallet:       t.fromWallet?.walletType ?? null,
      toWallet:         t.toWallet?.walletType   ?? null,
      targetUserId:     t.targetUserId || null,
      reason:           t.reason,
      performedBy:      t.performedBy,
      fromBalanceAfter: t.fromBalanceAfter?.toString() ?? null,
      toBalanceAfter:   t.toBalanceAfter?.toString()   ?? null,
      status:           t.status,
      reversalOf:       t.reversalOf || null,
      createdAt:        t.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
