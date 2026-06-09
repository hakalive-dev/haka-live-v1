import client from './client'

export const getTarget = (staffId: string, period: string, periodStart: string): Promise<any> =>
  client.get('/targets', { params: { staffId, period, periodStart } })

export const upsertTarget = (data: {
  staffId: string
  period: string
  periodStart: string
  revenueTarget: string
  onboardTarget: number
}): Promise<any> => client.put('/targets', data)
