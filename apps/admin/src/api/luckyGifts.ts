import client from './client'

export interface LuckyMultiplierTier {
  multiplier: number
  rewardCoins: number
  weight: number
}

export interface LuckySettingDTO {
  enabled: boolean
  winProbability: number
  /** Weighted average display multiplier across tiers. */
  winMultiplier: number
  /** Weighted average coin reward across tiers. */
  averageRewardCoins: number
  winMultiplierTiers: LuckyMultiplierTier[]
  receiverBenefitPercent: number
  dailyUserWinCapCoins: string
  updatedBy: string
  updatedAt: string
  /** Expected sender return: winProbability × avg reward / reference stake */
  expectedReturn: number
  /** Sender TRP + host receiver % (keep below 1.0 for house edge). */
  totalPayoutRatio: number
}

export interface LuckyDrawDTO {
  id: string
  giftTransactionId: string
  userId: string
  gift: { id: string; name: string; icon: string }
  roomId: string | null
  coinCost: number
  isWin: boolean
  rewardCoins: number
  receiverBeans: number
  winProbability: number
  winMultiplier: number
  createdAt: string
}

export interface LuckyDrawsPage {
  items: LuckyDrawDTO[]
  total: number
  page: number
  limit: number
}

export interface LuckyStatsDTO {
  totalDraws: number
  totalWins: number
  observedWinRate: number
  configuredWinRate: number
  totalStakedCoins: number
  totalPaidOutCoins: number
  totalReceiverBeans: number
  realizedHouseEdge: number | null
  perGift: Array<{
    gift: { id: string; name: string; icon: string; coinCost: number }
    draws: number
    stakedCoins: number
    paidOutCoins: number
    receiverBeans: number
    realizedHouseEdge: number | null
  }>
}

export type LuckySettingUpdate = Partial<{
  enabled: boolean
  winProbability: number
  winMultiplier: number
  winMultiplierTiers: LuckyMultiplierTier[]
  receiverBenefitPercent: number
  dailyUserWinCapCoins: string
}>

export function getLuckySetting(): Promise<LuckySettingDTO> {
  return client.get('/lucky-gifts/setting') as Promise<LuckySettingDTO>
}

export function updateLuckySetting(data: LuckySettingUpdate): Promise<LuckySettingDTO> {
  return client.patch('/lucky-gifts/setting', data) as Promise<LuckySettingDTO>
}

export function getLuckyStats(): Promise<LuckyStatsDTO> {
  return client.get('/lucky-gifts/stats') as Promise<LuckyStatsDTO>
}

export function listLuckyDraws(params: {
  page?: number
  limit?: number
  isWin?: boolean
} = {}): Promise<LuckyDrawsPage> {
  const q: Record<string, string | number> = {
    page: params.page ?? 1,
    limit: params.limit ?? 25,
  }
  if (params.isWin !== undefined) q.isWin = String(params.isWin)
  return client.get('/lucky-gifts/draws', { params: q }) as Promise<LuckyDrawsPage>
}
