import client from './client'

export function getOverview(period = 'all'): Promise<any> {
  return client.get('/analytics/overview', { params: { period } })
}

export function getTopHosts(period = 'all', limit = 10): Promise<any> {
  return client.get('/analytics/top-hosts', { params: { period, limit } })
}

export function getTopSenders(period = 'all', limit = 10): Promise<any> {
  return client.get('/analytics/top-senders', { params: { period, limit } })
}

export function getUserGrowth(): Promise<any> {
  return client.get('/analytics/user-growth')
}
