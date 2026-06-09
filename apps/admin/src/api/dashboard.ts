import client from './client'
import type { DashboardStats } from '@/types'

export function getStats(): Promise<DashboardStats> {
  return client.get('/dashboard/stats')
}

export function getRecentUsers(limit = 10): Promise<any[]> {
  return client.get('/dashboard/recent-users', { params: { limit } })
}

export function getRecentRooms(limit = 10): Promise<any[]> {
  return client.get('/dashboard/recent-rooms', { params: { limit } })
}

export function getTopHosts(limit = 10): Promise<any[]> {
  return client.get('/dashboard/top-hosts', { params: { limit } })
}

export function getTopAgents(limit = 10): Promise<any[]> {
  return client.get('/dashboard/top-agents', { params: { limit } })
}
