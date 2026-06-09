import axios from 'axios'
import client from './client'
import { adminApiBase } from '@/lib/apiUrl'

const API_BASE = adminApiBase()

export function listStoreItems(params: Record<string, any> = {}): Promise<any> {
  return client.get('/store', { params })
}

export type UploadProgress = { loaded: number; total?: number };

export function createStoreItem(data: FormData): Promise<any> {
  return client.post('/store', data, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export function updateStoreItem(id: string, data: FormData): Promise<any> {
  return client.patch(`/store/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export function toggleStoreItem(id: string, isActive: boolean): Promise<any> {
  return client.patch(`/store/${id}/toggle`, { isActive })
}
export function deleteStoreItem(id: string): Promise<any> {
  return client.delete(`/store/${id}`)
}

export async function downloadBulkTemplate(): Promise<Blob> {
  const token = localStorage.getItem('admin_access_token')
  const response = await axios.get(`${API_BASE}/store/bulk/template`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return response.data
}

export async function bulkUploadStoreItems(
  zip: File,
  opts: { onProgress?: (p: UploadProgress) => void } = {},
): Promise<any> {
  const fd = new FormData()
  fd.append('zipFile', zip)
  const token = localStorage.getItem('admin_access_token')
  try {
    const { data } = await axios.post(`${API_BASE}/store/bulk`, fd, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (evt) => {
        if (!opts.onProgress) return
        opts.onProgress({ loaded: evt.loaded, total: evt.total ?? undefined })
      },
    })
    if (!data.success) throw new Error(data.message || 'Bulk upload failed')
    return data.data
  } catch (err: any) {
    const message =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Bulk upload failed'
    throw new Error(message)
  }
}

// ── Sale status (super admin) ───────────────────────────────────────────────

export function patchSaleStatus(id: string, body: { isForSale: boolean; reason?: string }): Promise<any> {
  return client.patch(`/store/${id}/sale-status`, body)
}

export function bulkPatchSaleStatus(body: {
  itemIds: string[]
  isForSale: boolean
  reason?: string
}): Promise<any> {
  return client.patch('/store/sale-status/bulk', body)
}

export function getSaleStatusHistory(id: string, params: Record<string, any> = {}): Promise<any> {
  return client.get(`/store/${id}/sale-status/history`, { params })
}

export function createSaleSchedule(body: {
  itemIds: string[]
  targetForSale: boolean
  effectiveAt: string
  reason?: string
}): Promise<any> {
  return client.post('/store/sale-status/schedule', body)
}

export function listSaleSchedules(params: Record<string, any> = {}): Promise<any> {
  return client.get('/store/sale-status/schedules', { params })
}

export function cancelSaleSchedule(scheduleId: string): Promise<any> {
  return client.delete(`/store/sale-status/schedules/${scheduleId}`)
}

// ── Distribution (super admin) ──────────────────────────────────────────────

export function lookupStoreUser(hakaId: string): Promise<any> {
  return client.get('/store/users/lookup', { params: { hakaId } })
}

export function sendStoreItem(
  itemId: string,
  body: { userId: string; quantity: number; reason: string; durationDays?: number | null },
): Promise<any> {
  return client.post(`/store/${itemId}/send`, body)
}

export function bulkDistributeStoreItem(
  itemId: string,
  body: Record<string, any>,
): Promise<any> {
  return client.post(`/store/${itemId}/distribute/bulk`, body)
}

export function listStoreDistributions(params: Record<string, any> = {}): Promise<any> {
  return client.get('/store/distributions', { params })
}

export function getStoreDistributionAnalytics(params: Record<string, any> = {}): Promise<any> {
  return client.get('/store/distributions/analytics', { params })
}
