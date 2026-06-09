import { io, type Socket } from 'socket.io-client'
import { apiOrigin } from '@/lib/apiUrl'

type Listener = (payload?: unknown) => void

let socket: Socket | null = null
const listeners = new Map<string, Set<Listener>>()

function socketBaseUrl(): string {
  return apiOrigin() || window.location.origin
}

function dispatch(topic: string, payload?: unknown) {
  listeners.get(topic)?.forEach((fn) => {
    try {
      fn(payload)
    } catch {
      /* ignore subscriber errors */
    }
  })
}

export function connectAdminSocket(): Socket | null {
  const token = localStorage.getItem('admin_access_token')
  if (!token) return null

  if (socket?.connected) return socket

  if (socket) {
    socket.auth = { token }
    socket.connect()
    return socket
  }

  socket = io(socketBaseUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  })

  socket.on('connect', () => {
    dispatch('connected')
  })

  socket.on('admin:notification', (payload: unknown) => {
    dispatch('notifications')
    dispatch('notification:created', payload)
  })

  socket.on('admin:data_changed', (payload: { resource?: string }) => {
    dispatch('data_changed', payload)
    if (payload?.resource) {
      dispatch(`resource:${payload.resource}`, payload)
    }
  })

  socket.on('disconnect', () => {
    dispatch('disconnected')
  })

  return socket
}

export function disconnectAdminSocket() {
  socket?.disconnect()
  socket = null
}

/** Subscribe to admin realtime topics (`notifications`, `data_changed`, `resource:seller_recharges`, …). */
export function onAdminRealtime(topic: string, listener: Listener): () => void {
  if (!listeners.has(topic)) listeners.set(topic, new Set())
  listeners.get(topic)!.add(listener)
  return () => {
    listeners.get(topic)?.delete(listener)
  }
}

export function reconnectAdminSocket() {
  disconnectAdminSocket()
  connectAdminSocket()
}
