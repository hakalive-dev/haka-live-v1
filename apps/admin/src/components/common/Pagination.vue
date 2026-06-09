<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  page: number
  totalPages: number
  total: number
}>()

const emit = defineEmits<{
  'update:page': [page: number]
}>()

const pages = computed(() => {
  const p: number[] = []
  const start = Math.max(1, props.page - 2)
  const end = Math.min(props.totalPages, props.page + 2)
  for (let i = start; i <= end; i++) p.push(i)
  return p
})
</script>

<template>
  <div class="pagination" v-if="totalPages > 1">
    <span class="page-info">{{ total }} results</span>
    <div class="page-buttons">
      <button
        class="page-btn"
        :disabled="page <= 1"
        @click="emit('update:page', page - 1)"
      >&laquo;</button>
      <button
        v-for="p in pages"
        :key="p"
        class="page-btn"
        :class="{ active: p === page }"
        @click="emit('update:page', p)"
      >{{ p }}</button>
      <button
        class="page-btn"
        :disabled="page >= totalPages"
        @click="emit('update:page', page + 1)"
      >&raquo;</button>
    </div>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.page-info {
  font-size: 13px;
  color: var(--text-muted);
}

.page-buttons {
  display: flex;
  gap: 4px;
}

.page-btn {
  min-width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
  transition: background 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: var(--content-bg);
}

.page-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
