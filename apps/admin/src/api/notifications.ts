import client from './client'

export interface AdminNotificationRow {
  id: string
  type: string
  title: string
  body: string
  linkPath: string
  entityType: string
  entityId: string
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationsListResult {
  items: AdminNotificationRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export function listNotifications(params: {
  page?: number
  limit?: number
  unreadOnly?: boolean
}): Promise<NotificationsListResult> {
  return client.get('/notifications', {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      unreadOnly: params.unreadOnly === true ? 'true' : undefined,
    },
  })
}

export function getUnreadCount(): Promise<{ count: number }> {
  return client.get('/notifications/unread-count')
}

export function markNotificationRead(id: string): Promise<AdminNotificationRow> {
  return client.patch(`/notifications/${id}/read`)
}

export function markAllNotificationsRead(): Promise<{ marked: boolean }> {
  return client.post('/notifications/read-all')
}
