import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import {
  clearDisconnectSeatGrace,
  disconnectSeatGraceKey,
  rememberDisconnectSeats,
  restoreSeatsFromDisconnectGrace,
} from './room-seat-grace';

jest.mock('../../config/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    roomSeat: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockSet = redis.set as jest.Mock;
const mockGet = redis.get as jest.Mock;
const mockDel = redis.del as jest.Mock;
const mockFindUnique = prisma.roomSeat.findUnique as jest.Mock;
const mockUpdate = prisma.roomSeat.update as jest.Mock;

describe('room-seat-grace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rememberDisconnectSeats writes JSON positions with TTL', async () => {
    await rememberDisconnectSeats('room-1', 'u-1', [2, 3]);
    expect(mockSet).toHaveBeenCalledWith(
      disconnectSeatGraceKey('room-1', 'u-1'),
      JSON.stringify([2, 3]),
      'EX',
      expect.any(Number),
    );
  });

  it('restoreSeatsFromDisconnectGrace re-assigns empty unlocked seats', async () => {
    mockGet.mockResolvedValue(JSON.stringify([2]));
    mockFindUnique.mockResolvedValue({ userId: null, isLocked: false, isMuted: false });
    mockUpdate.mockResolvedValue({
      position: 2,
      userId: 'u-1',
      isLocked: false,
      isMuted: false,
      user: {
        id: 'u-1',
        username: 'viewer',
        displayName: 'Viewer',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    });

    const restored = await restoreSeatsFromDisconnectGrace('room-1', 'u-1');
    expect(restored).toHaveLength(1);
    expect(restored[0]?.position).toBe(2);
    expect(mockDel).toHaveBeenCalledWith(disconnectSeatGraceKey('room-1', 'u-1'));
  });

  it('clearDisconnectSeatGrace deletes the key', async () => {
    await clearDisconnectSeatGrace('room-1', 'u-1');
    expect(mockDel).toHaveBeenCalledWith(disconnectSeatGraceKey('room-1', 'u-1'));
  });
});
