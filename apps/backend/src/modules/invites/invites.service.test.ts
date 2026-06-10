jest.mock('../wallet/wallet.service', () => ({
  creditCoinsInTransaction: jest.fn(),
}));

jest.mock('../users/users.service', () => ({
  resolveUserId: jest.fn(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    inviteCode: {
      aggregate: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../leaderboard/leaderboard.service', () => ({
  KEYS: { INVITES_WEEKLY: 'leaderboard:invites:weekly' },
  getWeeklyPeriodStart: jest.fn(() => new Date('2026-05-12T00:00:00.000Z')),
  getLeaderboard: jest.fn(),
  sumLeaderboardScores: jest.fn(),
  updateInviteScore: jest.fn(),
}));

jest.mock('../notifications/notifications.service', () => ({
  notifyAccountAlert: jest.fn().mockResolvedValue(undefined),
}));

import { AppError } from '../../middleware/error.middleware';
import { prisma } from '../../config/prisma';
import * as leaderboard from '../leaderboard/leaderboard.service';
import { notifyAccountAlert } from '../notifications/notifications.service';
import { resolveUserId } from '../users/users.service';
import { creditCoinsInTransaction } from '../wallet/wallet.service';
import {
  acceptInvite,
  getShareholderRewards,
  referralCodeFromStoredCode,
} from './invites.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockLeaderboard = leaderboard as jest.Mocked<typeof leaderboard>;
const mockResolveUserId = resolveUserId as jest.MockedFunction<typeof resolveUserId>;
const mockCreditCoinsInTransaction = creditCoinsInTransaction as jest.MockedFunction<
  typeof creditCoinsInTransaction
>;
const mockNotifyAccountAlert = notifyAccountAlert as jest.MockedFunction<
  typeof notifyAccountAlert
>;

describe('referralCodeFromStoredCode', () => {
  it('strips invitee suffix from stored code', () => {
    expect(referralCodeFromStoredCode('500000042:invitee-uuid')).toBe('500000042');
    expect(referralCodeFromStoredCode('LEGACY8CH')).toBe('LEGACY8CH');
  });
});

describe('acceptInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveUserId.mockResolvedValue('inviter-1');
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'inviter-1',
      onboardingComplete: true,
    });
    mockLeaderboard.updateInviteScore.mockResolvedValue(undefined);
  });

  it('credits inviter and creates accepted invite row', async () => {
    const created = {
      id: 'ic-1',
      inviterId: 'inviter-1',
      inviteeId: 'invitee-1',
      code: '500000042:invitee-1',
      status: 'accepted',
      rewardClaimed: true,
      rewardCoins: 100,
      inviter: { id: 'inviter-1', displayName: 'Alice', avatar: '' },
      invitee: { id: 'invitee-1', displayName: 'Bob', avatar: '' },
    };
    mockCreditCoinsInTransaction.mockImplementation(async (opts) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        inviteCode: { create: jest.fn().mockResolvedValue(created) },
      };
      const result = await opts.runInTransaction(tx as never);
      return {
        wallet: {
          id: 'wt-1',
          userId: 'inviter-1',
          coinBalance: BigInt(100),
          beanBalance: BigInt(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        result,
      };
    });

    const result = await acceptInvite('500000042', 'invitee-1');

    expect(mockResolveUserId).toHaveBeenCalledWith('500000042');
    expect(mockCreditCoinsInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'inviter-1',
        reference: 'invite_reward',
        amount: 100,
      }),
    );
    expect(result.code).toBe('500000042');
    expect(mockLeaderboard.updateInviteScore).toHaveBeenCalledWith('inviter-1', 1);
    // Real-time: inviter is notified (in-app + push + socket via notifyAccountAlert).
    expect(mockNotifyAccountAlert).toHaveBeenCalledWith(
      'inviter-1',
      'invite_accepted',
      expect.any(String),
      expect.stringContaining('Bob'),
      expect.objectContaining({
        type: 'invite_accepted',
        inviteeDisplayName: 'Bob',
        rewardCoins: 100,
      }),
    );
  });

  it('throws 404 when inviter cannot be resolved', async () => {
    mockResolveUserId.mockRejectedValue(new AppError('User not found', 404));

    await expect(acceptInvite('999999999', 'invitee-1')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });
  });

  it('throws 400 on self-invite', async () => {
    mockResolveUserId.mockResolvedValue('same-user');

    await expect(acceptInvite('500000042', 'same-user')).rejects.toMatchObject({
      message: 'You cannot accept your own invite',
      statusCode: 400,
    });
  });

  it('throws 400 when invitee already redeemed', async () => {
    mockCreditCoinsInTransaction.mockImplementation((opts) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'existing' }]),
        inviteCode: { create: jest.fn() },
      };
      return opts.runInTransaction(tx as never).then(() => {
        throw new Error('should not reach');
      });
    });

    await expect(acceptInvite('500000042', 'invitee-1')).rejects.toMatchObject({
      message: 'You have already used an invite code',
      statusCode: 400,
    });
  });
});

