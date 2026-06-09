jest.mock('../../config/prisma', () => ({
  prisma: {
    pkMatch: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    pkInvite: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    room: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    incrby: jest.fn(),
    mget: jest.fn(),
    del: jest.fn(),
    zadd: jest.fn(),
    zrange: jest.fn(),
    zrem: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
  },
}));

import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import {
  createInvite,
  acceptInvite,
  getActiveMatchForRoom,
  addScore,
  endMatch,
  joinQueue,
  leaveQueue,
  getLiveRoomsForPk,
} from './pk.service';

const mp = prisma.pkMatch as jest.Mocked<typeof prisma.pkMatch>;
const mi = prisma.pkInvite as jest.Mocked<typeof prisma.pkInvite>;
const mr = prisma.room as jest.Mocked<typeof prisma.room>;
const r = redis as jest.Mocked<typeof redis>;
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('createInvite', () => {
  it('creates a PkInvite with 30s expiry', async () => {
    mi.create.mockResolvedValue({ id: 'inv-1', toHostId: 'h2' } as any);
    const result = await createInvite({
      fromRoomId: 'r1', toRoomId: 'r2',
      fromHostId: 'h1', toHostId: 'h2',
      durationSecs: 300,
    });
    expect(mi.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromRoomId: 'r1', toRoomId: 'r2', durationSecs: 300 }),
    }));
    expect(result.toHostId).toBe('h2');
  });
});

describe('acceptInvite', () => {
  it('creates PkMatch and marks invite accepted', async () => {
    mi.findUnique.mockResolvedValue({
      id: 'inv-1', fromRoomId: 'r1', toRoomId: 'r2',
      fromHostId: 'h1', toHostId: 'h2', durationSecs: 300,
      status: 'pending', expiresAt: new Date(Date.now() + 60000),
    } as any);
    const matchFixture = { id: 'match-1', hostAId: 'h1', hostBId: 'h2', roomAId: 'r1', roomBId: 'r2', durationSecs: 300 };
    mp.create.mockResolvedValue(matchFixture as any);
    mi.update.mockResolvedValue({} as any);
    r.set.mockResolvedValue('OK');
    // Wire $transaction to execute the callback with a tx proxy that delegates to the same mocks
    mockTransaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb({ pkMatch: mp, pkInvite: mi } as unknown as typeof prisma),
    );

    const result = await acceptInvite('inv-1');
    expect(mp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roomAId: 'r1', roomBId: 'r2', status: 'active' }),
    }));
    expect(mi.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inv-1' },
      data: expect.objectContaining({ status: 'accepted' }),
    }));
    expect(result.id).toBe('match-1');
  });

  it('throws if invite expired', async () => {
    mi.findUnique.mockResolvedValue({
      id: 'inv-1', status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    } as any);
    await expect(acceptInvite('inv-1')).rejects.toThrow('expired');
  });
});

describe('getActiveMatchForRoom', () => {
  it('returns active match for roomAId', async () => {
    mp.findFirst.mockResolvedValue({ id: 'match-1', roomAId: 'r1', roomBId: 'r2' } as any);
    const result = await getActiveMatchForRoom('r1');
    expect(mp.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'active' }),
    }));
    expect(result?.id).toBe('match-1');
  });

  it('returns null when no active match', async () => {
    mp.findFirst.mockResolvedValue(null);
    const result = await getActiveMatchForRoom('r-none');
    expect(result).toBeNull();
  });
});

describe('addScore', () => {
  it('increments correct side and returns scores', async () => {
    r.incrby.mockResolvedValue(500);
    r.mget.mockResolvedValue(['500', '200']);
    const result = await addScore('match-1', 'A', 500);
    expect(r.incrby).toHaveBeenCalledWith('pk:match-1:scoreA', 500);
    expect(result).toEqual({ matchId: 'match-1', scoreA: 500, scoreB: 200 });
  });
});

describe('endMatch', () => {
  it('writes winner and cleans up Redis', async () => {
    mp.findFirst.mockResolvedValue({ id: 'match-1', status: 'active' } as any);
    r.mget.mockResolvedValue(['800', '300']);
    mp.update.mockResolvedValue({} as any);
    r.del.mockResolvedValue(3);

    const result = await endMatch('match-1', 'h1', 'h2');
    expect(mp.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'match-1' },
      data: expect.objectContaining({ status: 'ended', scoreA: 800, scoreB: 300, winnerId: 'h1' }),
    }));
    expect(r.del).toHaveBeenCalledWith(
      'pk:match-1:scoreA', 'pk:match-1:scoreB', 'pk:match-1:endsAt',
    );
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('h1');
  });
});

describe('joinQueue / leaveQueue', () => {
  it('adds userId to duration-scoped queue', async () => {
    (r.zadd as jest.Mock).mockResolvedValue(1);
    await joinQueue('u1', 300);
    expect(r.zadd).toHaveBeenCalledWith('pk:queue:300', expect.any(Number), 'u1');
  });

  it('removes userId from queue', async () => {
    r.zrem.mockResolvedValue(1);
    await leaveQueue('u1', 300);
    expect(r.zrem).toHaveBeenCalledWith('pk:queue:300', 'u1');
  });
});
