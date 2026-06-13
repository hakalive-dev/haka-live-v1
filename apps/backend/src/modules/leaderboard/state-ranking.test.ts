jest.mock('../../config/redis', () => ({
  redis: {
    zrevrange: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
    zcard: jest.fn(),
    zincrby: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn(),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    stateRankingConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    stateRankingReward: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../moderation/super-admin-power', () => ({
  hasSuperAdminPower: jest.fn().mockResolvedValue(false),
}));

jest.mock('../moderation/tags.service', () => ({
  getUserTagNames: jest.fn().mockResolvedValue([]),
}));

import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import {
  hostRewardAmount,
  poolForStateRank,
  totalDailyPrizePoolForStateCount,
} from '@haka-live/shared-types/state-rankings';
import {
  isStateRankingEligibleHost,
  dailyDateKey,
} from './state-ranking-keys';
import {
  getMyStateRankingRow,
  listStateRankings,
  resolveCountryCodeForRequest,
  updateStateHostScore,
  canInspectAllStateRankings,
} from './state-ranking.service';
import { DEFAULT_STATE_RANK_REWARD_TIERS } from './state-ranking.constants';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('state-ranking eligibility', () => {
  it('accepts verified female hosts with a valid state in an enabled country', () => {
    expect(
      isStateRankingEligibleHost({
        role: 'host',
        gender: 'female',
        faceVerificationStatus: 'approved',
        country: 'India',
        state: 'MH',
      }),
    ).toBe(true);
  });

  it('rejects male hosts and hosts without face verification', () => {
    expect(
      isStateRankingEligibleHost({
        role: 'host',
        gender: 'male',
        faceVerificationStatus: 'approved',
        country: 'India',
        state: 'MH',
      }),
    ).toBe(false);
    expect(
      isStateRankingEligibleHost({
        role: 'host',
        gender: 'female',
        faceVerificationStatus: 'pending',
        country: 'India',
        state: 'MH',
      }),
    ).toBe(false);
  });

  it('rejects hosts in countries without state ranking config', () => {
    expect(
      isStateRankingEligibleHost({
        role: 'host',
        gender: 'female',
        faceVerificationStatus: 'approved',
        country: 'United Kingdom',
        state: 'MH',
      }),
    ).toBe(false);
  });
});

describe('state-ranking reward math', () => {
  it('maps state rank to tier pool totals', () => {
    expect(poolForStateRank(1, DEFAULT_STATE_RANK_REWARD_TIERS)).toBe(4_000_000);
    expect(poolForStateRank(5, DEFAULT_STATE_RANK_REWARD_TIERS)).toBe(600_000);
    expect(poolForStateRank(40, DEFAULT_STATE_RANK_REWARD_TIERS)).toBe(10_000);
  });

  it('splits pool 65/20/10/5 to top four hosts', () => {
    const pool = 1_000_000;
    expect(hostRewardAmount(pool, 1)).toBe(650_000);
    expect(hostRewardAmount(pool, 2)).toBe(200_000);
    expect(hostRewardAmount(pool, 3)).toBe(100_000);
    expect(hostRewardAmount(pool, 4)).toBe(50_000);
  });

  it('sums tier pools for active state count', () => {
    expect(totalDailyPrizePoolForStateCount(3, DEFAULT_STATE_RANK_REWARD_TIERS)).toBe(
      4_000_000 + 2_000_000 + 1_000_000,
    );
  });
});

describe('state-ranking scoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.stateRankingConfig.findUnique as jest.Mock).mockResolvedValue({
      id: 'singleton',
      enabled: true,
      topHostsPerState: 4,
      hostSplitPercentages: [65, 20, 10, 5],
      stateRankTiers: DEFAULT_STATE_RANK_REWARD_TIERS,
      requireFaceVerification: true,
    });
  });

  it('increments host and state totals in Redis pipeline', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    (mockRedis.pipeline as jest.Mock).mockReturnValue({
      zincrby: jest.fn().mockReturnThis(),
      exec,
    });

    await updateStateHostScore(
      'host-1',
      500,
      {
        role: 'host',
        gender: 'female',
        faceVerificationStatus: 'approved',
        country: 'India',
        state: 'MH',
      },
      dailyDateKey(),
    );

    expect(mockRedis.pipeline).toHaveBeenCalled();
    expect(exec).toHaveBeenCalled();
  });

  it('lists states ranked by gift score with pool rewards', async () => {
    (mockRedis.zrevrange as jest.Mock).mockImplementation(async (key: string) => {
      if (key.includes('totals')) return ['MH', '9000', 'KA', '4000'];
      if (key.includes(':MH:')) return ['host-a', '5000', 'host-b', '4000'];
      if (key.includes(':KA:')) return ['host-c', '4000'];
      return [];
    });
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'host-a', displayName: 'A', avatar: '' },
      { id: 'host-b', displayName: 'B', avatar: '' },
      { id: 'host-c', displayName: 'C', avatar: '' },
    ]);

    const rows = await listStateRankings('IN', '2026-06-13', 5);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rank: 1,
      stateCode: 'MH',
      totalGiftScore: 9000,
      poolReward: 4_000_000,
    });
    expect(rows[0]!.topHosts).toHaveLength(2);
    expect(rows[1]).toMatchObject({ rank: 2, stateCode: 'KA', totalGiftScore: 4000 });
  });

  it('resolves my state rank via zrevrank when not preloaded in list', async () => {
    (mockRedis.zrevrange as jest.Mock).mockResolvedValue([]);
    (mockRedis.zrevrank as jest.Mock).mockResolvedValue(4);
    (mockRedis.zscore as jest.Mock).mockResolvedValue('1200');

    const row = await getMyStateRankingRow('user-1', 'IN', 'TN', '2026-06-13');

    expect(row).toMatchObject({
      rank: 5,
      stateCode: 'TN',
      totalGiftScore: 1200,
      poolReward: 600_000,
    });
  });
});

