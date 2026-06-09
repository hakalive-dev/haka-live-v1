import client from './client'

export const listCs = (params: Record<string, any> = {}): Promise<any> => client.get('/cs', { params })
export const getCsDetail = (id: string): Promise<any> => client.get(`/cs/${id}`)
export const suspendCs = (id: string): Promise<any> => client.delete(`/cs/${id}`)
export const reactivateCs = (id: string): Promise<any> => client.patch(`/cs/${id}/activate`, {})
