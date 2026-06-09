import axios from 'axios'
import type { ApiResponse } from '@/types'
import { adminApiBase, apiOrigin } from '@/lib/apiUrl'

const API_BASE = adminApiBase()

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — attach admin JWT
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — unwrap envelope, handle 401
client.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>
    if (body.success) return body.data as any
    return Promise.reject(new Error(body.message || 'Request failed'))
  },
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('admin_refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${apiOrigin()}/api/v1/admin/auth/refresh`, { refreshToken })
          const tokens = data.data
          localStorage.setItem('admin_access_token', tokens.accessToken)
          localStorage.setItem('admin_refresh_token', tokens.refreshToken)
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
          return client(originalRequest)
        } catch {
          // Refresh failed — clear tokens and redirect to login
        }
      }

      localStorage.removeItem('admin_access_token')
      localStorage.removeItem('admin_refresh_token')
      window.location.href = `${import.meta.env.BASE_URL}login`
    }

    const data = error.response?.data as ApiResponse<unknown> | undefined
    const message = data?.message || error.message || 'Network error'
    const err = new Error(message) as Error & { fieldErrors?: Record<string, string[]> }
    err.fieldErrors = data?.errors
    return Promise.reject(err)
  },
)

export default client
