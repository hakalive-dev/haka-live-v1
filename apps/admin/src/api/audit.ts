import client from './client'

export function listAuditLogs(params: Record<string, any> = {}): Promise<any> {
  return client.get('/audit-log', { params })
}
