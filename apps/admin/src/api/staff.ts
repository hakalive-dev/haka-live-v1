import client from './client'

export function listAdmins(): Promise<any> {
  return client.get('/auth/admins')
}

export function createAdmin(data: {
  email: string
  password: string
  displayName: string
  role: string
  customPermissions?: string[]
  region?: string | null
  hakaId?: string | null
  managerId?: string | null
  username?: string | null
  phone?: string | null
  country?: string
}): Promise<any> {
  return client.post('/auth/admins', data)
}

export function updateAdmin(id: string, data: {
  role?: string
  customPermissions?: string[]
  region?: string | null
  hakaId?: string | null
  managerId?: string | null
  username?: string | null
  phone?: string | null
  country?: string
  password?: string
}): Promise<any> {
  return client.patch(`/auth/admins/${id}`, data)
}

export function deactivateAdmin(id: string): Promise<any> {
  return client.delete(`/auth/admins/${id}`)
}

export function reactivateAdmin(id: string): Promise<any> {
  return client.patch(`/auth/admins/${id}/activate`, {})
}

export function resetAdminPassword(id: string, newPassword?: string): Promise<{ tempPassword: string }> {
  return client.post(`/auth/admins/${id}/reset-password`, newPassword ? { newPassword } : {})
}

export function generateAdminOtp(id: string): Promise<{ otpCode: string; expiresAt: string }> {
  return client.post(`/auth/admins/${id}/generate-otp`, {})
}

export function removeAdminPermissions(id: string): Promise<any> {
  return client.post(`/auth/admins/${id}/remove-permissions`, {})
}

export function restoreAdminPermissions(id: string): Promise<any> {
  return client.post(`/auth/admins/${id}/restore-permissions`, {})
}

export function canDeleteAdmin(id: string): Promise<{ canDelete: boolean; reason?: string }> {
  return client.get(`/auth/admins/${id}/can-delete`)
}

export function hardDeleteAdmin(id: string): Promise<any> {
  return client.delete(`/auth/admins/${id}/hard-delete`)
}
