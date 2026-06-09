<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as api from '@/api/team-announcements'
import type { TeamAnnouncementAdminRow } from '@/api/team-announcements'
import Pagination from '@/components/common/Pagination.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const title = ref('')
const body = ref('')
const publishing = ref(false)

const items = ref<TeamAnnouncementAdminRow[]>([])
const pagination = ref({ page: 1, limit: 15, total: 0, totalPages: 0 })
const loading = ref(true)

async function fetchList() {
  loading.value = true
  try {
    const result = await api.listTeamAnnouncements(pagination.value.page, pagination.value.limit)
    items.value = result.items
    pagination.value.total = result.total
    pagination.value.totalPages = Math.max(1, Math.ceil(result.total / pagination.value.limit))
  } catch {
    items.value = []
  }
  loading.value = false
}

async function publish() {
  const t = title.value.trim()
  const b = body.value.trim()
  if (!t || !b) {
    toast.warning('Title and body are required')
    return
  }
  publishing.value = true
  try {
    await api.publishTeamAnnouncement({ title: t, body: b })
    toast.success('Announcement published')
    title.value = ''
    body.value = ''
    pagination.value.page = 1
    await fetchList()
  } catch (e: unknown) {
    toast.error('Publish failed', e instanceof Error ? e.message : undefined)
  }
  publishing.value = false
}

onMounted(fetchList)

watch(
  () => pagination.value.page,
  () => fetchList(),
)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">Team announcements</h1>
      <p class="page-desc">
        Broadcast a message to all users: pinned at the top of the chat inbox, plus push notification to devices subscribed to the team topic.
      </p>
    </div>

    <div class="card compose-card">
      <h2 class="card-title">Publish new</h2>
      <label class="label">Title</label>
      <input v-model="title" type="text" class="input" maxlength="200" placeholder="Short headline" />
      <label class="label">Body</label>
      <textarea v-model="body" class="textarea" rows="6" maxlength="10000" placeholder="Full message" />
      <button type="button" class="btn-primary" :disabled="publishing" @click="publish">
        {{ publishing ? 'Publishing…' : 'Publish' }}
      </button>
    </div>

    <div class="table-card">
      <h2 class="card-title">History</h2>
      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="items.length === 0" class="empty">No announcements yet.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Preview</th>
            <th>Published</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="n in items" :key="n.id">
            <td class="fw">{{ n.title }}</td>
            <td class="body-cell">{{ n.body.slice(0, 120) }}{{ n.body.length > 120 ? '…' : '' }}</td>
            <td class="dim">{{ new Date(n.publishedAt).toLocaleString() }}</td>
            <td class="dim">{{ n.createdByAdmin?.displayName ?? '—' }}</td>
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
.page-head {
  margin-bottom: 20px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-primary);
}
.page-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
  max-width: 720px;
  line-height: 1.5;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px;
  color: var(--text-primary);
}
.compose-card {
  margin-bottom: 24px;
}
.card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 12px;
  padding: 20px;
}
.table-card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 12px;
  padding: 20px;
}
.label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-secondary);
}
.input,
.textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle, #e2e8f0);
  font-size: 14px;
  margin-bottom: 14px;
  box-sizing: border-box;
}
.textarea {
  resize: vertical;
  font-family: inherit;
}
.btn-primary {
  margin-top: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: var(--accent, #7b4fff);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle, #e2e8f0);
}
.fw {
  font-weight: 600;
}
.body-cell {
  color: var(--text-muted);
  max-width: 420px;
}
.dim {
  color: var(--text-muted);
  font-size: 13px;
}
.loading,
.empty {
  padding: 24px;
  color: var(--text-muted);
}
</style>
