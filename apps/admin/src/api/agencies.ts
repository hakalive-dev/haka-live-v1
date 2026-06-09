import client from './client'

export function listAgencies(params: Record<string, any> = {}): Promise<any> {
  return client.get('/agencies', { params })
}

export function getAgencyDetail(id: string): Promise<any> {
  return client.get(`/agencies/${id}`)
}

export type CreateAgencyPayload = {
  name: string
  ownerId?: string
  owner?:
    | { mode: 'link'; hakaId: string }
    | {
        mode: 'create'
        displayName: string
        phone?: string | null
        username?: string | null
        country?: string | null
      }
  description?: string
  bdId?: string | null
  region?: string | null
  country?: string
  commissionPct?: number
  hostLimit?: number | null
  withdrawalLimitMonthly?: string | null
  withdrawalLimitBeans?: string | null
}

export function createAgency(data: CreateAgencyPayload): Promise<any> {
  return client.post('/agencies', data)
}

export function updateAgency(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/agencies/${id}`, data)
}

export function deleteAgency(id: string): Promise<any> {
  return client.delete(`/agencies/${id}`)
}

export function setAgencyStatus(id: string, status: string): Promise<any> {
  return client.patch(`/agencies/${id}/status`, { status })
}

export function assignAdmin(agencyId: string, adminId: string): Promise<any> {
  return client.post(`/agencies/${agencyId}/assign-admin`, { adminId })
}

export function removeAdminAssignment(agencyId: string, adminId: string): Promise<any> {
  return client.post(`/agencies/${agencyId}/remove-admin`, { adminId })
}

export function getAgencyAnalytics(id: string, period = 'month'): Promise<any> {
  return client.get(`/agencies/${id}/analytics`, { params: { period } })
}

export function getAgencyHostRetention(id: string, window: '7d' | '30d' = '30d'): Promise<any> {
  return client.get(`/agencies/${id}/host-retention`, { params: { window } })
}

export function getAgencyWallet(id: string): Promise<any> {
  return client.get(`/agencies/${id}/wallet`)
}

export function transferHost(hostUserId: string, toAgencyId: string, reason?: string): Promise<any> {
  return client.post('/agencies/transfer-host', { hostUserId, toAgencyId, reason })
}

export function removeHostFromAgency(agencyId: string, hostUserId: string, reason?: string): Promise<any> {
  return client.post(`/agencies/${agencyId}/remove-host`, { hostUserId, reason })
}

export function freezeAgencyWithdrawals(
  agencyId: string,
  data: { reason?: string; severity?: string; duration?: string; cascadeToHosts?: boolean } = {},
): Promise<any> {
  return client.post(`/agencies/${agencyId}/freeze-withdrawals`, data)
}

export function unfreezeAgencyWithdrawals(
  agencyId: string,
  data: { reason?: string; severity?: string; duration?: string; cascadeToHosts?: boolean } = {},
): Promise<any> {
  return client.post(`/agencies/${agencyId}/unfreeze-withdrawals`, data)
}

export const getAgencyPerformance = (id: string, period = 'month'): Promise<any> =>
  client.get(`/agencies/${id}/performance`, { params: { period } })

export const listAdminsForManagement = (period = 'month'): Promise<any> =>
  client.get('/management/admins', { params: { period } })

export const assignBdToAdmin = (bdId: string, adminId: string): Promise<any> =>
  client.post('/management/assign-bd', { bdId, adminId })

export const transferBd = (bdId: string, toAdminId: string): Promise<any> =>
  client.post('/management/transfer-bd', { bdId, toAdminId })

export function getAdminWithdrawalFreeze(adminId: string): Promise<any> {
  return client.get(`/management/admins/${adminId}/withdrawal-freeze`)
}

export function setAdminWithdrawalFreeze(
  adminId: string,
  data: { isFrozen: boolean; reason?: string; countryCode?: string },
): Promise<any> {
  return client.post(`/management/admins/${adminId}/withdrawal-freeze`, data)
}

export function transferAgenciesBetweenAdmins(data: {
  fromAdminId: string
  toAdminId: string
  agencyIds?: string[]
}): Promise<any> {
  return client.post('/management/admins/transfer-agencies', data)
}
