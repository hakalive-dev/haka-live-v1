import client from './client'

export function listEvents(params: Record<string, any> = {}): Promise<any> {
  return client.get('/events', { params })
}

export function getEvent(id: string): Promise<any> {
  return client.get(`/events/${id}`)
}

export function createEvent(data: Record<string, any> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.post('/events', data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function updateEvent(id: string, data: Record<string, any> | FormData): Promise<any> {
  const isMultipart = data instanceof FormData
  return client.patch(`/events/${id}`, data, isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
}

export function deleteEvent(id: string): Promise<any> {
  return client.delete(`/events/${id}`)
}
