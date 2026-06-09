import client from './client'

export function listFamilies(params: Record<string, any> = {}): Promise<any> {
  return client.get('/families', { params })
}
export function getFamilyDetail(id: string): Promise<any> {
  return client.get(`/families/${id}`)
}
export function updateFamily(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/families/${id}`, data)
}
export function deleteFamily(id: string): Promise<any> {
  return client.delete(`/families/${id}`)
}
export function removeFamilyMember(familyId: string, userId: string): Promise<any> {
  return client.delete(`/families/${familyId}/members/${userId}`)
}
