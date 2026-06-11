/**
 * Foreclose teardown — admin-rooms.service.ts
 *
 * Verifies that `tearDownRoom`:
 *   - flips the room status to 'ended'
 *   - vacates every seat
 *   - sets the Agora revoke watermark in Redis
 * and that `deleteRoom` refuses to delete a still-live room.
 *
 * Uses Prisma + Redis mocks; no live infrastructure required.
 */

jest.mock('../../../config/prisma', () => {
  const db: any = {
    room: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    roomSeat: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    roomMessage: { deleteMany: jest.fn().mockResolvedValue({}) },
    roomAdmin: { deleteMany: jest.fn().mockResolvedValue({}) },
    ban: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    hostMicSession: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) }, // hasSuperAdminPower
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((ops: any) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(db),
  );
  return { prisma: db };
});

jest.mock('../../../config/redis', () => {
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    smembers: jest.fn().mockResolvedValue([]),
    scard: jest.fn().mockResolvedValue(0),
    srem: jest.fn().mockResolvedValue(1),
  };
  return { redis };
});

// hosts.service is dynamically imported inside tearDownRoom — provide a stub
// so the import doesn't actually pull in the live module graph.
jest.mock('../../hosts/hosts.service', () => ({
  endMicSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../rooms/rooms.service', () => {
  const actual = jest.requireActual('../../rooms/rooms.service');
  return {
    ...actual,
    createTemporaryRoomKickBan: jest.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      cooldownMinutes: 120,
    }),
  };
});

jest.mock('../../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
    sockets: {
      adapter: { rooms: { get: jest.fn(() => new Set()) } },
      sockets: new Map(),
    },
  })),
}));

import { prisma } from '../../../config/prisma';
import { redis } from '../../../config/redis';
import {
  tearDownRoom,
  deleteRoom,
  vacateUserFromRoomSeats,
  forceEndRoom,
  kickUserFromRoom,
  setSeatLock,
  createRoomBan,
} from './admin-rooms.service';

const mockRoom = prisma.room as unknown as { findUnique: jest.Mock; update: jest.Mock };
const mockSeat = prisma.roomSeat as unknown as { findMany: jest.Mock; updateMany: jest.Mock };
const mockTx   = prisma as unknown as { $transaction: jest.Mock };
const mockRedis = redis as unknown as { set: jest.Mock; del: jest.Mock; hdel: jest.Mock; srem: jest.Mock };

describe('tearDownRoom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the room is already ended', async () => {
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'r-1', title: 'X', status: 'ended' });

    const out = await tearDownRoom('r-1');

    expect(out).toBeNull();
    expect(mockTx.$transaction).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('returns null when the room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValueOnce(null);

    const out = await tearDownRoom('missing');

    expect(out).toBeNull();
    expect(mockTx.$transaction).not.toHaveBeenCalled();
  });

  it('closes a live room: status=ended + seats vacated + Agora watermark set', async () => {
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'r-1', title: 'My Room', status: 'live' });

    const title = await tearDownRoom('r-1');

    expect(title).toBe('My Room');
    expect(mockTx.$transaction).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'agora:revoked:r-1',
      expect.any(String),
      'EX',
      3600,
    );
    expect(mockRedis.del).toHaveBeenCalledWith('room:r-1:applicants');
  });
});

describe('deleteRoom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when the room is still live', async () => {
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'r-2', title: 'Live', status: 'live' });

    await expect(deleteRoom('admin-1', 'r-2', '127.0.0.1')).rejects.toMatchObject({
      message: expect.stringMatching(/ended.*first|status.*ended/i),
      statusCode: 400,
    });
    expect(mockTx.$transaction).not.toHaveBeenCalled();
  });

  it('deletes an ended room and clears redis keys', async () => {
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'r-3', title: 'Old', status: 'ended' });

    const out = await deleteRoom('admin-1', 'r-3', '127.0.0.1');

    expect(out.message).toContain('deleted');
    expect(mockTx.$transaction).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).toHaveBeenCalledWith('agora:revoked:r-3');
  });
});

describe('vacateUserFromRoomSeats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns [] when the user is not seated', async () => {
    mockSeat.findMany.mockResolvedValueOnce([]);

    const out = await vacateUserFromRoomSeats('r-1', 'u-1');

    expect(out).toEqual([]);
    expect(mockSeat.updateMany).not.toHaveBeenCalled();
  });

  it('clears seats and removes the user from the mic-applicant hash', async () => {
    mockSeat.findMany.mockResolvedValueOnce([
      { position: 1, isLocked: false },
    ]);

    const out = await vacateUserFromRoomSeats('r-1', 'u-1');

    expect(out).toEqual([{ position: 1, isLocked: false }]);
    expect(mockSeat.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'r-1', userId: 'u-1' },
      data: { userId: null, isMuted: false },
    });
    expect(mockRedis.hdel).toHaveBeenCalledWith('room:r-1:applicants', 'u-1');
  });
});

describe('admin room operations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forceEndRoom tears down the room and writes an audit action', async () => {
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'r-1', title: 'Live Room', status: 'live' });

    const out = await forceEndRoom('admin-1', 'r-1', '127.0.0.1');

    expect(out.message).toContain('Live Room');
    expect(mockTx.$transaction).toHaveBeenCalledTimes(1);
  });

  it('kickUserFromRoom vacates seats and removes the viewer from redis', async () => {
    mockSeat.findMany.mockResolvedValueOnce([{ position: 2, isLocked: false }]);

    const out = await kickUserFromRoom('admin-1', 'r-1', 'u-1', 'spam', '127.0.0.1');

    expect(out.vacatedSeats).toEqual([2]);
    expect(mockRedis.srem).toHaveBeenCalledWith('room:r-1:viewers', 'u-1');
    const { createTemporaryRoomKickBan } = require('../../rooms/rooms.service');
    expect(createTemporaryRoomKickBan).toHaveBeenCalledWith('r-1', 'admin-1', 'u-1', 'spam');
  });

  it('setSeatLock updates the room seat without requiring host identity', async () => {
    (prisma.roomSeat as any).update.mockResolvedValueOnce({ roomId: 'r-1', position: 3, isLocked: true });

    const out = await setSeatLock('admin-1', 'r-1', 3, true, '127.0.0.1');

    expect(out.isLocked).toBe(true);
    expect((prisma.roomSeat as any).update).toHaveBeenCalledWith({
      where: { roomId_position: { roomId: 'r-1', position: 3 } },
      data: { isLocked: true, userId: null },
    });
  });

  it('createRoomBan creates an active room ban for a user', async () => {
    (prisma.room as any).findUnique.mockResolvedValueOnce({ id: 'r-1', title: 'Room' });
    (prisma.user as any).findUnique.mockResolvedValueOnce({ id: 'u-1', displayName: 'User' });
    (prisma.ban as any).create.mockResolvedValueOnce({ id: 'ban-1', userId: 'u-1', roomId: 'r-1' });

    const out = await createRoomBan('admin-1', 'r-1', { userId: 'u-1', reason: 'spam' }, '127.0.0.1');

    expect(out.id).toBe('ban-1');
    expect((prisma.ban as any).create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u-1', roomId: 'r-1', type: 'room', reason: 'spam' }),
    }));
  });
});
