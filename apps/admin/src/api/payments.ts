import client from './client'
import axios from 'axios'
import { adminApiBase } from '@/lib/apiUrl'

const API_BASE = adminApiBase()

export function listWallets(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/wallets', { params })
}

export function getWalletByUserId(userId: string): Promise<any> {
  return client.get(`/payments/wallets/user/${userId}`)
}

export function listWalletTransactions(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/transactions', { params })
}

export function listCoinPurchases(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/purchases', { params })
}

export function getCoinPurchasesSummary(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/purchases/summary', { params })
}

export async function exportCoinPurchases(params: Record<string, any> = {}): Promise<Blob> {
  const token = localStorage.getItem('admin_access_token')
  const response = await axios.get(`${API_BASE}/payments/purchases/export`, {
    params,
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return response.data
}

export function adjustBalance(userId: string, currency: 'coins' | 'beans', amount: number, reason: string): Promise<any> {
  return client.post(`/payments/wallets/user/${userId}/adjust`, { currency, amount, reason })
}

export function listWithdrawals(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/withdrawals', { params })
}

export function approveWithdrawal(id: string): Promise<any> {
  return client.post(`/payments/withdrawals/${id}/approve`)
}

export function rejectWithdrawal(id: string, notes: string): Promise<any> {
  return client.post(`/payments/withdrawals/${id}/reject`, { notes })
}

export function listPayrollAgents(countryCode?: string): Promise<any[]> {
  const params = countryCode ? { countryCode } : {}
  return client.get('/payments/withdrawals/payroll-agents', { params })
}

export function assignWithdrawal(id: string, agentUserId: string): Promise<any> {
  return client.post(`/payments/withdrawals/${id}/assign`, { agentUserId })
}

export function verifyWithdrawalProof(id: string): Promise<any> {
  return client.post(`/payments/withdrawals/${id}/verify-proof`)
}

export function freezeWithdrawal(id: string): Promise<any> {
  return client.post(`/payments/withdrawals/${id}/freeze`)
}

export interface PayrollAgentRow {
  userId: string
  payrollId: string
  countryCode: string
  status: string
  commissionPercent: number
  acceptingOrders: boolean
  riskScore: number
  user: { id: string; displayName: string; hakaId: string | null; username: string | null }
}

export function listPayrollAgentProfiles(countryCode?: string): Promise<PayrollAgentRow[]> {
  const params = countryCode ? { countryCode } : {}
  return client.get('/payments/payroll-agents', { params })
}

export function createPayrollAgent(payload: {
  hakaId: string
  countryCode: string
  commissionPercent?: number
}): Promise<any> {
  return client.post('/payments/payroll-agents', payload)
}

export function updatePayrollAgent(
  userId: string,
  payload: {
    status?: string
    countryCode?: string
    commissionPercent?: number
    acceptingOrders?: boolean
  },
): Promise<any> {
  return client.patch(`/payments/payroll-agents/${userId}`, payload)
}

// ── Seller recharge settings (simple form — no JSON keys) ───────────────────

export interface SellerRechargeSettings {
  epay_email: string
  usdt_trc20_address: string
  usdt_bep20_address: string
  direct_user_topup_enabled: boolean
}

export function getSellerRechargeSettings(): Promise<SellerRechargeSettings> {
  return client.get('/payments/seller-recharge-settings')
}

export function updateSellerRechargeSettings(
  payload: SellerRechargeSettings,
): Promise<SellerRechargeSettings> {
  return client.put('/payments/seller-recharge-settings', payload)
}

// ── Seller Recharge Requests ─────────────────────────────────────────────────

export function listSellerRecharges(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/seller-recharges', { params })
}

export function approveSellerRecharge(id: string): Promise<any> {
  return client.post(`/payments/seller-recharges/${id}/approve`)
}

export function rejectSellerRecharge(id: string, notes: string): Promise<any> {
  return client.post(`/payments/seller-recharges/${id}/reject`, { notes })
}

// ── Seller point exchange requests ────────────────────────────────────────────

export function listSellerExchanges(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payments/seller-exchanges', { params })
}

export function approveSellerExchange(id: string): Promise<any> {
  return client.post(`/payments/seller-exchanges/${id}/approve`)
}

export function rejectSellerExchange(id: string, notes: string): Promise<any> {
  return client.post(`/payments/seller-exchanges/${id}/reject`, { notes })
}

// ── Currency Rates ───────────────────────────────────────────────────────────
export interface CurrencyRate {
  id: string
  countryCode: string
  countryName: string
  currency: string
  symbol: string
  usdRate: number
  minWithdrawalBeans: number
  displayOrder: number
  isActive: boolean
  source: 'manual' | 'auto'
  lastSyncedAt: string | null
}

export function listCurrencies(): Promise<CurrencyRate[]> {
  return client.get('/payments/currencies')
}

export function upsertCurrency(payload: {
  countryCode: string
  countryName: string
  currency: string
  symbol: string
  usdRate: number
  isActive?: boolean
  minWithdrawalBeans?: number
  displayOrder?: number
}): Promise<CurrencyRate> {
  return client.post('/payments/currencies', payload)
}

export function importCurrencies(): Promise<{ created: number; updated: number; skipped: number }> {
  return client.post('/payments/currencies/import')
}

export function bulkActivateCurrencies(
  countryCodes: string[],
  isActive: boolean,
): Promise<{ updated: number }> {
  return client.post('/payments/currencies/bulk-activate', { countryCodes, isActive })
}

export function deleteCurrency(countryCode: string): Promise<void> {
  return client.delete(`/payments/currencies/${countryCode}`)
}

export function syncCurrencies(): Promise<{ updated: number; skipped: number }> {
  return client.post('/payments/currencies/sync')
}
