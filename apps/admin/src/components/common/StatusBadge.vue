<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: string
  type?: 'status' | 'role'
}>()

const badgeStyle = computed(() => {
  const v = props.value?.toLowerCase() || ''

  // Status badges
  if (['pending', 'idle'].includes(v))
    return { background: 'var(--warning-soft)', color: 'var(--warning)' }
  if (['approved', 'succeeded', 'active', 'live', 'completed', 'available', 'online'].includes(v))
    return { background: 'var(--success-soft)', color: 'var(--success)' }
  if (['rejected', 'failed', 'banned', 'ended', 'locked'].includes(v))
    return { background: 'var(--danger-soft)', color: 'var(--danger)' }
  if (['paid', 'info', 'public'].includes(v))
    return { background: 'var(--info-soft)', color: 'var(--info)' }
  if (['inactive', 'private'].includes(v))
    return { background: 'var(--muted-soft)', color: 'var(--text-muted)' }

  // Role badges
  if (['normal_user'].includes(v))
    return { background: 'var(--info-soft)', color: 'var(--info)' }
  if (['host', 'independent', 'agent_host'].includes(v))
    return { background: 'var(--primary-soft)', color: 'var(--primary)' }
  if (['agent', 'super_admin'].includes(v))
    return { background: 'var(--warning-soft)', color: 'var(--warning)' }
  if (['admin'].includes(v))
    return { background: 'var(--primary-soft)', color: 'var(--primary)' }

  return { background: 'var(--muted-soft)', color: 'var(--text-muted)' }
})
</script>

<template>
  <span class="status-badge" :style="badgeStyle">
    {{ value }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
