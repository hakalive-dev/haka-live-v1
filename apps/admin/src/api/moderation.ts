import client from './client'

export function listReports(params: Record<string, any> = {}): Promise<any> {
  return client.get('/moderation/reports', { params })
}

export function reviewReport(id: string, status: 'reviewed' | 'dismissed'): Promise<any> {
  return client.post(`/moderation/reports/${id}/review`, { status })
}

export function listBans(params: Record<string, any> = {}): Promise<any> {
  return client.get('/moderation/bans', { params })
}

export function createBan(data: {
  userId: string
  reason: string
  banType: 'permanent' | 'temporary'
  expiresAt?: string
}): Promise<any> {
  return client.post('/moderation/bans', data)
}

export function liftBan(id: string): Promise<any> {
  return client.delete(`/moderation/bans/${id}`)
}

export function verifyUser(userId: string): Promise<any> {
  return client.post(`/users/${userId}/verify`)
}

export function unverifyUser(userId: string): Promise<any> {
  return client.post(`/users/${userId}/unverify`)
}

// ── Room Bans ────────────────────────────────────────────────────────────────

export function createRoomBan(data: { userId: string; roomId: string; reason: string }): Promise<any> {
  return client.post('/moderation/room-bans', data)
}

export function liftRoomBan(id: string): Promise<any> {
  return client.delete(`/moderation/room-bans/${id}`)
}

// ── Device Bans ──────────────────────────────────────────────────────────────

export function listDeviceBans(params: Record<string, any> = {}): Promise<any> {
  return client.get('/moderation/device-bans', { params })
}

export function createDeviceBan(data: {
  deviceId: string
  reason: string
  banType: 'permanent' | 'temporary'
  expiresAt?: string
}): Promise<any> {
  return client.post('/moderation/device-ban', data)
}

export function liftDeviceBan(deviceId: string): Promise<any> {
  return client.delete(`/moderation/device-ban/${deviceId}`)
}
