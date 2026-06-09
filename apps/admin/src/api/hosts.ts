import client from './client'

export const listHosts = (params: Record<string, any> = {}): Promise<any> => client.get('/hosts', { params })
export const activeHostCount = (): Promise<any> => client.get('/hosts/active-count')

export const getHostOwnership = (hostId: string): Promise<any> => client.get(`/hosts/${hostId}/ownership`)
export const transferHostAgency = (hostId: string, toAgentOwnerId: string, reason?: string): Promise<any> =>
  client.post(`/hosts/${hostId}/transfer-agency`, { toAgentOwnerId, reason })
export const removeHostAgency = (hostId: string, reason?: string): Promise<any> =>
  client.post(`/hosts/${hostId}/remove-agency`, { reason })
export const listMultiAgencyAbuse = (params: Record<string, any> = {}): Promise<any> =>
  client.get('/hosts/multi-agency-abuse', { params })
export const getHostRevenue = (hostId: string, period: 'day' | 'week' | 'month' | 'all' = 'month'): Promise<any> =>
  client.get(`/hosts/${hostId}/revenue`, { params: { period } })
