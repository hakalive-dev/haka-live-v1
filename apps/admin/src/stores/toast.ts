import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  type: ToastType
  title: string
  message?: string
  duration: number
}

let _id = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function add(type: ToastType, title: string, message?: string, duration = 4000) {
    const id = ++_id
    toasts.value.push({ id, type, title, message, duration })
    setTimeout(() => remove(id), duration)
  }

  function remove(id: number) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  const success = (title: string, message?: string) => add('success', title, message)
  const error   = (title: string, message?: string) => add('error',   title, message)
  const warning = (title: string, message?: string) => add('warning', title, message)
  const info    = (title: string, message?: string) => add('info',    title, message)

  return { toasts, remove, success, error, warning, info }
})
