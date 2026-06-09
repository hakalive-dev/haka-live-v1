import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

const TX_TIMEOUT = 15_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListPayrollParams {
  page: number;
  limit: number;
  status?: string;
  recipientType?: string;
}

export interface CreatePayrollData {
  recipientId: string;
  recipientType: string;
  amountBeans: number;
  periodStart: string;
  periodEnd: string;
  notes?: string;
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listPayroll(params: ListPayrollParams) {
  const { page, limit, status, recipientType } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.PayrollRecordWhereInput = {};
  if (status) where.status = status;
  if (recipientType) where.recipientType = recipientType;

  const [records, total] = await Promise.all([
    prisma.payrollRecord.findMany({
      where,
      skip,
      take: limit,
      include: {
        recipient: { select: { id: true, username: true, hakaId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payrollRecord.count({ where }),
  ]);

  return {
    records,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createPayrollRecord(data: CreatePayrollData, adminId: string, ip: string) {
  const recipient = await prisma.user.findUnique({ where: { id: data.recipientId } });
  if (!recipient) throw new AppError('Recipient not found', 404);

  const record = await prisma.payrollRecord.create({
    data: {
      recipientId: data.recipientId,
      recipientType: data.recipientType,
      amountBeans: data.amountBeans,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      notes: data.notes ?? '',
    },
  });

  await logAdminAction(adminId, 'payroll.create', 'PayrollRecord', record.id, { amountBeans: data.amountBeans }, ip);
  return record;
}

export async function processPayroll(id: string, adminId: string, ip: string) {
  const record = await prisma.payrollRecord.findUnique({ where: { id } });
  if (!record) throw new AppError('Payroll record not found', 404);
  if (record.status !== 'pending') throw new AppError('Record is not pending', 400);

  const updated = await prisma.$transaction(async (tx) => {
    // Lock the wallet row to prevent concurrent updates
    const [wallet] = await tx.$queryRaw<Array<{ id: string; beanBalance: number }>>`
      SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${record.recipientId} FOR UPDATE
    `;

    if (!wallet) {
      // Create wallet if it doesn't exist yet
      const created = await tx.wallet.create({ data: { userId: record.recipientId } });
      const updatedWallet = await tx.wallet.update({
        where: { id: created.id },
        data: { beanBalance: record.amountBeans },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: created.id,
          transactionType: 'credit',
          currency: 'beans',
          amount: record.amountBeans,
          balanceAfter: record.amountBeans,
          reference: 'payroll',
          description: `Payroll payout`,
        },
      });
      const rec = await tx.payrollRecord.update({
        where: { id },
        data: { status: 'paid', paidAt: new Date(), paidByAdminId: adminId },
      });
      return rec;
    }

    const newBalance = wallet.beanBalance + record.amountBeans;
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { beanBalance: newBalance },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'credit',
        currency: 'beans',
        amount: record.amountBeans,
        balanceAfter: newBalance,
        reference: 'payroll',
        description: `Payroll payout`,
      },
    });

    const rec = await tx.payrollRecord.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date(), paidByAdminId: adminId },
    });
    return rec;
  }, { timeout: TX_TIMEOUT });

  await logAdminAction(adminId, 'payroll.process', 'PayrollRecord', id, { amountBeans: record.amountBeans }, ip);
  return updated;
}

export async function rejectPayroll(id: string, notes: string, adminId: string, ip: string) {
  const record = await prisma.payrollRecord.findUnique({ where: { id } });
  if (!record) throw new AppError('Payroll record not found', 404);
  if (record.status !== 'pending') throw new AppError('Record is not pending', 400);

  const updated = await prisma.payrollRecord.update({
    where: { id },
    data: { status: 'rejected', notes },
  });

  await logAdminAction(adminId, 'payroll.reject', 'PayrollRecord', id, { notes }, ip);
  return updated;
}
