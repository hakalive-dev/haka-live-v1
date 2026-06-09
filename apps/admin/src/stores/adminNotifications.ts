import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as notificationsApi from '@/api/notifications'

export const useAdminNotificationsStore = defineStore('adminNotifications', () => {
  const unreadCount = ref(0)

  async function refreshUnread() {
    try {
      const data = await notificationsApi.getUnreadCount()
      unreadCount.value = data.count
    } catch {
      unreadCount.value = 0
    }
  }

  return { unreadCount, refreshUnread }
})
