import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { parsePayoutSnapshot, ensureFullPayoutSnapshotForWithdrawal } from './payout-snapshot';
import { assertActivePayrollAgent, getProfileByUserId } from './payroll-agent-profile.service';
import { notifyWithdrawalAssignedToAgent } from './payroll-agent-notify.service';
import { scheduleWithdrawalPendingConfirm } from '../chat/withdrawal-message-notify.service';
import { createAdminNotification } from '../admin/notifications/admin-notifications.service';

const ASSIGNED_SLA_MS = 4 * 60 * 60 * 1000;

export const SUCCESS_STATUSES = ['completed', 'approved'] as const;
export const FAILED_STATUSES = ['rejected'] as const;

export type PayrollWithdrawalTabFilter =
  | 'assigned'
  | 'proof_submitted'
  | 'success'
  | 'failed';

function statusesForTabFilter(filter?: PayrollWithdrawalTabFilter): string[] {
  switch (filter) {
    case 'assigned':
      return ['assigned'];
    case 'proof_submitted':
      return ['proof_submitted'];
    case 'success':
      return [...SUCCESS_STATUSES];
    case 'failed':
      return [...FAILED_STATUSES];
    default:
      return ['assigned', 'proof_submitted', ...SUCCESS_STATUSES, ...FAILED_STATUSES];
  }
}

const withdrawalInclude = {
  user: { select: { id: true, displayName: true, hakaId: true, avatar: true } },
} as const;

function serializeWithdrawal(
  row: Prisma.WithdrawalRequestGetPayload<{ include: typeof withdrawalInclude }>,
  commissionPercent: number,
) {
  const beans = Number(row.beansAmount);
  const commissionBeans = Math.floor((beans * commissionPercent) / 100);
  const platformBeans = beans - commissionBeans;
  const snap = parsePayoutSnapshot(row.payoutSnapshot);
  const assignedAt = row.assignedAt?.getTime() ?? null;
  const slaDeadlineAt = assignedAt ? assignedAt + ASSIGNED_SLA_MS : null;

  return {
    ...row,
    beansAmount: beans,
    localAmount: row.localAmount != null ? Number(row.localAmount) : null,
    payout: snap,
    commissionPreview: {
      agentBeans: commissionBeans,
      platformBeans,
      percent: commissionPercent,
    },
    slaDeadlineAt: slaDeadlineAt ? new Date(slaDeadlineAt).toISOString() : null,
    displayStatus: row.status,
    adminRejectionNotes: row.adminRejectionNotes,
  };
}

export async function getAgentMe(agentUserId: string) {
  const profile = await assertActivePayrollAgent(agentUserId);
  const wallet = await prisma.wallet.findUnique({ where: { userId: agentUserId } });
  return {
    profile: {
      payrollId: profile.payrollId,
      countryCode: profile.countryCode,
      status: profile.status,
      commissionPercent: Number(profile.commissionPercent),
      acceptingOrders: profile.acceptingOrders,
      riskScore: profile.riskScore,
    },
    beanBalance: wallet ? Number(wallet.beanBalance) : 0,
  };
}

export async function patchAgentMe(
  agentUserId: string,
  data: { acceptingOrders?: boolean },
) {
  await assertActivePayrollAgent(agentUserId);
  return prisma.payrollAgentProfile.update({
    where: { userId: agentUserId },
    data: { acceptingOrders: data.acceptingOrders },
  });
}

