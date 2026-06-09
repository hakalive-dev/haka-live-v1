import client from './client'

export function listBanners(params: Record<string, any> = {}): Promise<any> {
  return client.get('/banners', { params })
}

export function getBanner(id: string): Promise<any> {
  return client.get(`/banners/${id}`)
}

export function createBanner(data: Record<string, any> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.post('/banners', data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function updateBanner(id: string, data: Record<string, any> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.patch(`/banners/${id}`, data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function deleteBanner(id: string): Promise<any> {
  return client.delete(`/banners/${id}`)
}

export function toggleBanner(id: string): Promise<any> {
  return client.patch(`/banners/${id}/toggle`)
}
