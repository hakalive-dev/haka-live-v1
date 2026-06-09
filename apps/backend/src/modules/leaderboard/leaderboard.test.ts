// ── Mock dependencies ─────────────────────────────────────────────────────────

jest.mock('../../config/redis', () => ({
  redis: {
    zadd: jest.fn(),
    zrevrange: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
    zcard: jest.fn(),
    zincrby: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn(),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userSettings: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import * as leaderboardService from './leaderboard.service';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('leaderboardService.getLeaderboard — WITHSCORES parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('correctly parses WITHSCORES flat array into ranked entries', async () => {
    // Redis ZREVRANGE ... WITHSCORES returns a flat array: [member, score, member, score, ...]
    const withScoresOutput = ['user-1', '5000', 'user-2', '3200', 'user-3', '1100'];

    (mockRedis.zrevrange as jest.Mock).mockResolvedValue(withScoresOutput);
    (mockRedis.zcard as jest.Mock).mockResolvedValue(3);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-1', username: 'alice', displayName: 'Alice', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
      { id: 'user-2', username: 'bob', displayName: 'Bob', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
      { id: 'user-3', username: 'charlie', displayName: 'Charlie', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    const result = await leaderboardService.getLeaderboard('leaderboard:rich:all', 1, 20);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ rank: 1, score: 5000, user: expect.objectContaining({ username: 'alice' }) });
    expect(result.items[1]).toMatchObject({ rank: 2, score: 3200, user: expect.objectContaining({ username: 'bob' }) });
    expect(result.items[2]).toMatchObject({ rank: 3, score: 1100, user: expect.objectContaining({ username: 'charlie' }) });
  });

  it('returns empty items array when leaderboard is empty', async () => {
    (mockRedis.zrevrange as jest.Mock).mockResolvedValue([]);

    const result = await leaderboardService.getLeaderboard('leaderboard:charm:all', 1, 20);

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('calculates correct rank offset on page 2', async () => {
    const withScoresOutput = ['user-21', '200', 'user-22', '100'];

    (mockRedis.zrevrange as jest.Mock).mockResolvedValue(withScoresOutput);
    (mockRedis.zcard as jest.Mock).mockResolvedValue(22);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-21', username: 'u21', displayName: 'User 21', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
      { id: 'user-22', username: 'u22', displayName: 'User 22', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    const result = await leaderboardService.getLeaderboard('leaderboard:rich:all', 2, 20);

    expect(result.items[0].rank).toBe(21);
    expect(result.items[1].rank).toBe(22);
  });

  it('handles users missing from Postgres with graceful fallback', async () => {
    const withScoresOutput = ['user-orphan', '999'];

    (mockRedis.zrevrange as jest.Mock).mockResolvedValue(withScoresOutput);
    (mockRedis.zcard as jest.Mock).mockResolvedValue(1);
    // Simulate user deleted from DB but still in Redis
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const result = await leaderboardService.getLeaderboard('leaderboard:rich:all', 1, 20);

    expect(result.items[0].user).toMatchObject({ id: 'user-orphan', displayName: '', avatar: '' });
  });
});

describe('leaderboardService.getMyRank', () => {
  it('returns 1-indexed rank and score for a ranked user', async () => {
    (mockRedis.zrevrank as jest.Mock).mockResolvedValue(0); // 0-indexed
    (mockRedis.zscore as jest.Mock).mockResolvedValue('5000');

    const result = await leaderboardService.getMyRank('leaderboard:rich:all', 'user-1');

    expect(result).toEqual({ rank: 1, score: 5000 });
  });

  it('returns null rank when user is not on leaderboard', async () => {
    (mockRedis.zrevrank as jest.Mock).mockResolvedValue(null);
    (mockRedis.zscore as jest.Mock).mockResolvedValue(null);

    const result = await leaderboardService.getMyRank('leaderboard:rich:all', 'user-unknown');

    expect(result).toEqual({ rank: null, score: null });
  });
});

describe('leaderboardService score update functions', () => {
  const mockExec = jest.fn().mockResolvedValue([]);
  const mockPipeline = {
    zincrby: jest.fn().mockReturnThis(),
    zrevrank: jest.fn().mockReturnThis(),
    exec: mockExec,
  };

  beforeEach(() => {
    mockExec.mockResolvedValue([]);
    (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
  });

  it('calls zincrby with correct key and delta for rich board', async () => {
    (mockRedis.zincrby as jest.Mock).mockResolvedValue(0);
    await leaderboardService.updateRichScore('user-1', 1500);
    expect(mockRedis.zincrby).toHaveBeenCalledWith('leaderboard:rich:all', 1500, 'user-1');
  });

  it('calls zincrby with correct key and delta for charm board', async () => {
    (mockRedis.zincrby as jest.Mock).mockResolvedValue(0);
    await leaderboardService.updateCharmScore('user-2', 800);
    expect(mockRedis.zincrby).toHaveBeenCalledWith('leaderboard:charm:all', 800, 'user-2');
  });
});

describe('leaderboardService.displayCountryName', () => {
  it('maps ISO codes to display names', () => {
    expect(leaderboardService.displayCountryName('GB')).toBe('United Kingdom');
    expect(leaderboardService.displayCountryName('ph')).toBe('Philippines');
  });

  it('returns trimmed full names as-is', () => {
    expect(leaderboardService.displayCountryName('  India  ')).toBe('India');
  });
});

describe('leaderboardService.buildRegionKeyFromUserCountryCity', () => {
  it('returns null when city is blank', () => {
    expect(leaderboardService.buildRegionKeyFromUserCountryCity('IN', '')).toBeNull();
    expect(leaderboardService.buildRegionKeyFromUserCountryCity('IN', '   ')).toBeNull();
  });

  it('returns stable slug for country and city', () => {
    const k = leaderboardService.buildRegionKeyFromUserCountryCity('IN', 'Delhi');
    expect(k).toMatch(/^in_delhi$/);
  });
});

describe('leaderboardService.updateEarnerScore', () => {
  const mockExec = jest.fn().mockResolvedValue([]);
  const mockPipeline = {
    zincrby: jest.fn().mockReturnThis(),
    exec: mockExec,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExec.mockResolvedValue([]);
    (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
  });

  it('increments regional earner keys when host has city', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      agentId: null,
      country: 'IN',
      city: 'Delhi',
      role: 'host',
      gender: 'male',
    });

    await leaderboardService.updateEarnerScore('host-1', 100);

    expect(mockRedis.pipeline).toHaveBeenCalled();
    expect(mockPipeline.zincrby).toHaveBeenCalledWith(
      'leaderboard:region:earners:daily:in_delhi',
      100,
      'host-1',
    );
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('skips regional keys when city is empty', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      agentId: null,
      country: 'IN',
      city: '',
      role: 'host',
      gender: 'male',
    });

    await leaderboardService.updateEarnerScore('host-2', 50);

    const regionalCalls = (mockPipeline.zincrby as jest.Mock).mock.calls.filter((c: string[]) =>
      String(c[0]).startsWith('leaderboard:region:earners:'),
    );
    expect(regionalCalls).toHaveLength(0);
  });

  it('increments creator keys for female hosts', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      agentId: null,
      country: 'IN',
      city: 'Delhi',
      role: 'host',
      gender: 'female',
    });

    await leaderboardService.updateEarnerScore('host-female', 200);

    const creatorCalls = (mockPipeline.zincrby as jest.Mock).mock.calls.filter((c: string[]) =>
      String(c[0]).startsWith('leaderboard:creators:'),
    );
    expect(creatorCalls).toEqual([
      ['leaderboard:creators:daily', 200, 'host-female'],
      ['leaderboard:creators:weekly', 200, 'host-female'],
      ['leaderboard:creators:monthly', 200, 'host-female'],
    ]);
  });

  it('does not increment creator keys for male hosts', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      agentId: null,
      country: 'IN',
      city: 'Delhi',
      role: 'host',
      gender: 'male',
    });

    await leaderboardService.updateEarnerScore('host-male', 200);

    const creatorCalls = (mockPipeline.zincrby as jest.Mock).mock.calls.filter((c: string[]) =>
      String(c[0]).startsWith('leaderboard:creators:'),
    );
    expect(creatorCalls).toHaveLength(0);
  });
});

describe('leaderboardService.getCreatorLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ranked entries from creator Redis key', async () => {
    const withScoresOutput = ['host-f-1', '900', 'host-f-2', '400'];

    (mockRedis.zrevrange as jest.Mock).mockResolvedValue(withScoresOutput);
    (mockRedis.zcard as jest.Mock).mockResolvedValue(2);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'host-f-1',
        username: 'alice',
        displayName: 'Alice',
        avatar: '',
        hakaId: null,
        gender: 'female',
        role: 'host',
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
      {
        id: 'host-f-2',
        username: 'bella',
        displayName: 'Bella',
        avatar: '',
        hakaId: null,
        gender: 'female',
        role: 'host',
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    ]);

    const result = await leaderboardService.getCreatorLeaderboard(
      'leaderboard:creators:daily',
      1,
      20,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ rank: 1, score: 900 });
    expect(result.items[1]).toMatchObject({ rank: 2, score: 400 });
  });
});
