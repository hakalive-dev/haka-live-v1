import client from './client'

export function listAgencyLearnPromotions(params: Record<string, unknown> = {}): Promise<any> {
  return client.get('/agency-learn-promotions', { params })
}

export function getAgencyLearnPromotion(id: string): Promise<any> {
  return client.get(`/agency-learn-promotions/${id}`)
}

export function createAgencyLearnPromotion(data: Record<string, unknown> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.post('/agency-learn-promotions', data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function updateAgencyLearnPromotion(id: string, data: Record<string, unknown> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.patch(`/agency-learn-promotions/${id}`, data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function deleteAgencyLearnPromotion(id: string): Promise<any> {
  return client.delete(`/agency-learn-promotions/${id}`)
}

export function toggleAgencyLearnPromotion(id: string, isActive: boolean): Promise<any> {
  return client.patch(`/agency-learn-promotions/${id}/toggle`, { isActive })
}
