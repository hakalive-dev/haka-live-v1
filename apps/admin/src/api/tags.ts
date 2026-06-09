import client from './client'

export interface AdminTag {
  id: string
  name: string
  displayName: string
  color: string
  iconUrl: string
  permissions: string[]
  isBuiltIn: boolean
  sortOrder: number
}

export function listTags(): Promise<AdminTag[]> {
  return client.get('/tags')
}

export function createTag(data: {
  name: string
  displayName: string
  color?: string
  iconUrl?: string
  permissions?: string[]
}): Promise<AdminTag> {
  return client.post('/tags', data)
}

export function updateTag(id: string, data: Partial<AdminTag>): Promise<AdminTag> {
  return client.patch(`/tags/${id}`, data)
}

export function deleteTag(id: string): Promise<{ deleted: boolean }> {
  return client.delete(`/tags/${id}`)
}

export interface UserTagRow {
  id: string
  tagId: string
  tag: AdminTag
  assignedBy: string
  assigner: { id: string; displayName: string } | null
  createdAt: string
}

export function listUserTags(userId: string): Promise<UserTagRow[]> {
  return client.get(`/tags/users/${userId}`)
}

export function assignTag(userId: string, tagId: string): Promise<any> {
  return client.post(`/tags/users/${userId}`, { tagId })
}

export function bulkAssignTag(userIds: string[], tagId: string): Promise<any> {
  return client.post('/tags/users/bulk', { userIds, tagId })
}

export function revokeTag(userId: string, tagId: string): Promise<{ revoked: boolean }> {
  return client.delete(`/tags/users/${userId}/${tagId}`)
}
