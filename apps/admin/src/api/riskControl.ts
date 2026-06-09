import client from './client'

export interface RiskControlPayload {
  freezeCoins:   boolean
  freezeBeans:   boolean
  disableGames:  boolean
  disableGifts:  boolean
  blockChat:     boolean
  reason:        string
  severity:      string
  duration:      string
  notes:         string
  evidenceUrls?: string[]
}

export function listRisks(params?: Record<string, any>): Promise<any> {
  return client.get('/risk-control', { params })
}

export function getRiskStats(): Promise<any> {
  return client.get('/risk-control/stats')
}

export function getUserRisk(userId: string): Promise<any> {
  return client.get(`/risk-control/${userId}`)
}

export function applyRisk(userId: string, data: RiskControlPayload): Promise<any> {
  return client.post(`/risk-control/${userId}`, data)
}

export function updateRisk(userId: string, data: RiskControlPayload): Promise<any> {
  return client.patch(`/risk-control/${userId}`, data)
}

export function releaseRisk(userId: string): Promise<any> {
  return client.delete(`/risk-control/${userId}`)
}
