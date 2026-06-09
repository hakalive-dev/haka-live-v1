import { ref, type Ref } from 'vue'

let openMenuId: Ref<string | null> | null = null

function getOpenMenuId(): Ref<string | null> {
  if (!openMenuId) openMenuId = ref<string | null>(null)
  return openMenuId
}

export function useRowActionMenu(menuId: string) {
  const sharedOpenId = getOpenMenuId()

  function isOpen(): boolean {
    return sharedOpenId.value === menuId
  }

  function open(): void {
    sharedOpenId.value = menuId
  }

  function close(): void {
    if (sharedOpenId.value === menuId) sharedOpenId.value = null
  }

  function toggle(): void {
    if (isOpen()) close()
    else open()
  }

  return { sharedOpenId, isOpen, open, close, toggle }
}
