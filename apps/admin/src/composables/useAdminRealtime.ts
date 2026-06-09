import { onMounted, onUnmounted } from 'vue'
import { connectAdminSocket, onAdminRealtime } from '@/lib/adminSocket'

/**
 * Refetch list data when the backend broadcasts admin:data_changed for a resource.
 * Also connects the admin Socket.io session while the component is mounted.
 */
export function useAdminRealtime(
  resource: string,
  onRefresh: (payload?: unknown) => void | Promise<void>,
) {
  let unsubs: Array<() => void> = []

  onMounted(() => {
    connectAdminSocket()
    const run = (payload?: unknown) => {
      void onRefresh(payload)
    }
    unsubs = [onAdminRealtime(`resource:${resource}`, run)]
  })

  onUnmounted(() => {
    unsubs.forEach((u) => u())
    unsubs = []
  })
}
