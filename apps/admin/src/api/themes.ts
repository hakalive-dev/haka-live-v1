import client from './client'

export interface Theme {
  id: string
  name: string
  gradientFrom: string
  gradientTo: string
  backgroundImageUrl: string | null
  svgaUrl: string | null
  accentColor: string
  chatBubbleColor: string
  storeItemId: string | null
  storeItem?: { id: string; name: string; coinCost: number } | null
  createdAt: string
}

export function listThemes(): Promise<Theme[]> {
  return client.get('/themes')
}

export function createTheme(data: FormData): Promise<Theme> {
  return client.post('/themes', data, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function updateTheme(id: string, data: FormData): Promise<Theme> {
  return client.patch(`/themes/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function deleteTheme(id: string): Promise<void> {
  return client.delete(`/themes/${id}`)
}
