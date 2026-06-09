<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as notificationsApi from '@/api/notifications'
import type { AdminNotificationRow } from '@/api/notifications'
import Pagination from '@/components/common/Pagination.vue'
import { useAdminNotificationsStore } from '@/stores/adminNotifications'

const router = useRouter()
const bell = useAdminNotificationsStore()

const items = ref<AdminNotificationRow[]>([])
const pagination = ref({ page: 1, limit: 25, total: 0, totalPages: 0 })
const loading = ref(true)
const unreadOnly = ref(false)

async function fetchList() {
  loading.value = true
  try {
    const result = await notificationsApi.listNotifications({
      page: pagination.value.page,
      limit: pagination.value.limit,
      unreadOnly: unreadOnly.value,
    })
    items.value = result.items
    pagination.value = result.pagination
  } catch {
    items.value = []
  }
  loading.value = false
}

async function onRowClick(n: AdminNotificationRow) {
  try {
    if (!n.readAt) {
      await notificationsApi.markNotificationRead(n.id)
      await bell.refreshUnread()
    }
    if (n.linkPath) router.push(n.linkPath)
  } catch {
    /* toast via interceptor */
  }
}

async function markAllRead() {
  try {
    await notificationsApi.markAllNotificationsRead()
    await bell.refreshUnread()
    await fetchList()
  } catch {
    /* */
  }
}

function toggleUnreadFilter() {
  unreadOnly.value = !unreadOnly.value
  pagination.value.page = 1
  fetchList()
}

onMounted(async () => {
  await fetchList()
  await bell.refreshUnread()
})

watch(() => pagination.value.page, fetchList)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">Notifications</h1>
      <p class="page-desc">Alerts from the Haka Live app (withdrawals, reports, applications, and more).</p>
      <div class="toolbar">
        <button type="button" class="btn-filter" :class="{ active: unreadOnly }" @click="toggleUnreadFilter">
          Unread only
        </button>
        <button type="button" class="btn-secondary" @click="markAllRead">Mark all read</button>
      </div>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading notifications...</div>
      <div v-else-if="items.length === 0" class="empty">No notifications.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Title</th>
            <th>Detail</th>
            <th>Type</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="n in items"
            :key="n.id"
            class="click-row"
            :class="{ unread: !n.readAt }"
            @click="onRowClick(n)"
          >
            <td>
              <span v-if="!n.readAt" class="pill unread-pill">New</span>
              <span v-else class="dim">Read</span>
            </td>
            <td class="fw">{{ n.title }}</td>
            <td class="body-cell">{{ n.body || '—' }}</td>
            <td><code class="type-code">{{ n.type }}</code></td>
            <td class="dim">{{ new Date(n.createdAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination
        :page="pagination.page"
        :total-pages="pagination.totalPages"
        :total="pagination.total"
        @update:page="(p) => (pagination.page = p)"
      />
    </div>
  </div>
</template>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: var(--text-primary); }
.page-desc { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; max-width: 640px; line-height: 1.5; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-filter {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-primary);
}
.btn-filter.active {
  border-color: var(--primary);
  background: rgba(91, 47, 212, 0.08);
  color: var(--primary);
}

.btn-secondary {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--content-bg);
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
}
.btn-secondary:hover { border-color: var(--primary); }

.table-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
}

.loading, .empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th {
  text-align: left;
  padding: 12px 14px;
  background: var(--content-bg);
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--card-border);
}
.data-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--card-border);
  vertical-align: top;
}

.click-row { cursor: pointer; transition: background 0.12s; }
.click-row:hover { background: var(--content-bg); }
.click-row.unread { background: rgba(91, 47, 212, 0.04); }

.fw { font-weight: 600; color: var(--text-primary); }
.body-cell { max-width: 360px; color: var(--text-muted); word-break: break-word; }
.dim { color: var(--text-muted); font-size: 12px; }

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}
.unread-pill {
  background: rgba(91, 47, 212, 0.15);
  color: var(--primary);
}

.type-code {
  font-size: 11px;
  background: var(--content-bg);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
