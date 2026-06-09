import { prisma } from '../config/prisma';
import {
  approveWithdrawal,
  verifyWithdrawalProof,
} from '../modules/admin/payments/admin-payments.service';
import { getBeanRecords } from '../modules/wallet/wallet.service';
import { resetDb, createTestUser } from './db-helpers';

jest.mock('../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));

jest.setTimeout(60_000);

beforeEach(resetDb);

async function setupPayrollWithdrawal(opts?: {
  status?: string;
  proofUrl?: string;
  commissionPercent?: number;
  orderId?: string;
}) {
  const user = await createTestUser();
  const agent = await createTestUser();

  await prisma.payrollAgentProfile.create({
    data: {
      userId: agent.id,
      payrollId: 'PAY-TEST-001',
      countryCode: 'IN',
      commissionPercent: opts?.commissionPercent ?? 10,
      status: 'active',
      acceptingOrders: true,
    },
  });

  const method = await prisma.userPaymentMethod.create({
    data: {
      userId: user.id,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'test',
      maskedAccount: 'test@upi',
    },
  });

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      orderId: opts?.orderId ?? '4444444444444444444',
      userId: user.id,
      beansAmount: 10000,
      status: opts?.status ?? 'proof_submitted',
      countryCode: 'IN',
      currency: 'INR',
      assignedAgentId: agent.id,
      assignedAt: new Date(),
      acceptedAt: new Date(),
      paymentMethodId: method.id,
      payoutSnapshot: '{}',
      proofUrl: opts?.proofUrl ?? 'https://example.com/proof.jpg',
    },
  });

  return { user, agent, withdrawal };
}

it('verifyWithdrawalProof credits payout reimbursement and commission to agent', async () => {
  const { agent, withdrawal } = await setupPayrollWithdrawal();

  await verifyWithdrawalProof(withdrawal.id, 'admin-id', '127.0.0.1');

  const agentWallet = await prisma.wallet.findUnique({ where: { userId: agent.id } });
  // 10% commission (1000) + 90% payout (9000) = 10000 total
  expect(Number(agentWallet!.beanBalance)).toBe(10000);
});

it('verifyWithdrawalProof creates payout and commission wallet transactions', async () => {
  const { agent, withdrawal } = await setupPayrollWithdrawal({ orderId: '5555555555555555555' });

  await verifyWithdrawalProof(withdrawal.id, 'admin-id', '127.0.0.1');

  const agentWallet = await prisma.wallet.findUnique({ where: { userId: agent.id } });
  const payoutTx = await prisma.walletTransaction.findFirst({
    where: {
      walletId: agentWallet!.id,
      reference: 'withdrawal_agent_payout',
    },
  });
  const commissionTx = await prisma.walletTransaction.findFirst({
    where: {
      walletId: agentWallet!.id,
      reference: 'withdrawal_agent_commission',
    },
  });

  expect(payoutTx).toBeDefined();
  expect(payoutTx!.transactionType).toBe('credit');
  expect(Number(payoutTx!.amount)).toBe(9000);
  expect(payoutTx!.description).toContain('5555555555555555555');

  expect(commissionTx).toBeDefined();
  expect(commissionTx!.transactionType).toBe('credit');
  expect(Number(commissionTx!.amount)).toBe(1000);
  expect(commissionTx!.description).toContain('5555555555555555555');
});

it('getBeanRecords returns payroll_payout and payroll_commission categories', async () => {
  const { agent, withdrawal } = await setupPayrollWithdrawal();

  await verifyWithdrawalProof(withdrawal.id, 'admin-id', '127.0.0.1');

  const records = await getBeanRecords(agent.id, 1, 10);
  const payoutRecord = records.items.find(
    (r) => r.reference === 'withdrawal_agent_payout',
  );
  const commissionRecord = records.items.find(
    (r) => r.reference === 'withdrawal_agent_commission',
  );

  expect(payoutRecord).toBeDefined();
  expect(payoutRecord!.category).toBe('payroll_payout');
  expect(payoutRecord!.transactionType).toBe('credit');
  expect(payoutRecord!.amount).toBe(9000);

  expect(commissionRecord).toBeDefined();
  expect(commissionRecord!.category).toBe('payroll_commission');
  expect(commissionRecord!.transactionType).toBe('credit');
  expect(commissionRecord!.amount).toBe(1000);
});

it('approveWithdrawal on proof_submitted assigned order credits payout, commission, and ledger', async () => {
  const { agent, withdrawal } = await setupPayrollWithdrawal();

  await approveWithdrawal(withdrawal.id, 'admin-id', '127.0.0.1');

  const updated = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawal.id } });
  expect(updated!.status).toBe('completed');

  const agentWallet = await prisma.wallet.findUnique({ where: { userId: agent.id } });
  expect(Number(agentWallet!.beanBalance)).toBe(10000);

  const ledger = await prisma.payrollLedgerEntry.findUnique({
    where: { withdrawalRequestId: withdrawal.id },
  });
  expect(ledger).toBeDefined();
  expect(Number(ledger!.commissionBeans)).toBe(1000);

  const payoutTx = await prisma.walletTransaction.findFirst({
    where: {
      walletId: agentWallet!.id,
      reference: 'withdrawal_agent_payout',
    },
  });
  const commissionTx = await prisma.walletTransaction.findFirst({
    where: {
      walletId: agentWallet!.id,
      reference: 'withdrawal_agent_commission',
    },
  });
  expect(payoutTx).toBeDefined();
  expect(Number(payoutTx!.amount)).toBe(9000);
  expect(commissionTx).toBeDefined();
  expect(Number(commissionTx!.amount)).toBe(1000);
});

it('settlePayrollAgent is idempotent — no double credit on second approve', async () => {
  const { agent, withdrawal } = await setupPayrollWithdrawal();

  await approveWithdrawal(withdrawal.id, 'admin-id', '127.0.0.1');

  const agentWallet = await prisma.wallet.findUnique({ where: { userId: agent.id } });
  expect(Number(agentWallet!.beanBalance)).toBe(10000);

  const txCountBefore = await prisma.walletTransaction.count({
    where: {
      walletId: agentWallet!.id,
      reference: { in: ['withdrawal_agent_payout', 'withdrawal_agent_commission'] },
    },
  });
  expect(txCountBefore).toBe(2);

  await expect(
    approveWithdrawal(withdrawal.id, 'admin-id', '127.0.0.1'),
  ).rejects.toThrow(/already finalized/i);

  const txCountAfter = await prisma.walletTransaction.count({
    where: {
      walletId: agentWallet!.id,
      reference: { in: ['withdrawal_agent_payout', 'withdrawal_agent_commission'] },
    },
  });
  expect(txCountAfter).toBe(2);
});
