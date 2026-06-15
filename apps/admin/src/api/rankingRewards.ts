import client from './client';

export type RewardBoard = 'agent' | 'creator';

export type RankingRewardTier = { rankMin: number; rankMax: number; amount: number };

export type RankingRewardConfigRow = {
  id: RewardBoard;
  enabled: boolean;
  period: 'daily' | 'weekly' | 'monthly';
  rewardTiers: RankingRewardTier[];
  requireFaceVerification: boolean;
  updatedAt: string;
};

export type RankingRewardRow = {
  id: string;
  userId: string;
  board: RewardBoard;
  period: string;
  periodDate: string;
  rank: number;
  score: number;
  rewardAmount: number;
  createdAt: string;
  user: { id: string; displayName: string; hakaId: string | null };
};

export async function getConfig(board: RewardBoard): Promise<RankingRewardConfigRow> {
  return client.get(`/ranking-rewards/${board}/config`) as Promise<RankingRewardConfigRow>;
}

export async function patchConfig(
  board: RewardBoard,
  body: Partial<Pick<RankingRewardConfigRow, 'enabled' | 'period' | 'rewardTiers' | 'requireFaceVerification'>>,
): Promise<RankingRewardConfigRow> {
  return client.patch(`/ranking-rewards/${board}/config`, body) as Promise<RankingRewardConfigRow>;
}

export async function listRewards(board: RewardBoard, limit = 50): Promise<RankingRewardRow[]> {
  const data = (await client.get(`/ranking-rewards/${board}/rewards`, {
    params: { limit },
  })) as { items: RankingRewardRow[] };
  return data.items;
}

// ── House entries (admin-seeded ranking competitors) ──────────────────────────

export type HouseBoard = 'agent' | 'creator' | 'state';

export type HouseEntryRow = {
  id: string;
  board: HouseBoard;
  userId: string;
  income: number;
  note: string;
  active: boolean;
  createdAt: string;
  user: { id: string; displayName: string; hakaId: string | null };
};

export async function listHouseEntries(board: HouseBoard): Promise<HouseEntryRow[]> {
  const data = (await client.get(`/ranking-rewards/${board}/house`)) as { items: HouseEntryRow[] };
  return data.items;
}

export async function addHouseEntry(
  board: HouseBoard,
  idOrHaka: string,
  income: number,
  note = '',
): Promise<HouseEntryRow> {
  return client.post(`/ranking-rewards/${board}/house`, { idOrHaka, income, note }) as Promise<HouseEntryRow>;
}

export async function setHouseEntryActive(id: string, active: boolean): Promise<HouseEntryRow> {
  return client.patch(`/ranking-rewards/house/${id}`, { active }) as Promise<HouseEntryRow>;
}

export async function deleteHouseEntry(id: string): Promise<void> {
  await client.delete(`/ranking-rewards/house/${id}`);
}
