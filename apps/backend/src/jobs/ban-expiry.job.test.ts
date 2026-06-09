/**
 * Auto-expiry sweep — ban-expiry.job.ts
 *
 * Runs the sweep against a fully-mocked Prisma surface and asserts that
 * expired temporary bans are deactivated, the matching User flag is
 * restored, and a `ban.auto_expire` audit row is written.
 */

jest.mock('../config/prisma', () => {
  const db: any = {
    ban: {
      findMany:  jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update:    jest.fn().mockResolvedValue({}),
    },
    deviceBan: {
      findMany: jest.fn(),
      update:   jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma: db };
});

import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import { startBanExpiryJob, stopBanExpiryJob } from './ban-expiry.job';

beforeEach(async () => {
  await redis.flushall();
});

const mockBan = prisma.ban as unknown as {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
};
const mockDeviceBan = prisma.deviceBan as unknown as {
  findMany: jest.Mock;
  update: jest.Mock;
};
const mockUser = prisma.user as unknown as { update: jest.Mock };
const mockAudit = prisma.auditLog as unknown as { create: jest.Mock };

afterEach(async () => {
  stopBanExpiryJob();
  jest.clearAllMocks();
  await redis.flushall();
});

describe('ban-expiry sweep', () => {
  it('deactivates expired platform ban and re-activates the user', async () => {
    mockBan.findMany.mockResolvedValueOnce([
      { id: 'b-1', userId: 'u-1', type: 'platform' },
    ]);
    mockBan.findFirst.mockResolvedValueOnce(null); // no other active platform ban
    mockDeviceBan.findMany.mockResolvedValueOnce([]);

    startBanExpiryJob();
    // The job runs immediately on boot; let microtasks flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockBan.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { isActive: false },
    });
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isActive: true },
    });
    expect(mockAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'ban.auto_expire',
        targetType: 'Ban',
        targetId: 'b-1',
        adminId: 'system',
      }),
    }));
  });

  it('clears isHostBanned when a host ban expires', async () => {
    mockBan.findMany.mockResolvedValueOnce([
      { id: 'b-2', userId: 'u-2', type: 'host' },
    ]);
    mockBan.findFirst.mockResolvedValueOnce(null);
    mockDeviceBan.findMany.mockResolvedValueOnce([]);

    startBanExpiryJob();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'u-2' },
      data: { isHostBanned: false },
    });
  });

  it('does not flip user.isActive when another platform ban remains active', async () => {
    mockBan.findMany.mockResolvedValueOnce([
      { id: 'b-3', userId: 'u-3', type: 'platform' },
    ]);
    mockBan.findFirst.mockResolvedValueOnce({ id: 'still-active' }); // other ban present
    mockDeviceBan.findMany.mockResolvedValueOnce([]);

    startBanExpiryJob();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockBan.update).toHaveBeenCalled();
    // user.update should NOT be called for u-3 with isActive: true.
    const userUpdates = mockUser.update.mock.calls.map((c) => c[0]);
    expect(userUpdates).not.toContainEqual(expect.objectContaining({
      where: { id: 'u-3' },
      data: expect.objectContaining({ isActive: true }),
    }));
  });

  it('deactivates expired device bans and writes an audit row', async () => {
    mockBan.findMany.mockResolvedValueOnce([]);
    mockDeviceBan.findMany.mockResolvedValueOnce([
      { id: 'd-1', deviceId: 'dev-xyz' },
    ]);

    startBanExpiryJob();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mockDeviceBan.update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: { isActive: false },
    });
    expect(mockAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'device_ban.auto_expire',
        targetType: 'DeviceBan',
      }),
    }));
  });
});
