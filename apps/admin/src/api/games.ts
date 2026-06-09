import client from './client'

export function listGames(params: Record<string, any> = {}): Promise<any> {
  return client.get('/games', { params })
}

export function getGameDetail(id: string): Promise<any> {
  return client.get(`/games/${id}`)
}

export function createGame(data: Record<string, any>): Promise<any> {
  return client.post('/games', data)
}

export function updateGame(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/games/${id}`, data)
}

export function deleteGame(id: string): Promise<any> {
  return client.delete(`/games/${id}`)
}

export function toggleGameStatus(id: string, isActive: boolean): Promise<any> {
  return client.patch(`/games/${id}/status`, { isActive })
}

export function pingGameApi(id: string): Promise<any> {
  return client.post(`/games/${id}/ping`)
}
