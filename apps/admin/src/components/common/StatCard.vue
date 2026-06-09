<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  icon?: string
  color?: string
}>()
</script>

<template>
  <div class="stat-card">
    <div class="stat-icon" v-if="icon">{{ icon }}</div>
    <div class="stat-body">
      <div class="stat-value" :style="color ? { color } : {}">{{ value }}</div>
      <div class="stat-title">{{ title }}</div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-title {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
