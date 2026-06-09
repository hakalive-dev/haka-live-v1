import client from './client'

export function listRooms(params: Record<string, any> = {}): Promise<any> {
  return client.get('/rooms', { params })
}

export function getRoomDetail(id: string): Promise<any> {
  return client.get(`/rooms/${id}`)
}

export interface UpdateRoomPayload {
  title?: string
  description?: string
  coverImage?: string
  category?: string
}

export function updateRoom(id: string, data: UpdateRoomPayload): Promise<any> {
  return client.patch(`/rooms/${id}`, data)
}

export function deleteRoom(id: string): Promise<any> {
  return client.delete(`/rooms/${id}`)
}

export function getRoomMessages(id: string, params: Record<string, any> = {}): Promise<any> {
  return client.get(`/rooms/${id}/messages`, { params })
}

export function forceEndRoom(id: string): Promise<any> {
  return client.post(`/rooms/${id}/force-end`)
}

export function getRoomViewers(id: string, params: Record<string, any> = {}): Promise<any> {
  return client.get(`/rooms/${id}/viewers`, { params })
}

export function kickUserFromRoom(id: string, userId: string, reason?: string): Promise<any> {
  return client.post(`/rooms/${id}/kick`, { userId, reason })
}

export function setSeatLock(id: string, position: number, value: boolean): Promise<any> {
  return client.post(`/rooms/${id}/seats/${position}/lock`, { value })
}

export function setSeatMute(id: string, position: number, value: boolean): Promise<any> {
  return client.post(`/rooms/${id}/seats/${position}/mute`, { value })
}

export function kickFromSeat(id: string, position: number): Promise<any> {
  return client.post(`/rooms/${id}/seats/${position}/kick`)
}

export function getRoomBans(id: string, params: Record<string, any> = {}): Promise<any> {
  return client.get(`/rooms/${id}/bans`, { params })
}

export function createRoomBan(id: string, data: { userId: string; reason?: string; durationHours?: number }): Promise<any> {
  return client.post(`/rooms/${id}/bans`, data)
}

export function deleteRoomBan(id: string, banId: string): Promise<any> {
  return client.delete(`/rooms/${id}/bans/${banId}`)
}
