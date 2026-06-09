import client from './client'

export interface SystemWalletInfo {
  walletType: string
  balance: string
  totalIn: string
  totalOut: string
}

export interface CirculationStats {
  totalMinted: string
  totalIssued: string
  userCoins: string
  recoveryCoins: string
  bonusCoins: string
  revenueCoins: string
}

export interface SystemTx {
  id: string
  txType: string
  amount: string
  fromWallet: string | null
  toWallet: string | null
  targetUserId: string | null
  reason: string
  performedBy: string
  fromBalanceAfter: string | null
  toBalanceAfter: string | null
  status: string
  reversalOf: string | null
  createdAt: string
}

export interface MintRequest {
  id: string
  requestedBy: string
  approvedBy: string | null
  amount: string
  reason: string
  status: string
  rejectReason: string | null
  createdAt: string
  updatedAt: string
}

export async function getOverview(): Promise<{ wallets: SystemWalletInfo[]; circulation: CirculationStats; pendingMints: number }> {
  const r = await client.get('/admin/master-wallet')
  return r.data.data
}

export async function listTransactions(params: {
  page?: number; limit?: number; txType?: string; targetUserId?: string; status?: string
}): Promise<{ transactions: SystemTx[]; pagination: any }> {
  const r = await client.get('/admin/master-wallet/transactions', { params })
  return r.data.data
}

export async function listMintRequests(status?: string): Promise<MintRequest[]> {
  const r = await client.get('/admin/master-wallet/mint-requests', { params: status ? { status } : {} })
  return r.data.data
}

export async function requestMint(payload: { amount: number; reason: string }) {
  const r = await client.post('/admin/master-wallet/mint-requests', payload)
  return r.data
}

export async function approveMint(id: string) {
  const r = await client.post(`/admin/master-wallet/mint-requests/${id}/approve`)
  return r.data
}

export async function rejectMint(id: string, rejectReason: string) {
  const r = await client.post(`/admin/master-wallet/mint-requests/${id}/reject`, { rejectReason })
  return r.data
}

export async function transferWallets(payload: { fromType: string; toType: string; amount: number; reason: string }) {
  const r = await client.post('/admin/master-wallet/transfer', payload)
  return r.data
}

export async function creditUser(payload: { userId: string; amount: number; reason: string }) {
  const r = await client.post('/admin/master-wallet/credit-user', payload)
  return r.data
}

export async function deductUser(payload: { userId: string; amount: number; reason: string }) {
  const r = await client.post('/admin/master-wallet/deduct-user', payload)
  return r.data
}

export async function reverseTransaction(id: string, reason: string) {
  const r = await client.post(`/admin/master-wallet/transactions/${id}/reverse`, { reason })
  return r.data
}
