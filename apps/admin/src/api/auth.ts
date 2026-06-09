import client from './client'
import type { Admin, TokenPair } from '@/types'

export function login(email: string, password: string): Promise<{ admin: Admin; tokens: TokenPair }> {
  return client.post('/auth/login', { email, password })
}

export function refresh(refreshToken: string): Promise<TokenPair> {
  return client.post('/auth/refresh', { refreshToken })
}

export function getMe(): Promise<Admin> {
  return client.get('/auth/me')
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return client.post('/auth/change-password', { oldPassword, newPassword })
}

export function createAdmin(data: { email: string; password: string; displayName: string; role?: string }): Promise<Admin> {
  return client.post('/auth/admins', data)
}

export function listAdmins(): Promise<Admin[]> {
  return client.get('/auth/admins')
}

export function logout(refreshToken: string): Promise<void> {
  return client.post('/auth/logout', { refreshToken })
}

/** Upload a file (evidence, document, image) — returns { url, filename, size } */
export function uploadFile(file: File): Promise<{ url: string; filename: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  return client.post('/auth/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

/** Upload and set the calling admin's avatar — returns updated Admin */
export function uploadMyAvatar(file: File): Promise<Admin> {
  const form = new FormData()
  form.append('file', file)
  return client.post('/auth/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
