import client from './client'

export function listHostApplications(params: Record<string, any> = {}): Promise<any> {
  return client.get('/host-applications', { params })
}

export function approveApplication(id: string, note = ''): Promise<any> {
  return client.post(`/host-applications/${id}/approve`, { note })
}

export function rejectApplication(id: string, note = ''): Promise<any> {
  return client.post(`/host-applications/${id}/reject`, { note })
}
