import client from './client'

export function getAllRoles(): Promise<any> {
  return client.get('/roles')
}

export function listCustomRoles(): Promise<any[]> {
  return client.get('/roles/custom')
}

export function createCustomRole(data: {
  name: string
  displayName: string
  permissions: string[]
  color: string
}): Promise<any> {
  return client.post('/roles', data)
}

export function updateCustomRole(
  name: string,
  data: { displayName: string; permissions: string[]; color: string },
): Promise<any> {
  return client.patch(`/roles/${name}`, data)
}

export function deleteCustomRole(name: string): Promise<any> {
  return client.delete(`/roles/${name}`)
}
