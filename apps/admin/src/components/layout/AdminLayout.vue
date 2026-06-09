<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import { useAuthStore } from '@/stores/auth'
import { connectAdminSocket, disconnectAdminSocket, reconnectAdminSocket } from '@/lib/adminSocket'

const sidebarOpen = ref(true)
const auth = useAuthStore()

onMounted(() => {
  if (auth.isAuthenticated) connectAdminSocket()
})

watch(
  () => auth.isAuthenticated,
  (ok) => {
    if (ok) reconnectAdminSocket()
    else disconnectAdminSocket()
  },
)
</script>

<template>
  <div class="admin-layout" :class="{ 'sidebar-closed': !sidebarOpen }">
    <div v-if="!sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = true" />
    <Sidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="admin-main">
      <Topbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-main {
  flex: 1;
  margin-left: 244px;
  display: flex;
  flex-direction: column;
  background: var(--content-bg);
  min-width: 0;
  transition: margin-left 0.25s ease;
}

.admin-content {
  padding: 24px;
}

.admin-layout.sidebar-closed .admin-main {
  margin-left: 0;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .admin-main {
    margin-left: 0 !important;
  }
  .admin-content {
    padding: 16px;
  }
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }
}
</style>
