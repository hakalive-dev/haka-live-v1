<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRowActionMenu } from '@/composables/useRowActionMenu'

const menuId = useId()
const { sharedOpenId, isOpen, toggle, close } = useRowActionMenu(menuId)

const triggerRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref<{ top: string; right: string }>({ top: '0px', right: '0px' })

const open = computed(() => isOpen())

function updatePanelPosition() {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  panelStyle.value = {
    top: `${rect.bottom + 4}px`,
    right: `${window.innerWidth - rect.right}px`,
  }
}

function handleToggle() {
  toggle()
  if (isOpen()) {
    nextTick(updatePanelPosition)
  }
}

function handleItemClick() {
  close()
}

function onDocumentClick(e: MouseEvent) {
  if (!isOpen()) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  const panel = document.getElementById(`row-action-panel-${menuId}`)
  if (panel?.contains(target)) return
  close()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen()) close()
}

function onScrollOrResize() {
  if (isOpen()) close()
}

watch(sharedOpenId, (id) => {
  if (id === menuId) nextTick(updatePanelPosition)
})

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
  if (isOpen()) close()
})
</script>

<template>
  <div class="row-action-menu" @click.stop>
    <button
      ref="triggerRef"
      type="button"
      class="row-action-menu-trigger"
      aria-label="Row actions"
      :aria-expanded="open"
      @click="handleToggle"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="3" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="8" cy="13" r="1.5" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="`row-action-panel-${menuId}`"
        class="row-action-menu-panel"
        :style="panelStyle"
        @click="handleItemClick"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.row-action-menu {
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.row-action-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.row-action-menu-trigger:hover,
.row-action-menu-trigger[aria-expanded='true'] {
  background: var(--content-bg);
  border-color: var(--card-border);
  color: var(--text-primary);
}

.row-action-menu-panel {
  position: fixed;
  z-index: 9000;
  min-width: 160px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  padding: 4px 0;
}
</style>
