import { prisma } from '../config/prisma';
import { acceptWithdrawal, declineWithdrawal } from '../modules/payroll-agent/payroll-agent.service';
import { randomWithdrawalOrderId } from '../utils/withdrawal-order-id';
import { resetDb, createTestUser } from './db-helpers';

beforeEach(resetDb);

async function createAssignedWithdrawal(agentId: string) {
  const user = await createTestUser();
  const method = await prisma.userPaymentMethod.create({
    data: {
      userId: user.id,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'T',
      maskedAccount: 'x@upi',
    },
  });
  return prisma.withdrawalRequest.create({
    data: {
      orderId: randomWithdrawalOrderId(),
      userId: user.id,
      beansAmount: 20000,
      status: 'assigned',
      countryCode: 'IN',
      currency: 'INR',
      assignedAgentId: agentId,
      assignedAt: new Date(),
      paymentMethodId: method.id,
      payoutSnapshot: '{}',
    },
  });
}

it('acceptWithdrawal sets acceptedAt and keeps status assigned', async () => {
  const agent = await createTestUser();
  await prisma.payrollAgentProfile.create({
    data: {
      userId: agent.id,
      payrollId: 'PAY-A-001',
      countryCode: 'IN',
      status: 'active',
      commissionPercent: 5,
      acceptingOrders: true,
    },
  });
  const wr = await createAssignedWithdrawal(agent.id);

  const updated = await acceptWithdrawal(agent.id, wr.id);

  expect(updated.status).toBe('assigned');
  expect(updated.acceptedAt).not.toBeNull();
});

it('declineWithdrawal resets status to pending_review and clears agent', async () => {
  const agent = await createTestUser();
  await prisma.payrollAgentProfile.create({
    data: {
      userId: agent.id,
      payrollId: 'PAY-B-001',
      countryCode: 'IN',
      status: 'active',
      commissionPercent: 5,
      acceptingOrders: true,
    },
  });
  const wr = await createAssignedWithdrawal(agent.id);

  await declineWithdrawal(agent.id, wr.id);

  const result = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
  expect(result!.status).toBe('pending_review');
  expect(result!.assignedAgentId).toBeNull();
});

it('acceptWithdrawal rejects if caller is not the assigned agent', async () => {
  const agent = await createTestUser();
  const other = await createTestUser();
  await prisma.payrollAgentProfile.create({
    data: {
      userId: agent.id,
      payrollId: 'PAY-C-001',
      countryCode: 'IN',
      status: 'active',
      commissionPercent: 5,
      acceptingOrders: true,
    },
  });
  const wr = await createAssignedWithdrawal(agent.id);

  await expect(acceptWithdrawal(other.id, wr.id)).rejects.toThrow();
});
