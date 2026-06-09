import client from './client'

export function listUsers(params: Record<string, any> = {}): Promise<any> {
  return client.get('/users', { params })
}

export function getUserDetail(id: string): Promise<any> {
  return client.get(`/users/${id}`)
}

export function editUser(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/users/${id}`, data)
}

export function updateProfileName(id: string, displayName: string): Promise<any> {
  return client.patch(`/users/${id}/profile/name`, { displayName })
}

export function updateProfileCountry(id: string, country: string): Promise<any> {
  return client.patch(`/users/${id}/profile/country`, { country })
}

export function updateProfileGender(id: string, gender: 'male' | 'female' | ''): Promise<any> {
  return client.patch(`/users/${id}/profile/gender`, { gender })
}

export function updateProfilePhone(id: string, phone: string): Promise<any> {
  return client.patch(`/users/${id}/profile/phone`, { phone })
}

export interface BanUserPayload {
  reason?: string
  banType?: 'permanent' | 'temporary'
  expiresAt?: string  // ISO datetime
}

export function banUser(id: string, payload: BanUserPayload = {}): Promise<any> {
  return client.post(`/users/${id}/ban`, payload)
}

export function unbanUser(id: string): Promise<any> {
  return client.post(`/users/${id}/unban`)
}

export function hostBanUser(id: string, payload: BanUserPayload = {}): Promise<any> {
  return client.post(`/users/${id}/host-ban`, payload)
}

export function hostUnbanUser(id: string): Promise<any> {
  return client.post(`/users/${id}/host-unban`)
}

export function changeUserRole(id: string, role: string): Promise<any> {
  return client.patch(`/users/${id}/role`, { role })
}

export function deactivateUser(id: string): Promise<any> {
  return client.post(`/users/${id}/deactivate`)
}

export function activateUser(id: string): Promise<any> {
  return client.post(`/users/${id}/activate`)
}

export function muteUser(id: string): Promise<any> {
  return client.post(`/users/${id}/mute`)
}

export function unmuteUser(id: string): Promise<any> {
  return client.post(`/users/${id}/unmute`)
}

export function adjustCoins(id: string, amount: number, currency: 'coins' | 'beans', reason: string): Promise<any> {
  return client.post(`/users/${id}/adjust-coins`, { amount, currency, reason })
}

export function deleteUser(id: string): Promise<any> {
  return client.delete(`/users/${id}`)
}

export function getSameDeviceUsers(id: string): Promise<any> {
  return client.get(`/users/${id}/same-device`)
}

export function uploadUserAvatar(id: string, file: File): Promise<{ avatarUrl: string }> {
  const form = new FormData()
  form.append('file', file)
  return client.post(`/users/${id}/avatar`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function forceSetLevel(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/users/${id}/level`, data)
}

export function setSpecialHakaIdLevel(id: string, level: 'SSS' | 'SS' | 'S' | 'A' | 'B'): Promise<any> {
  return client.patch(`/users/${id}/special-haka-id-level`, { level })
}

export function setHostStatus(id: string, data: Record<string, any>): Promise<any> {
  return client.patch(`/users/${id}/host-status`, data)
}

export function resetUserPassword(id: string, newPassword: string): Promise<any> {
  return client.post(`/users/${id}/reset-password`, { newPassword })
}

export function sendLoginOtp(id: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<any> {
  return client.post(`/users/${id}/send-login-otp`, { channel })
}

export function resetFaceVerification(id: string): Promise<any> {
  return client.post(`/users/${id}/reset-face-verification`, {})
}

export function getSuperAdminPower(id: string): Promise<{ enabled: boolean }> {
  return client.get(`/users/${id}/super-admin-power`)
}

export function setSuperAdminPower(id: string, enabled: boolean): Promise<any> {
  return client.patch(`/users/${id}/super-admin-power`, { enabled })
}
