<script setup lang="ts">
defineProps<{
  variant?: 'default' | 'danger' | 'warning' | 'success'
  disabled?: boolean
}>()

const emit = defineEmits<{ click: [] }>()

function handleClick() {
  emit('click')
}
</script>

<template>
  <button
    type="button"
    class="row-action-menu-item"
    :class="{
      'row-action-menu-item-danger': variant === 'danger',
      'row-action-menu-item-warning': variant === 'warning',
      'row-action-menu-item-success': variant === 'success',
    }"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.row-action-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 9px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.12s;
  white-space: nowrap;
}
.row-action-menu-item:hover:not(:disabled) {
  background: var(--content-bg);
}
.row-action-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.row-action-menu-item-danger {
  color: #ff4d4d;
}
.row-action-menu-item-danger:hover:not(:disabled) {
  background: rgba(255, 77, 77, 0.06);
}
.row-action-menu-item-warning {
  color: var(--warning, #e8a020);
}
.row-action-menu-item-warning:hover:not(:disabled) {
  background: rgba(232, 160, 32, 0.08);
}
.row-action-menu-item-success {
  color: var(--success, #22c97a);
}
.row-action-menu-item-success:hover:not(:disabled) {
  background: rgba(34, 201, 122, 0.08);
}
</style>
