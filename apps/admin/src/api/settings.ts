import client from './client'

export function listSettings(): Promise<any[]> {
  return client.get('/settings')
}

export function getSetting(key: string): Promise<any> {
  return client.get(`/settings/${key}`)
}

export function upsertSetting(key: string, value: unknown): Promise<any> {
  return client.put(`/settings/${key}`, { value })
}

export function deleteSetting(key: string): Promise<void> {
  return client.delete(`/settings/${key}`)
}
