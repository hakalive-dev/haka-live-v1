<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as auditApi from '@/api/audit'
import Pagination from '@/components/common/Pagination.vue'

const route = useRoute()
const router = useRouter()

const logs = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const actionFilter = ref('')
const searchId = ref('')
const loading = ref(true)
const selected = ref<any>(null)
const adminIdFilter = ref<string>('')
const targetIdFilter = ref<string>('')

async function fetchLogs() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (actionFilter.value) params.action = actionFilter.value
    const effectiveTarget = (searchId.value.trim() || targetIdFilter.value).trim()
    if (effectiveTarget) params.targetId = effectiveTarget
    if (adminIdFilter.value) params.adminId = adminIdFilter.value
    const result = await auditApi.listAuditLogs(params)
    logs.value = result.logs
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleFilter() { pagination.value.page = 1; fetchLogs() }

function clearSearch() { searchId.value = ''; handleFilter() }

function clearAdminFilter() {
  adminIdFilter.value = ''
  const q = { ...route.query }
  delete (q as any).adminId
  router.replace({ query: q })
  handleFilter()
}

function formatMeta(meta: any): string {
  if (!meta) return '—'
  return JSON.stringify(meta, null, 2)
}

onMounted(() => {
  adminIdFilter.value = typeof route.query.adminId === 'string' ? route.query.adminId : ''
  targetIdFilter.value = typeof route.query.targetId === 'string' ? route.query.targetId : ''
  fetchLogs()
})
watch(() => pagination.value.page, fetchLogs)
watch(() => route.query.adminId, (val) => {
  adminIdFilter.value = typeof val === 'string' ? val : ''
  pagination.value.page = 1
  fetchLogs()
})

watch(() => route.query.targetId, (val) => {
  targetIdFilter.value = typeof val === 'string' ? val : ''
  pagination.value.page = 1
  fetchLogs()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <select v-model="actionFilter" @change="handleFilter" class="filter-select">
        <option value="">All Actions</option>
        <option value="user.ban">User Ban</option>
        <option value="user.unban">User Unban</option>
        <option value="user.role_change">Role Change</option>
        <option value="user.verify">User Verify</option>
        <option value="room.force_close">Room Force Close</option>
        <option value="gift.create">Gift Create</option>
        <option value="gift.update">Gift Update</option>
        <option value="wallet.adjust">Balance Adjust</option>
        <option value="setting">Settings</option>
      </select>

      <div class="search-wrap">
        <span class="search-icon">🔎</span>
        <input
          v-model="searchId"
          class="search-input"
          placeholder="Search by Target ID..."
          @keydown.enter="handleFilter"
        />
        <button v-if="searchId" class="clear-btn" @click="clearSearch" title="Clear">✕</button>
      </div>
      <button class="btn-search" @click="handleFilter">Search</button>

      <button
        v-if="adminIdFilter"
        class="pill"
        title="Clear admin filter"
        @click="clearAdminFilter"
      >
        Admin: <span class="mono">{{ adminIdFilter.slice(0, 8) }}</span> ✕
      </button>

      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading audit log...</div>
      <div v-else-if="logs.length === 0" class="loading">No audit entries found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Admin</th>
            <th>Action</th>
            <th>Target</th>
            <th>Details</th>
            <th>IP</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id" class="clickable-row" @click="selected = log">
            <td class="fw">{{ log.admin?.displayName || log.adminId?.slice(0, 8) }}</td>
            <td><span class="action-badge">{{ log.action }}</span></td>
            <td>
              <span v-if="log.targetType" class="dim">{{ log.targetType }}:</span>
              <span class="mono"> {{ log.targetId?.slice(0, 8) || '—' }}</span>
            </td>
            <td>
              <code v-if="log.metadata && Object.keys(log.metadata).length" class="meta-code">
                {{ JSON.stringify(log.metadata) }}
              </code>
              <span v-else class="dim">—</span>
            </td>
            <td class="dim mono">{{ log.ipAddress || '—' }}</td>
            <td class="dim">{{ new Date(log.createdAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total"
        @update:page="(p) => pagination.page = p" />
    </div>
  </div>

  <!-- Detail modal -->
  <Teleport to="body">
    <div v-if="selected" class="modal-overlay" @click.self="selected = null">
      <div class="modal-box">
        <div class="modal-header">
          <div>
            <h3>Audit Entry</h3>
            <div class="modal-sub">{{ new Date(selected.createdAt).toLocaleString() }}</div>
          </div>
          <button class="btn-close" @click="selected = null">✕</button>
        </div>
        <div class="detail-body">
          <div class="detail-grid">
            <div class="dfield full">
              <span class="dl">Action</span>
              <span class="action-badge lg">{{ selected.action }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Admin</span>
              <span class="dv fw">{{ selected.admin?.displayName || '—' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Admin ID</span>
              <span class="dv mono dim">{{ selected.adminId }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Target Type</span>
              <span class="dv">{{ selected.targetType || '—' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Target ID</span>
              <span class="dv mono dim">{{ selected.targetId || '—' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">IP Address</span>
              <span class="dv mono">{{ selected.ipAddress || '—' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Log ID</span>
              <span class="dv mono dim">{{ selected.id }}</span>
            </div>
          </div>

          <!-- Metadata block -->
          <div v-if="selected.metadata && Object.keys(selected.metadata).length" class="meta-section">
            <div class="dl" style="margin-bottom: 8px;">Metadata</div>
            <pre class="meta-pre">{{ formatMeta(selected.metadata) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.filter-select { height: 40px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); cursor: pointer; outline: none; }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-icon { position: absolute; left: 10px; font-size: 13px; pointer-events: none; }
.search-input { height: 40px; padding: 0 32px 0 30px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); outline: none; width: 240px; color: var(--text-primary); }
.search-input:focus { border-color: var(--primary); }
.clear-btn { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 12px; padding: 0; line-height: 1; }
.clear-btn:hover { color: var(--danger); }
.btn-search { height: 40px; padding: 0 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-search:hover { opacity: 0.9; }
.pill { height: 40px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--card-border); background: var(--content-bg); color: var(--text-primary); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.pill:hover { background: var(--row-hover); }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; white-space: nowrap; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--row-hover); }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.action-badge { background: var(--primary-soft); color: var(--primary); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.action-badge.lg { padding: 4px 12px; font-size: 13px; display: inline-block; }
.meta-code { background: var(--content-bg); padding: 2px 6px; border-radius: 4px; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; display: inline-block; white-space: nowrap; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(560px, 100%); max-height: 85vh; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.detail-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dfield { display: flex; flex-direction: column; gap: 4px; }
.dfield.full { grid-column: 1 / -1; }
.dl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.dv { font-size: 13px; color: var(--text-primary); word-break: break-all; }
.meta-section { }
.meta-pre { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px 14px; font-size: 12px; font-family: monospace; line-height: 1.6; overflow-x: auto; margin: 0; color: var(--text-primary); white-space: pre-wrap; word-break: break-all; }
</style>
