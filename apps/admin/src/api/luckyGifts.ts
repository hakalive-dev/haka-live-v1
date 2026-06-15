import client from './client'

export interface LuckyMultiplierTier {
  payoutPercent: number
  weight: number
}

export interface LuckySettingDTO {
  enabled: boolean
  winProbability: number
  /** Weighted average payout % across tiers (on win). */
  winMultiplier: number
  /** Weighted average payout % across tiers. */
  averagePayoutPercent: number
  /** Average coin reward at reference stake (100 coins). */
  averageRewardCoins: number
  winMultiplierTiers: LuckyMultiplierTier[]
  receiverBenefitPercent: number
  dailyUserWinCapCoins: string
  updatedBy: string
  updatedAt: string
  /** Expected sender return: winProbability × avg payout % / 100 */
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

export function updateLuckySetting(body: LuckySettingUpdate): Promise<LuckySettingDTO> {
  return client.patch('/lucky-gifts/setting', body) as Promise<LuckySettingDTO>
}

export function listLuckyDraws(params: {
  page?: number
  limit?: number
  userId?: string
  giftId?: string
  roomId?: string
  isWin?: boolean
  from?: string
  to?: string
}): Promise<LuckyDrawsPage> {
  const q = new URLSearchParams()
  if (params.page != null) q.set('page', String(params.page))
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.userId) q.set('userId', params.userId)
  if (params.giftId) q.set('giftId', params.giftId)
  if (params.roomId) q.set('roomId', params.roomId)
  if (params.isWin != null) q.set('isWin', params.isWin ? 'true' : 'false')
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  const qs = q.toString()
  return client.get(`/lucky-gifts/draws${qs ? `?${qs}` : ''}`) as Promise<LuckyDrawsPage>
}

export function getLuckyStats(): Promise<LuckyStatsDTO> {
  return client.get('/lucky-gifts/stats') as Promise<LuckyStatsDTO>
}
