/**
 * POST /api/v1/admin/payments/withdrawals/:id/assign
 */
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, mintAdminJwt } from '../../../tests/db-helpers';

beforeEach(async () => {
  await resetDb();
});

async function createPayrollAgent(countryCode = 'IN') {
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

describe('POST /api/v1/admin/payments/withdrawals/:id/assign', () => {
  it('returns JSON-safe withdrawal and persists assignment', async () => {
    const admin = await createTestUser();
    const adminToken = mintAdminJwt(admin.id, 'super_admin');
    const user = await createTestUser({ beanBalance: 0 });
    const agent = await createPayrollAgent('IN');

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        orderId: '1234567890123456789',
        userId: user.id,
        beansAmount: 50_000,
        status: 'pending_review',
        countryCode: 'IN',
        currency: 'INR',
      },
    });

    const res = await request(app)
      .post(`/api/v1/admin/payments/withdrawals/${withdrawal.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentUserId: agent.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.beansAmount).toBe('number');
    expect(res.body.data.beansAmount).toBe(50_000);
    expect(res.body.data.status).toBe('assigned');
    expect(res.body.data.assignedAgentId).toBe(agent.id);

    const row = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawal.id } });
    expect(row?.status).toBe('assigned');
    expect(row?.assignedAgentId).toBe(agent.id);
  });
});
