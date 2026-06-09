import client from './client'

export function listPayroll(params: Record<string, any> = {}): Promise<any> {
  return client.get('/payroll', { params })
}
export function createPayrollRecord(data: Record<string, any>): Promise<any> {
  return client.post('/payroll', data)
}
export function processPayroll(id: string): Promise<any> {
  return client.post(`/payroll/${id}/process`, {})
}
export function rejectPayroll(id: string, notes: string): Promise<any> {
  return client.post(`/payroll/${id}/reject`, { notes })
}
