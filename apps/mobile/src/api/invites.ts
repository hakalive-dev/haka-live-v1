import { apiClient } from "./client";
import { useMock } from "./config";
import { walletApi } from "./wallet";
import type {
  InviteCode,
  InviteSummary,
  PaginatedResult,
  CreatorInvitation,
  InvitationReward,
  InvitationRule,
  InvitationSummary,
  InvitationRankEntry,
  InviteShareholderRewards,
} from "../types";

const MOCK_CODE: InviteCode = {
  id: "ic-mock-1",
  inviterId: "user-mock-1",
  inviteeId: null,
  code: "HAKA1234",
  status: "pending",
  rewardCoins: 100,
  rewardClaimed: false,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const INVITES_LIST_LIMIT = 100;

type LeaderboardApiUser = {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  hakaId: string | null;
  originalHakaId?: string | null;
  activeSpecialId: string | null;
  activeSpecialIdLevel: string | null;
};

type LeaderboardApiItem = {
  rank: number;
  score: number;
  user: LeaderboardApiUser;
};

type ShareholderRewardsApiItem = LeaderboardApiItem & {
  shareholderBonus: number;
};

function mapLeaderboardItem(
  item: LeaderboardApiItem,
  shareholderBonus?: number,
): InvitationRankEntry {
  return {
    rank: item.rank,
    score: item.score,
    shareholder_bonus: shareholderBonus,
    id: item.user.id,
    username: item.user.username ?? "",
    displayName: item.user.displayName,
    avatar: item.user.avatar,
    hakaId: item.user.hakaId ?? item.user.originalHakaId ?? "",
    activeSpecialId: item.user.activeSpecialId,
    activeSpecialIdLevel: item.user.activeSpecialIdLevel,
  };
}

async function fetchMyInviteCodesPage(
  page: number,
  limit: number,
): Promise<PaginatedResult<InviteCode>> {
  const res = await apiClient.get<PaginatedResult<InviteCode>>("/invites/my", {
    params: { page, limit },
  });
  return res.data;
}

function mapInviteCodeToCreatorInvitation(code: InviteCode): CreatorInvitation {
  const inv = code.invitee;
  return {
    id: code.id,
    code: code.code,
    invitee: inv
      ? {
          id: inv.id,
          username: inv.username ?? "",
          hakaId: inv.hakaId ?? "",
          displayName: inv.displayName,
          avatar: inv.avatar ?? "",
        }
      : null,
    invitee_hakaId: inv?.hakaId ?? "",
    status: code.status,
    reward_claimed: code.rewardClaimed,
    reward_coins: code.rewardCoins,
    created_at: code.createdAt,
  };
}

export const invitesApi = {
  // ── Node.js endpoints ──────────────────────────────────────────────────────

  /** Generate a new invite code for the current user */
  async generate(): Promise<InviteCode> {
    if (useMock) return MOCK_CODE;
    const res = await apiClient.post<InviteCode>("/invites/generate");
    return res.data;
  },

  /** Accept an invite code */
  async accept(code: string): Promise<InviteCode> {
    if (useMock)
      return { ...MOCK_CODE, status: "accepted", inviteeId: "user-mock-2" };
    const res = await apiClient.post<InviteCode>("/invites/accept", { code });
    return res.data;
  },

  /** Get paginated list of invite codes the current user generated */
  async getMyInviteCodes(
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<InviteCode>> {
    if (useMock)
      return {
        items: [MOCK_CODE],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      };
    return fetchMyInviteCodesPage(page, limit);
  },

  /** Get invite stats summary (Node.js) */
  async getInviteSummary(): Promise<InviteSummary> {
    if (useMock)
      return { totalInvites: 5, acceptedInvites: 2, totalCoinsEarned: 200 };
    const res = await apiClient.get<InviteSummary>("/invites/summary");
    return res.data;
  },

  // ── Legacy API (screens compatibility) ────────────────────────────────────

  async getSummary(): Promise<InvitationSummary> {
    if (useMock) {
      return {
        total_rewards: 300,
        received_rewards: 200,
        rewards_to_unlock: 100,
        wallet_balance: 1500,
        total_invitations: 5,
        accepted_invitations: 2,
      };
    }
    const [sumRes, balance, codesRes] = await Promise.all([
      apiClient.get<InviteSummary>("/invites/summary"),
      walletApi.getBalance(),
      fetchMyInviteCodesPage(1, INVITES_LIST_LIMIT),
    ]);
    const v2 = sumRes.data;
    const pendingUnlock = codesRes.items
      .filter((c) => c.status === "pending")
      .reduce((acc, c) => acc + c.rewardCoins, 0);

    return {
      total_rewards: v2.totalCoinsEarned,
      received_rewards: v2.totalCoinsEarned,
      rewards_to_unlock: pendingUnlock,
      wallet_balance: balance.coinBalance,
      total_invitations: v2.totalInvites,
      accepted_invitations: v2.acceptedInvites,
    };
  },

  /**
   * Legacy alias: generates a new invite code (same as `generate()`).
   * Per-user targeting is not supported; share the returned link instead.
   */
  async sendInvitation(_hakaId: string): Promise<CreatorInvitation> {
    if (useMock) {
      return {
        id: "inv-mock-1",
        code: MOCK_CODE.code,
        invitee: null,
        invitee_hakaId: _hakaId,
        status: "pending",
        reward_claimed: false,
        reward_coins: 100,
        created_at: new Date().toISOString(),
      };
    }
    const res = await apiClient.post<InviteCode>("/invites/generate");
    const code = res.data;
    return mapInviteCodeToCreatorInvitation(code);
  },

  async getMyInvitations(_params?: {
    month?: string;
    search?: string;
  }): Promise<CreatorInvitation[]> {
    if (useMock) return [];
    void _params;
    const result = await fetchMyInviteCodesPage(1, INVITES_LIST_LIMIT);
    return result.items.map(mapInviteCodeToCreatorInvitation);
  },

  async getRewards(_type?: string): Promise<InvitationReward[]> {
    void _type;
    if (useMock) return [];
    const result = await fetchMyInviteCodesPage(1, INVITES_LIST_LIMIT);
    return result.items
      .filter((c) => c.status === "accepted")
      .map((c) => ({
        id: c.id,
        reward_type: "invitation_bonus" as const,
        coins: c.rewardCoins,
        collected: c.rewardClaimed,
        description: "Invite reward",
        created_at: c.updatedAt,
      }));
  },

  async collectRewards(): Promise<{ collected_coins: number }> {
    if (useMock) return { collected_coins: 0 };
    throw new Error(
      "Invite rewards are credited automatically when someone accepts your code.",
    );
  },

  async getRules(): Promise<InvitationRule[]> {
    return [];
  },

  async getRank(_month?: string): Promise<InvitationRankEntry[]> {
    void _month;
    if (useMock) return [];
    const res = await apiClient.get<{ items: LeaderboardApiItem[] }>(
      "/invites/leaderboard",
      {
        params: { page: 1, limit: 50 },
      },
    );
    const { items } = res.data;
    return items.map((item) => mapLeaderboardItem(item));
  },

  async getShareholderRewards(
    page = 1,
    limit = 50,
  ): Promise<InviteShareholderRewards> {
    if (useMock) {
      return {
        period: "weekly",
        totalPoints: 0,
        shareholderBonusPool: 0,
        items: [],
        page: 1,
        limit,
        hasMore: false,
        total: 0,
      };
    }
    const res = await apiClient.get<{
      period: string;
      totalPoints: number;
      shareholderBonusPool: number;
      items: ShareholderRewardsApiItem[];
      page: number;
      limit: number;
      hasMore: boolean;
      total: number;
    }>("/invites/shareholder-rewards", { params: { page, limit } });
    const data = res.data;
    return {
      period: data.period,
      totalPoints: data.totalPoints,
      shareholderBonusPool: data.shareholderBonusPool,
      items: data.items.map((item) =>
        mapLeaderboardItem(item, item.shareholderBonus),
      ),
      page: data.page,
      limit: data.limit,
      hasMore: data.hasMore,
      total: data.total,
    };
  },
};
