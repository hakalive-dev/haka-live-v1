import client from './client'

export function listSellers(params: Record<string, any> = {}): Promise<any> {
  return client.get('/seller-coins', { params })
}
export function getSellerDetail(userId: string): Promise<any> {
  return client.get(`/seller-coins/${userId}`)
}
export function assignSeniorTag(userId: string): Promise<any> {
  return client.post(`/seller-coins/${userId}/senior-tag`, {})
}
export function removeSeniorTag(userId: string): Promise<any> {
  return client.delete(`/seller-coins/${userId}/senior-tag`)
}
export function listRechargeRequests(status?: string): Promise<any> {
  return client.get('/seller-coins/recharge-requests', { params: status ? { status } : {} })
}
export function approveRecharge(id: string): Promise<any> {
  return client.post(`/seller-coins/recharge-requests/${id}/approve`, {})
}
export function rejectRecharge(id: string, notes = ''): Promise<any> {
  return client.post(`/seller-coins/recharge-requests/${id}/reject`, { notes })
}
export function deductSellerCoins(userId: string, coins: number, reason: string): Promise<any> {
  return client.post(`/seller-coins/${userId}/deduct`, { coins, reason })
}
