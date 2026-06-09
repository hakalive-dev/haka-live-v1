import client from './client'

export const listRegions = (): Promise<any> => client.get('/regions')
export const createRegion = (code: string, name: string): Promise<any> => client.post('/regions', { code, name })
export const updateRegion = (code: string, data: { name?: string; isActive?: boolean }): Promise<any> => client.patch(`/regions/${code}`, data)
export const deleteRegion = (code: string): Promise<any> => client.delete(`/regions/${code}`)
