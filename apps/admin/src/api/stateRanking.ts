import client from './client';

export type StateRankingConfigRow = {
  id: string;
  enabled: boolean;
  topHostsPerState: number;
  hostSplitPercentages: number[];
  stateRankTiers: Array<{ stateRankMin: number; stateRankMax: number; poolTotal: number }>;
  requireFaceVerification: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StateRankingRewardRow = {
  id: string;
  userId: string;
  periodDate: string;
  countryCode: string;
  stateCode: string;
  stateRank: number;
  hostRank: number;
  rewardAmount: number;
  createdAt: string;
  user: { id: string; displayName: string; hakaId: string | null };
};

export async function getConfig(): Promise<StateRankingConfigRow> {
  return client.get('/state-ranking/config') as Promise<StateRankingConfigRow>;
}

export async function patchConfig(
  body: Partial<
    Pick<
      StateRankingConfigRow,
      'enabled' | 'topHostsPerState' | 'hostSplitPercentages' | 'stateRankTiers' | 'requireFaceVerification'
    >
  >,
): Promise<StateRankingConfigRow> {
  return client.patch('/state-ranking/config', body) as Promise<StateRankingConfigRow>;
}

export async function listRewards(limit = 50): Promise<StateRankingRewardRow[]> {
  const data = (await client.get('/state-ranking/rewards', {
    params: { limit },
  })) as { items: StateRankingRewardRow[] };
  return data.items;
}
