export const queryKeys = {
  rooms: {
    list: (params: Record<string, unknown>) => ['rooms', 'list', params] as const,
    party: (following: boolean) => ['rooms', 'party', following] as const,
    detail: (roomId: string) => ['rooms', 'detail', roomId] as const,
    membership: (roomId: string) => ['rooms', 'membership', roomId] as const,
  },
  chat: {
    inbox: () => ['chat', 'inbox'] as const,
    messagesBadge: () => ['chat', 'messagesBadge'] as const,
    dmMessages: (userId: string) => ['chat', 'dmMessages', userId] as const,
  },
  wallet: {
    balance: () => ['wallet', 'balance'] as const,
  },
  agency: {
    center: () => ['agency', 'center'] as const,
    summaryV2: () => ['agency', 'summaryV2'] as const,
  },
  coinSeller: {
    bootstrap: () => ['coinSeller', 'bootstrap'] as const,
  },
  level: {
    user: (userId: string) => ['level', 'user', userId] as const,
    tiers: () => ['level', 'tiers'] as const,
  },
  profile: {
    me: (userId: string) => ['profile', userId] as const,
    public: (userId: string) => ['profile', 'public', userId] as const,
    gifts: (userId: string) => ['profile', 'gifts', userId] as const,
    fans: (userId: string) => ['profile', 'fans', userId] as const,
    moments: (userId: string) => ['profile', 'moments', userId] as const,
    followers: (userId: string) => ['profile', 'followers', userId] as const,
    following: (userId: string) => ['profile', 'following', userId] as const,
  },
  discover: {
    moments: () => ['discover', 'moments'] as const,
    videos: () => ['discover', 'videos'] as const,
  },
  ranking: {
    list: (params: Record<string, unknown>) => ['ranking', 'list', params] as const,
  },
  search: {
    query: (term: string) => ['search', term] as const,
  },
  payments: {
    currencies: () => ['payments', 'currencies'] as const,
    packages: (currency: string) => ['payments', 'packages', currency] as const,
  },
} as const;