export async function getSummary(
  agentUserId: string,
  from?: Date,
  to?: Date,
) {
  const profile = await assertActivePayrollAgent(agentUserId);
  const range: Prisma.PayrollLedgerEntryWhereInput = { agentUserId };
  if (from || to) {
    range.createdAt = {};
    if (from) range.createdAt.gte = from;
    if (to) range.createdAt.lte = to;
  }

  const agentScope = { assignedAgentId: agentUserId };

  const [ledgerAgg, pendingPayment, newOrders, pendingProof, successCount, failedCount, waitingCountry] =
    await Promise.all([
      prisma.payrollLedgerEntry.aggregate({
        where: range,
        _sum: { beansAmount: true, commissionBeans: true },
      }),
      prisma.withdrawalRequest.count({
        where: { ...agentScope, status: 'assigned', acceptedAt: { not: null } },
      }),
      prisma.withdrawalRequest.count({
        where: { ...agentScope, status: 'assigned', acceptedAt: null },
      }),
      prisma.withdrawalRequest.count({
        where: { ...agentScope, status: 'proof_submitted' },
      }),
      prisma.withdrawalRequest.count({
        where: { ...agentScope, status: { in: [...SUCCESS_STATUSES] } },
      }),
      prisma.withdrawalRequest.count({
        where: { ...agentScope, status: { in: [...FAILED_STATUSES] } },
      }),
      prisma.withdrawalRequest.count({
        where: {
          countryCode: profile.countryCode,
          status: 'pending_review',
        },
      }),
    ]);

  const totalProcessed = Number(ledgerAgg._sum.beansAmount ?? 0);
  const pointsOfEarnings = Number(ledgerAgg._sum.commissionBeans ?? 0);

  return {
    paymentAmount: totalProcessed,
    pointsOfEarnings,
    platformReward: Math.max(0, totalProcessed - pointsOfEarnings),
    pendingPaymentCount: pendingPayment,
    newOrderCount: newOrders,
    awaitingConfirmationCount: pendingProof,
    successCount,
    failedCount,
    waitingListCount: waitingCountry,
    acceptingOrders: profile.acceptingOrders,
  };
}

export async function listAssignedWithdrawals(
  agentUserId: string,
  page: number,
  limit: number,
  statusFilter?: PayrollWithdrawalTabFilter,
) {
  const profile = await getProfileByUserId(agentUserId);
  if (!profile) throw new AppError('Payroll agent profile not found', 404);

  const statuses = statusesForTabFilter(statusFilter);

  const where = {
    assignedAgentId: agentUserId,
    status: { in: statuses },
  };

  const [items, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: withdrawalInclude,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  const commissionPercent = Number(profile.commissionPercent);
  const enrichedItems = await Promise.all(
    items.map(async (r) => {
      const payoutSnapshot = await ensureFullPayoutSnapshotForWithdrawal(
        r.id,
        r.paymentMethodId,
        r.payoutSnapshot,
      );
      return serializeWithdrawal({ ...r, payoutSnapshot }, commissionPercent);
    }),
  );

  return {
    items: enrichedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getWithdrawalDetail(agentUserId: string, withdrawalId: string) {
  const profile = await getProfileByUserId(agentUserId);
  if (!profile) throw new AppError('Payroll agent profile not found', 404);

  const request = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: withdrawalInclude,
  });
  if (!request || request.assignedAgentId !== agentUserId) {
    throw new AppError('Withdrawal request not found', 404);
  }
  const payoutSnapshot = await ensureFullPayoutSnapshotForWithdrawal(
    request.id,
    request.paymentMethodId,
    request.payoutSnapshot,
  );
  return serializeWithdrawal({ ...request, payoutSnapshot }, Number(profile.commissionPercent));
}

export async function submitWithdrawalProof(
  agentUserId: string,
  withdrawalId: string,
  proofUrl: string,
  agentNotes: string,
  externalTransactionId: string,
  proofBuffer?: Buffer,
) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!request || request.assignedAgentId !== agentUserId) {
    throw new AppError('Withdrawal request not found', 404);
  }
  if (request.frozenByAdminId) {
    throw new AppError('This withdrawal is frozen by admin', 400);
  }
  if (request.status !== 'assigned') {
    throw new AppError('Proof already submitted or this request is not awaiting payment proof', 400);
  }

  let proofContentHash = '';
  if (proofBuffer && proofBuffer.length > 0) {
    proofContentHash = createHash('sha256').update(proofBuffer).digest('hex');
    const duplicate = await prisma.withdrawalRequest.findFirst({
      where: {
        proofContentHash,
        id: { not: withdrawalId },
        status: { notIn: ['rejected'] },
      },
    });
    if (duplicate) {
      throw new AppError('This payment proof image was already used', 409);
    }
  }

  if (externalTransactionId.trim()) {
    const dupTxn = await prisma.withdrawalRequest.findFirst({
      where: {
        externalTransactionId: externalTransactionId.trim(),
        id: { not: withdrawalId },
        status: { notIn: ['rejected'] },
      },
    });
    if (dupTxn) {
      throw new AppError('This transaction ID was already used', 409);
    }
  }

  const updated = await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      status: 'proof_submitted',
      proofUrl,
      proofUploadedAt: new Date(),
      agentProofNotes: agentNotes,
      externalTransactionId: externalTransactionId.trim(),
      proofContentHash,
    },
    include: withdrawalInclude,
  });

  scheduleWithdrawalPendingConfirm(withdrawalId);
  return updated;
}

