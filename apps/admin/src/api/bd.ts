import client from './client'

export type CreateBdPayload = {
  email: string
  password: string
  displayName: string
  role: 'bd' | 'senior_bd'
  region?: string | null
  managerId?: string | null
  username?: string | null
  phone?: string | null
  country?: string
  appUser:
    | { mode: 'link'; hakaId: string }
    | {
        mode: 'create'
        displayName: string
        phone?: string | null
        username?: string | null
        country?: string | null
      }
  agencyIds?: string[]
}

export const createBd = (data: CreateBdPayload): Promise<any> => client.post('/bd', data)

export const listBds = (params: Record<string, any> = {}): Promise<any> => client.get('/bd', { params })
export const getBdDetail = (id: string, period = 'month'): Promise<any> => client.get(`/bd/${id}`, { params: { period } })
export const assignAgencyToBd = (agencyId: string, bdId: string): Promise<any> => client.post('/bd/assign-agency', { agencyId, bdId })
export const transferAgency = (agencyId: string, toBdId: string): Promise<any> => client.post('/bd/transfer-agency', { agencyId, toBdId })
export const suspendBd = (id: string): Promise<any> => client.delete(`/bd/${id}`)
export const reactivateBd = (id: string): Promise<any> => client.patch(`/bd/${id}/activate`, {})