describe('state-ranking inspector access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grants inspector access via super_admin tag or superAdminPower', async () => {
    const { hasSuperAdminPower } = await import('../moderation/super-admin-power');
    const { getUserTagNames } = await import('../moderation/tags.service');

    (hasSuperAdminPower as jest.Mock).mockResolvedValueOnce(false);
    (getUserTagNames as jest.Mock).mockResolvedValueOnce(['super_admin']);
    expect(await canInspectAllStateRankings('user-1')).toBe(true);

    (hasSuperAdminPower as jest.Mock).mockResolvedValueOnce(true);
    (getUserTagNames as jest.Mock).mockResolvedValueOnce([]);
    expect(await canInspectAllStateRankings('user-2')).toBe(true);

    (hasSuperAdminPower as jest.Mock).mockResolvedValueOnce(false);
    (getUserTagNames as jest.Mock).mockResolvedValueOnce([]);
    expect(await canInspectAllStateRankings('user-3')).toBe(false);
  });

  it('allows cross-country countryCode only for inspectors', async () => {
    const { hasSuperAdminPower } = await import('../moderation/super-admin-power');
    const { getUserTagNames } = await import('../moderation/tags.service');

    (hasSuperAdminPower as jest.Mock).mockResolvedValue(false);
    (getUserTagNames as jest.Mock).mockResolvedValue(['super_admin']);

    await expect(
      resolveCountryCodeForRequest('inspector-1', 'India', 'IN'),
    ).resolves.toBe('IN');

    (getUserTagNames as jest.Mock).mockResolvedValue([]);

    await expect(
      resolveCountryCodeForRequest('normal-1', 'India', 'IN'),
    ).rejects.toThrow('Cross-country state ranking requires inspector access');
  });

  it('defaults to user country when no countryCode requested', async () => {
    await expect(resolveCountryCodeForRequest('user-1', 'India')).resolves.toBe('IN');
  });
});
