import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth'
import type { Admin } from '@/types'
import { reconnectAdminSocket, disconnectAdminSocket } from '@/lib/adminSocket'

export const useAuthStore = defineStore('auth', () => {
  const admin = ref<Admin | null>(null)
  const accessToken = ref(localStorage.getItem('admin_access_token') || '')
  const refreshToken = ref(localStorage.getItem('admin_refresh_token') || '')

  const isAuthenticated = computed(() => !!accessToken.value)
  const isSuperAdmin = computed(
    () => admin.value?.roles?.includes('super_admin') || admin.value?.role === 'super_admin',
  )
  const permissions = computed<string[]>(() => admin.value?.permissions ?? [])

  function hasPermission(permission: string): boolean {
    if (!admin.value) return false
    if (isSuperAdmin.value) return true
    const perms = admin.value.permissions ?? []
    return perms.includes('*') || perms.includes(permission)
  }

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password)
    admin.value = result.admin
    accessToken.value = result.tokens.accessToken
    refreshToken.value = result.tokens.refreshToken
    localStorage.setItem('admin_access_token', result.tokens.accessToken)
    localStorage.setItem('admin_refresh_token', result.tokens.refreshToken)
    reconnectAdminSocket()
  }

  async function fetchMe() {
    try {
      admin.value = await authApi.getMe()
    } catch {
      clearSession()
    }
  }

  async function logout() {
    try {
      if (refreshToken.value) {
        await authApi.logout(refreshToken.value)
      }
    } catch { /* ignore */ }
    clearSession()
  }

  function clearSession() {
    admin.value = null
    accessToken.value = ''
    refreshToken.value = ''
    localStorage.removeItem('admin_access_token')
    localStorage.removeItem('admin_refresh_token')
    disconnectAdminSocket()
  }

  return { admin, accessToken, refreshToken, isAuthenticated, isSuperAdmin, permissions, hasPermission, login, fetchMe, logout, clearSession }
})
