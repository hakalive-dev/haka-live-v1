import client from './client'

export interface TierDTO {
  id: string
  name: string
  minHostIncome: string
  commissionRate: number
  order: number
}

/** Rolling 7-day agency host-income (beans) → gift bonus rate on host share */
export interface GiftBonusTierDTO {
  id: string
  name: string
  minRollingIncome: string
  bonusRate: number
  order: number
}

export interface BonusSettingDTO {
  id: string
  enabled: boolean
  bonusRate: number
  updatedBy: string
  updatedAt: string
}

export async function listTiers(): Promise<TierDTO[]> {
  return client.get('/commission-tiers') as Promise<TierDTO[]>
}

export async function createTier(data: { name: string; minHostIncome: string; commissionRate: number }): Promise<TierDTO> {
  return client.post('/commission-tiers', data) as Promise<TierDTO>
}

export async function updateTier(id: string, data: { name?: string; minHostIncome?: string; commissionRate?: number }): Promise<TierDTO> {
  return client.patch(`/commission-tiers/${id}`, data) as Promise<TierDTO>
}

export async function deleteTier(id: string): Promise<void> {
  await client.delete(`/commission-tiers/${id}`)
}

export async function listGiftBonusTiers(): Promise<GiftBonusTierDTO[]> {
  return client.get('/gift-bonus-tiers') as Promise<GiftBonusTierDTO[]>
}

export async function createGiftBonusTier(data: {
  name: string
  minRollingIncome: string
  bonusRate: number
}): Promise<GiftBonusTierDTO> {
  return client.post('/gift-bonus-tiers', data) as Promise<GiftBonusTierDTO>
}

export async function updateGiftBonusTier(
  id: string,
  data: { name?: string; minRollingIncome?: string; bonusRate?: number },
): Promise<GiftBonusTierDTO> {
  return client.patch(`/gift-bonus-tiers/${id}`, data) as Promise<GiftBonusTierDTO>
}

export async function deleteGiftBonusTier(id: string): Promise<void> {
  await client.delete(`/gift-bonus-tiers/${id}`)
}

export async function getBonusSetting(): Promise<BonusSettingDTO> {
  return client.get('/gift-bonus-setting') as Promise<BonusSettingDTO>
}

export async function updateBonusSetting(data: {
  bonusRate?: number
  enabled?: boolean
}): Promise<BonusSettingDTO> {
  return client.patch('/gift-bonus-setting', data) as Promise<BonusSettingDTO>
}

// ── Per-agency overrides + ledger (gift.manage) ─────────────────────────────

export interface SetCommissionOverrideResponseDTO {
  agencyId: string
  commissionRateOverride: number | null
  commissionRateOverrideValidUntil: string | null
}

export interface SetGiftBonusOverrideResponseDTO {
  agencyId: string
  giftBonusRateOverride: number | null
  giftBonusRateOverrideValidUntil: string | null
}

export interface CommissionLedgerRowDTO {
  id: string
  giftTransactionId: string
  agencyId: string
  recipientUserId: string | null
  kind: 'direct' | 'parent_delta' | 'gift_bonus'
  rateApplied: number
  beanAmount: string
  createdAt: string
}

export interface CommissionLedgerPageDTO {
  rows: CommissionLedgerRowDTO[]
  nextCursor: string | null
}

export async function setAgencyCommissionOverride(
  agencyId: string,
  rate: number | null,
  validUntil?: string | null,
): Promise<SetCommissionOverrideResponseDTO> {
  const body: { rate: number | null; validUntil?: string | null } = { rate }
  if (rate != null) body.validUntil = validUntil ?? null
  return client.patch(`/agencies/${agencyId}/commission-override`, body) as Promise<SetCommissionOverrideResponseDTO>
}

export async function setAgencyGiftBonusOverride(
  agencyId: string,
  rate: number | null,
  validUntil?: string | null,
): Promise<SetGiftBonusOverrideResponseDTO> {
  const body: { rate: number | null; validUntil?: string | null } = { rate }
  if (rate != null) body.validUntil = validUntil ?? null
  return client.patch(`/agencies/${agencyId}/gift-bonus-override`, body) as Promise<SetGiftBonusOverrideResponseDTO>
}

export async function getAgencyCommissionLedger(
  agencyId: string,
  params?: { cursor?: string; limit?: number; from?: string; to?: string },
): Promise<CommissionLedgerPageDTO> {
  return client.get(`/agencies/${agencyId}/commission-ledger`, { params }) as Promise<CommissionLedgerPageDTO>
}