export async function notifyAgentAssigned(
  agentUserId: string,
  withdrawalId: string,
  beans: number,
  countryCode: string,
) {
  await notifyWithdrawalAssignedToAgent(agentUserId, withdrawalId, beans, countryCode);
}

export async function acceptWithdrawal(agentUserId: string, withdrawalId: string) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!request || request.assignedAgentId !== agentUserId) {
    throw new AppError('Withdrawal not found or not assigned to you', 404);
  }
  if (request.status !== 'assigned') {
    throw new AppError('Withdrawal is not in assigned state', 400);
  }
  if (request.acceptedAt) {
    throw new AppError('Withdrawal already accepted', 400);
  }
  return prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: { acceptedAt: new Date() },
    include: withdrawalInclude,
  });
}

export async function declineWithdrawal(agentUserId: string, withdrawalId: string) {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!request || request.assignedAgentId !== agentUserId) {
    throw new AppError('Withdrawal not found or not assigned to you', 404);
  }
  if (request.status !== 'assigned') {
    throw new AppError('Withdrawal is not in assigned state', 400);
  }

  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      assignedAgentId: null,
      assignedAt: null,
      acceptedAt: null,
      status: 'pending_review',
    },
  });

  await reassignOrEscalate(withdrawalId, agentUserId);
}

/**
 * Tries to find another accepting agent in the same country and reassigns.
 * If no suitable agent is available, escalates to admin instead.
 * Returns true if reassigned, false if escalated.
 */
export async function reassignOrEscalate(
  withdrawalId: string,
  excludeAgentId?: string,
): Promise<boolean> {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });
  if (!withdrawal) return false;

  // Find all active, accepting agents in the same country, excluding the current one
  const candidates = await prisma.payrollAgentProfile.findMany({
    where: {
      countryCode: withdrawal.countryCode,
      status: 'active',
      acceptingOrders: true,
      ...(excludeAgentId ? { userId: { not: excludeAgentId } } : {}),
    },
    select: { userId: true },
  });

  if (candidates.length === 0) {
    // No other agent — escalate to admin
    await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { escalatedAt: new Date() },
    });
    await createAdminNotification({
      type: 'withdrawal_escalated',
      title: 'Withdrawal SLA exceeded — no agent available',
      body: `Withdrawal ${withdrawalId.slice(0, 8)}… (${Number(withdrawal.beansAmount).toLocaleString()} beans, ${withdrawal.countryCode}) needs manual assignment`,
      linkPath: '/withdrawals',
      entityType: 'WithdrawalRequest',
      entityId: withdrawalId,
    });
    return false;
  }

  // Pick least-loaded agent (fewest currently assigned withdrawals)
  const loads = await Promise.all(
    candidates.map(async (c) => {
      const count = await prisma.withdrawalRequest.count({
        where: { assignedAgentId: c.userId, status: 'assigned' },
      });
      return { userId: c.userId, count };
    }),
  );
  loads.sort((a, b) => a.count - b.count);
  const nextAgentId = loads[0].userId;

  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      assignedAgentId: nextAgentId,
      assignedAt: new Date(),
      acceptedAt: null,
      escalatedAt: null,
    },
  });

  await notifyAgentAssigned(
    nextAgentId,
    withdrawalId,
    Number(withdrawal.beansAmount),
    withdrawal.countryCode,
  );

  return true;
}
