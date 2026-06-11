import { prisma } from '../../../config/prisma';
import { resetDb, createTestAdmin } from '../../../tests/db-helpers';

describe('foundation schema columns', () => {
  beforeEach(async () => { await resetDb(); });

  it('AdminUser exposes the new staff + risk + freeze + delete columns with defaults', async () => {
    const admin = await createTestAdmin({ role: 'admin' });
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.username).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.country).toBe('');
    expect(row.riskLevel).toBe('low');
    expect(row.riskNote).toBe('');
    expect(row.payoutFrozen).toBe(false);
    expect(row.mustChangePassword).toBe(false);
    expect(row.deletedAt).toBeNull();
  });

  it('Agency exposes limits + risk + freeze + delete columns with defaults', async () => {
    const owner = await prisma.user.create({ data: { displayName: 'Owner', hakaId: '500000900' } });
    const agency = await prisma.agency.create({ data: { name: 'A1', ownerId: owner.id } });
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(row.hostLimit).toBe(0); // 0 = unlimited (non-null default in schema)
    expect(row.withdrawalLimitMonthly).toBeNull();
    expect(row.riskLevel).toBe('low');
    expect(row.payoutFrozen).toBe(false);
    expect(row.country).toBe('');
    expect(row.deletedAt).toBeNull();
  });

  it('can create and read an AdminEmergencyOtp row', async () => {
    const sa = await createTestAdmin({ role: 'super_admin' });
    const target = await createTestAdmin({ role: 'bd' });
    const otp = await prisma.adminEmergencyOtp.create({
      data: {
        adminId: target.id,
        codeHash: 'hashed',
        expiresAt: new Date(Date.now() + 600_000),
        createdById: sa.id,
      },
    });
    expect(otp.usedAt).toBeNull();
    const found = await prisma.adminEmergencyOtp.findUnique({ where: { id: otp.id } });
    expect(found?.adminId).toBe(target.id);
  });
});
