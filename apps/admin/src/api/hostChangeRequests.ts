import client from './client'

export interface ChangeRequestRow {
  id: string
  userId: string
  fromAgentId: string | null
  toAgentId: string | null
  type: 'leave' | 'change'
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  createdAt: string
  updatedAt: string
  user: { id: string; displayName: string; username: string | null; avatar: string | null; hakaId: string | null }
}

export async function listChangeRequests(status?: string): Promise<ChangeRequestRow[]> {
  return client.get('/host-change-requests', { params: status ? { status } : {} })
}

export async function approveChangeRequest(id: string): Promise<{ approved: boolean }> {
  return client.post(`/host-change-requests/${id}/approve`)
}

export async function rejectChangeRequest(id: string, reason: string): Promise<{ rejected: boolean }> {
  return client.post(`/host-change-requests/${id}/reject`, { reason })
}
