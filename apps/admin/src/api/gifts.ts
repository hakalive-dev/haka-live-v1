import axios from 'axios'
import client from './client'
import { adminApiBase } from '@/lib/apiUrl'

const API_BASE = adminApiBase()

export interface BulkImportFailedRow {
  row: number
  name?: string
  error: string
}

export interface BulkImportResult {
  created: unknown[]
  failed: BulkImportFailedRow[]
}

export function listGifts(): Promise<any[]> {
  return client.get('/gifts')
}

export function createGift(data: FormData): Promise<any> {
  return client.post('/gifts', data, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function updateGift(id: string, data: FormData): Promise<any> {
  return client.patch(`/gifts/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export async function downloadBulkTemplate(): Promise<Blob> {
  const token = localStorage.getItem('admin_access_token')
  const response = await axios.get(`${API_BASE}/gifts/bulk/template`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return response.data
}

export type UploadProgress = { loaded: number; total?: number }

export async function bulkUploadGifts(
  zip: File,
  opts: { onProgress?: (p: UploadProgress) => void } = {},
): Promise<BulkImportResult> {
  const fd = new FormData()
  fd.append('zipFile', zip)
  const token = localStorage.getItem('admin_access_token')
  try {
    const { data } = await axios.post(`${API_BASE}/gifts/bulk`, fd, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (evt) => {
        if (!opts.onProgress) return
        opts.onProgress({ loaded: evt.loaded, total: evt.total ?? undefined })
      },
    })
    if (!data.success) {
      throw new Error(data.message || 'Bulk upload failed')
    }
    return data.data as BulkImportResult
  } catch (err: any) {
    const message =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Bulk upload failed'
    throw new Error(message)
  }
}

export function listGiftTransactions(params: Record<string, any> = {}): Promise<any> {
  return client.get('/gifts/transactions', { params })
}

export interface PlatformRevenue {
  totalBeans: string
  todayBeans: string
  thisMonthBeans: string
}

export interface PlatformRevenueLedgerRow {
  id: string
  giftTransactionId: string
  amount: string
  rateApplied: number
  createdAt: string
}

export interface PlatformRevenueLedgerPage {
  rows: PlatformRevenueLedgerRow[]
  nextCursor: string | null
}

export function getPlatformRevenue(): Promise<PlatformRevenue> {
  return client.get('/platform-revenue')
}

export function listPlatformRevenueLedger(params: {
  cursor?: string | null
  limit?: number
  from?: string | null
  to?: string | null
} = {}): Promise<PlatformRevenueLedgerPage> {
  return client.get('/platform-revenue/ledger', { params })
}
