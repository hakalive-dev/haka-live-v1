import client from './client'

export interface TeamAnnouncementAdminRow {
  id: string
  title: string
  body: string
  publishedAt: string
  createdAt: string
  updatedAt: string
  createdByAdmin: { id: string; email: string; displayName: string } | null
}

export type TeamAnnouncementsListResult = {
  items: TeamAnnouncementAdminRow[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export function listTeamAnnouncements(page = 1, limit = 20): Promise<TeamAnnouncementsListResult> {
  return client.get('/team-announcements', { params: { page, limit } })
}

export function publishTeamAnnouncement(payload: { title: string; body: string }): Promise<unknown> {
  return client.post('/team-announcements/publish', payload)
}
