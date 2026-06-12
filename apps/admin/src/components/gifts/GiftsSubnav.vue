<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

interface Tab {
  label: string
  to: string
  permission?: string
}

const tabs: Tab[] = [
  { label: 'Gift Catalogue', to: '/gifts', permission: 'gift.view' },
  { label: 'Lucky Gift Settings', to: '/gifts/lucky-gifts', permission: 'gift.manage' },
  { label: 'Commission Config', to: '/gifts/commission-config', permission: 'gift.manage' },
  { label: 'Bean Revenue', to: '/gifts/platform-revenue', permission: 'gift.manage' },
  { label: 'Send History', to: '/gifts/transactions', permission: 'gift.view' },
]

const visibleTabs = computed(() =>
  tabs.filter((t) => !t.permission || auth.hasPermission(t.permission)),
)

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <nav v-if="visibleTabs.length > 1" class="gifts-subnav" aria-label="Gift management">
    <RouterLink
      v-for="tab in visibleTabs"
      :key="tab.to"
      :to="tab.to"
      class="subnav-link"
      :class="{ active: isActive(tab.to) }"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.gifts-subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.subnav-link {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border: 1px solid var(--border);
  background: var(--card-bg);
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.subnav-link:hover {
  color: var(--text-primary);
  border-color: var(--border-light, var(--border));
}
.subnav-link.active {
  color: #fff;
  background: var(--primary);
  border-color: var(--primary);
}
</style>
