import axios from 'axios'
import client from './client'
import { adminApiBase } from '@/lib/apiUrl'

const API_ROOT = adminApiBase()

export function listTickets(params: Record<string, any> = {}): Promise<any> {
  return client.get('/support/tickets', { params })
}

/** Fetch screenshot as blob URL (revoke when unmounting). */
export async function fetchTicketScreenshotObjectUrl(
  ticketId: string,
  index = 0,
): Promise<string> {
  const token = localStorage.getItem('admin_access_token')
  const res = await axios.get(`${API_ROOT}/support/tickets/${ticketId}/screenshot/${index}`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return URL.createObjectURL(res.data)
}

export function replyTicket(id: string, adminReply: string): Promise<any> {
  return client.post(`/support/tickets/${id}/reply`, { adminReply })
}

export function closeTicket(id: string): Promise<any> {
  return client.post(`/support/tickets/${id}/close`)
}