describe('getShareholderRewards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns totals and proportional shareholder bonus per rank', async () => {
    mockLeaderboard.getLeaderboard.mockResolvedValue({
      items: [
        {
          rank: 1,
          score: 60,
          user: {
            id: 'user-a',
            username: 'alice',
            displayName: 'Alice',
            avatar: '',
            hakaId: null,
            originalHakaId: null,
            equippedFrame: null,
            equippedRing: null,
            equippedChatBubble: null,
            equippedMicVoiceWave: null,
            equippedProfileCard: null,
            equippedDynamicProfile: null,
            activeSpecialId: null,
            activeSpecialIdLevel: null,
            richLevel: 1,
            charmLevel: 1,
          },
        },
        {
          rank: 2,
          score: 40,
          user: {
            id: 'user-b',
            username: 'bob',
            displayName: 'Bob',
            avatar: '',
            hakaId: null,
            originalHakaId: null,
            equippedFrame: null,
            equippedRing: null,
            equippedChatBubble: null,
            equippedMicVoiceWave: null,
            equippedProfileCard: null,
            equippedDynamicProfile: null,
            activeSpecialId: null,
            activeSpecialIdLevel: null,
            richLevel: 1,
            charmLevel: 1,
          },
        },
      ],
      page: 1,
      limit: 50,
      hasMore: false,
      total: 2,
    });
    mockLeaderboard.sumLeaderboardScores.mockResolvedValue(100);
    (mockPrisma.inviteCode.aggregate as jest.Mock).mockResolvedValue({
      _sum: { rewardCoins: 1000 },
    });

    const result = await getShareholderRewards(1, 50);

    expect(result.period).toBe('weekly');
    expect(result.totalPoints).toBe(100);
    expect(result.shareholderBonusPool).toBe(1000);
    expect(result.items[0].shareholderBonus).toBe(600);
    expect(result.items[1].shareholderBonus).toBe(400);
    expect(mockPrisma.inviteCode.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'accepted',
        updatedAt: { gte: new Date('2026-05-12T00:00:00.000Z') },
      },
      _sum: { rewardCoins: true },
    });
  });

  it('returns zero bonuses when pool or points are empty', async () => {
    mockLeaderboard.getLeaderboard.mockResolvedValue({
      items: [
        {
          rank: 1,
          score: 5,
          user: {
            id: 'user-a',
            username: null,
            displayName: 'Alice',
            avatar: '',
            hakaId: null,
            originalHakaId: null,
            equippedFrame: null,
            equippedRing: null,
            equippedChatBubble: null,
            equippedMicVoiceWave: null,
            equippedProfileCard: null,
            equippedDynamicProfile: null,
            activeSpecialId: null,
            activeSpecialIdLevel: null,
            richLevel: 1,
            charmLevel: 1,
          },
        },
      ],
      page: 1,
      limit: 50,
      hasMore: false,
      total: 1,
    });
    mockLeaderboard.sumLeaderboardScores.mockResolvedValue(0);
    (mockPrisma.inviteCode.aggregate as jest.Mock).mockResolvedValue({
      _sum: { rewardCoins: null },
    });

    const result = await getShareholderRewards(1, 50);

    expect(result.shareholderBonusPool).toBe(0);
    expect(result.items[0].shareholderBonus).toBe(0);
  });
});
