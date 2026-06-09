<script setup lang="ts">
defineProps<{
  label: string
  value: string
  canEdit?: boolean
}>()

const emit = defineEmits<{ edit: [] }>()
</script>

<template>
  <div class="editable-field-row">
    <span class="editable-label">{{ label }}:</span>
    <span class="editable-value">{{ value || '—' }}</span>
    <button
      v-if="canEdit !== false"
      type="button"
      class="editable-pencil"
      title="Edit"
      aria-label="Edit"
      @click="emit('edit')"
    >
      ✏️
    </button>
  </div>
</template>

<style scoped>
.editable-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.editable-label {
  color: var(--text-secondary, #9090aa);
  flex-shrink: 0;
}
.editable-value {
  color: var(--text-primary, #fff);
  min-width: 0;
  word-break: break-word;
}
.editable-pencil {
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
}
.editable-pencil:hover {
  opacity: 1;
  transform: scale(1.08);
}
</style>
