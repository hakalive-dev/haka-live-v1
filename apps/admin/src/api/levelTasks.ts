import client from './client'

export function getSettings(): Promise<any> {
  return client.get('/level-tasks/settings')
}

export function updateSettings(data: Record<string, unknown>): Promise<any> {
  return client.patch('/level-tasks/settings', data)
}

export function listTiers(): Promise<any> {
  return client.get('/level-tasks/tiers')
}

export function createTier(data: Record<string, unknown>): Promise<any> {
  return client.post('/level-tasks/tiers', data)
}

export function updateTier(id: string, data: Record<string, unknown>): Promise<any> {
  return client.patch(`/level-tasks/tiers/${id}`, data)
}

export function deleteTier(id: string): Promise<any> {
  return client.delete(`/level-tasks/tiers/${id}`)
}

export function listDaily(params: Record<string, unknown> = {}): Promise<any> {
  return client.get('/level-tasks/daily', { params })
}
