import client from './client'

export interface SpecialIdUser {
  id: string
  displayName: string
  username: string | null
  avatar: string
  hakaId: string | null
}

export interface SpecialIdOwner {
  inventoryId: string
  userId: string
  user: SpecialIdUser
  pricePaid: number
  purchasedAt: string
  activatedAt: string | null
  expiresAt: string | null
  status: string // inactive | active | expired
}

export interface SpecialIdRow {
  id: string
  number: string
  price: number
  durationDays: number
  level: string
  status: string // available | owned
  owner: SpecialIdOwner | null
  createdAt: string
  updatedAt: string
}

export interface ListResult {
  rows: SpecialIdRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface AvailabilityResult {
  available: boolean
  reason?: 'taken'
}

export function listSpecialIds(params: Record<string, any> = {}): Promise<ListResult> {
  return client.get('/special-ids', { params })
}

export function checkAvailability(candidate: string): Promise<AvailabilityResult> {
  return client.get(`/special-ids/check/${candidate}`)
}

export function createSpecialId(payload: {
  number?: string
  price: number
  durationDays: number
  level: string
}): Promise<SpecialIdRow> {
  return client.post('/special-ids', payload)
}

export function updateSpecialId(
  id: string,
  payload: { price?: number; durationDays?: number; level?: string },
): Promise<SpecialIdRow> {
  return client.patch(`/special-ids/${id}`, payload)
}

export function removeSpecialId(id: string): Promise<{ message: string }> {
  return client.delete(`/special-ids/${id}`)
}

export function revokeSpecialId(id: string): Promise<{ message: string }> {
  return client.delete(`/special-ids/${id}/revoke`)
}
