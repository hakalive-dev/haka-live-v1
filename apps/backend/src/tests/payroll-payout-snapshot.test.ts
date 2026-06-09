import { prisma } from '../config/prisma';
import { encrypt } from '../utils/encryption';
import {
  getSummary,
  listAssignedWithdrawals,
} from '../modules/payroll-agent/payroll-agent.service';
import { resetDb, createTestUser } from './db-helpers';

beforeEach(resetDb);

const TEST_ORDER_ID = '1234567890123456789';

async function createAgent(countryCode = 'IN') {
  const agent = await createTestUser();
  await prisma.payrollAgentProfile.create({
    data: {
      userId: agent.id,
      payrollId: `PAY-${Date.now()}`,
      countryCode,
      status: 'active',
      commissionPercent: 5,
      acceptingOrders: true,
    },
  });
  return agent;
}

it('listAssignedWithdrawals rebuilds empty payout snapshot from encrypted payment method', async () => {
  const user = await createTestUser();
  const agent = await createAgent();

  const vpa = 'agentpay@upi';
  const method = await prisma.userPaymentMethod.create({
    data: {
      userId: user.id,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'Test User',
      maskedAccount: '****@upi',
      bankAccountNo: encrypt(vpa),
      accountHolderName: encrypt('Test User'),
    },
  });

  await prisma.withdrawalRequest.create({
    data: {
      orderId: '1111111111111111111',
      userId: user.id,
      beansAmount: 100_000,
      status: 'assigned',
      countryCode: 'IN',
      currency: 'INR',
      assignedAgentId: agent.id,
      assignedAt: new Date(),
      acceptedAt: new Date(),
      paymentMethodId: method.id,
      payoutSnapshot: '{}',
    },
  });

  const result = await listAssignedWithdrawals(agent.id, 1, 20, 'assigned');

  expect(result.items).toHaveLength(1);
  expect(result.items[0].payout?.accountNumber).toBe(vpa);
  expect(result.items[0].orderId).toBe('1111111111111111111');

  const row = await prisma.withdrawalRequest.findFirst({
    where: { assignedAgentId: agent.id },
  });
  expect(row!.payoutSnapshot).toContain(vpa);
});

it('listAssignedWithdrawals proof_submitted tab returns only proof_submitted', async () => {
  const user = await createTestUser();
  const agent = await createAgent();

  const base = {
    userId: user.id,
    beansAmount: 50_000,
    countryCode: 'IN',
    currency: 'INR',
    assignedAgentId: agent.id,
    assignedAt: new Date(),
    acceptedAt: new Date(),
    payoutSnapshot: '{}',
  };

  await prisma.withdrawalRequest.createMany({
    data: [
      { ...base, orderId: '2222222222222222221', status: 'proof_submitted' },
      { ...base, orderId: '2222222222222222222', status: 'completed', processedAt: new Date() },
      { ...base, orderId: '2222222222222222223', status: 'approved', processedAt: new Date() },
      { ...base, orderId: '2222222222222222224', status: 'assigned' },
    ],
  });

  const result = await listAssignedWithdrawals(agent.id, 1, 20, 'proof_submitted');

  expect(result.items).toHaveLength(1);
  expect(result.items[0].status).toBe('proof_submitted');
});

it('listAssignedWithdrawals success tab returns completed and approved', async () => {
  const user = await createTestUser();
  const agent = await createAgent();

  const base = {
    userId: user.id,
    beansAmount: 50_000,
    countryCode: 'IN',
    currency: 'INR',
    assignedAgentId: agent.id,
    assignedAt: new Date(),
    acceptedAt: new Date(),
    payoutSnapshot: '{}',
  };

  await prisma.withdrawalRequest.createMany({
    data: [
      { ...base, orderId: '3333333333333333331', status: 'proof_submitted' },
      { ...base, orderId: '3333333333333333332', status: 'completed', processedAt: new Date() },
      { ...base, orderId: '3333333333333333333', status: 'approved', processedAt: new Date() },
    ],
  });

  const result = await listAssignedWithdrawals(agent.id, 1, 20, 'success');

  expect(result.items).toHaveLength(2);
  const statuses = result.items.map((i) => i.status).sort();
  expect(statuses).toEqual(['approved', 'completed']);
});

it('getSummary splits pending payment vs new assigned orders by acceptedAt', async () => {
  const user = await createTestUser();
  const agent = await createAgent();

  const base = {
    userId: user.id,
    beansAmount: 50_000,
    countryCode: 'IN',
    currency: 'INR',
    assignedAgentId: agent.id,
    assignedAt: new Date(),
    payoutSnapshot: '{}',
  };

  await prisma.withdrawalRequest.createMany({
    data: [
      { ...base, orderId: '4444444444444444441', status: 'assigned', acceptedAt: new Date() },
      { ...base, orderId: '4444444444444444442', status: 'assigned', acceptedAt: new Date() },
      { ...base, orderId: '4444444444444444443', status: 'assigned', acceptedAt: null },
    ],
  });

  const summary = await getSummary(agent.id);

  expect(summary.pendingPaymentCount).toBe(2);
  expect(summary.newOrderCount).toBe(1);
});

it('listAssignedWithdrawals failed tab returns rejected', async () => {
  const user = await createTestUser();
  const agent = await createAgent();

  await prisma.withdrawalRequest.create({
    data: {
      orderId: TEST_ORDER_ID,
      userId: user.id,
      beansAmount: 50_000,
      status: 'rejected',
      countryCode: 'IN',
      currency: 'INR',
      assignedAgentId: agent.id,
      assignedAt: new Date(),
      adminRejectionNotes: 'Invalid proof',
      payoutSnapshot: '{}',
    },
  });

  const result = await listAssignedWithdrawals(agent.id, 1, 20, 'failed');

  expect(result.items).toHaveLength(1);
  expect(result.items[0].status).toBe('rejected');
  expect(result.items[0].adminRejectionNotes).toBe('Invalid proof');
});
