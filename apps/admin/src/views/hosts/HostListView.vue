<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listHosts, getHostOwnership } from '@/api/hosts'
import * as usersApi from '@/api/users'
import { exportToCsv } from '@/lib/exportCsv'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const toast = useToastStore()
const hosts = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const verified = ref('')
const period = ref<'day' | 'week' | 'month' | 'all'>('month')
const loading = ref(false)
const ownershipOpen = ref(false)
const ownershipLoading = ref(false)
const ownership = ref<any | null>(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / 25)))

const hasActiveFilters = computed(
  () => Boolean(search.value || verified.value || period.value !== 'month'),
)

function mapUsersToHostRows(users: any[]) {
  return users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    hakaId: u.hakaId,
    isVerified: u.isVerified ?? false,
    isVerifiedHost: u.isVerifiedHost ?? false,
    isMuted: u.isMuted ?? false,
    isHostBanned: u.isHostBanned ?? false,
    hostType: u.hostType,
    agentId: u.agentId,
    lastLiveAt: u.lastLiveAt ?? null,
    agency: null,
    cumulativeBeansEarned: String(u.cumulativeBeansEarned ?? 0),
    streamingMinutes: 0,
  }))
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, period: period.value }
    if (search.value) params.search = search.value
    if (verified.value) params.verified = verified.value
    const res = await listHosts(params)
    let items = res?.items ?? []
    let totalCount = res?.pagination?.total ?? 0

    // Fallback: same source as Manage Users → role=host when /hosts returns empty.
    if (totalCount === 0 && !search.value && !verified.value) {
      const usersRes = await usersApi.listUsers({
        page: page.value,
        limit: 25,
        role: 'host',
      })
      const usersTotal = usersRes?.pagination?.total ?? 0
      if (usersTotal > 0) {
        items = mapUsersToHostRows(usersRes.users ?? [])
        totalCount = usersTotal
      }
    }

    hosts.value = items
    total.value = totalCount
  } catch (e: any) {
    try {
      const usersRes = await usersApi.listUsers({
        page: page.value,
        limit: 25,
        role: 'host',
        ...(search.value ? { search: search.value } : {}),
      })
      hosts.value = mapUsersToHostRows(usersRes.users ?? [])
      total.value = usersRes?.pagination?.total ?? 0
      if (hosts.value.length > 0) {
        toast.error('Hosts loaded from user list', e?.message || 'Primary hosts API failed')
        return
      }
    } catch { /* fall through */ }
    toast.error('Failed to load hosts', e?.message)
    hosts.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; load() }

function onPageChange(p: number) {
  page.value = p
  load()
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function exportCsv() {
  exportToCsv(hosts.value, [
    { header: 'Name', value: r => r.displayName },
    { header: 'Haka ID', value: r => r.hakaId },
    { header: 'Agency', value: r => r.agency?.name ?? '' },
    { header: 'Agency Owner', value: r => r.agency?.owner?.displayName ?? '' },
    { header: 'Verified', value: r => r.isVerified ? 'Yes' : 'No' },
    { header: 'Last Live', value: r => r.lastLiveAt },
    { header: 'Streaming Min', value: r => r.streamingMinutes },
    { header: 'Cumulative Beans', value: r => r.cumulativeBeansEarned },
  ], 'host-list')
}

async function openOwnership(hostId: string) {
  ownershipOpen.value = true
  ownershipLoading.value = true
  ownership.value = null
  try {
    ownership.value = await getHostOwnership(hostId)
  } catch (e: any) {
    toast.error(e?.message || 'Failed to load ownership')
    ownershipOpen.value = false
  } finally {
    ownershipLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Hosts</h2>
        <div class="page-sub">Live streaming hosts, agencies, and performance metrics</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-secondary" @click="exportCsv">Export CSV</button>
      </div>
    </div>

    <div class="filter-bar">
      <input
        v-model="search"
        class="form-input filter-search"
        placeholder="Search name / Haka ID…"
        @keyup.enter="handleSearch"
      />
      <select v-model="verified" class="form-input filter-select" @change="handleSearch">
        <option value="">All KYC status</option>
        <option value="true">KYC verified</option>
        <option value="false">KYC not verified</option>
      </select>
      <select v-model="period" class="form-input filter-select" @change="handleSearch">
        <option value="day">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="all">All Time</option>
      </select>
    </div>

    <div class="table-card">
      <div v-if="!loading" class="table-meta">
        <span class="stat-pill">{{ total }} host{{ total === 1 ? '' : 's' }}</span>
        <span v-if="hasActiveFilters" class="filter-hint">Filters active — clear search/KYC filters if the list looks empty.</span>
      </div>
      <div v-if="loading" class="loading">Loading hosts…</div>
      <template v-else>
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Haka ID</th>
              <th>Agency</th>
              <th>KYC</th>
              <th>Last Live</th>
              <th>Stream Min</th>
              <th>Beans (total)</th>
              <th>Status</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in hosts"
              :key="h.id"
              class="clickable-row"
              @click="router.push(`/users/${h.id}`)"
            >
              <td class="fw">{{ h.displayName }}</td>
              <td class="dim mono">{{ h.hakaId ?? '—' }}</td>
              <td class="dim">{{ h.agency?.name ?? '—' }}</td>
              <td>
                <span v-if="h.isVerified" class="status-active">Verified</span>
                <span v-else class="dim">—</span>
                <span v-if="h.isVerifiedHost" class="status-chip">Host</span>
              </td>
              <td class="dim">{{ formatDate(h.lastLiveAt) }}</td>
              <td>{{ h.streamingMinutes }}</td>
              <td class="fw">{{ h.cumulativeBeansEarned }}</td>
              <td>
                <span v-if="h.isMuted" class="status-chip status-warn">Muted</span>
                <span v-if="h.isHostBanned" class="status-chip status-danger">Banned</span>
                <span v-if="!h.isMuted && !h.isHostBanned" class="status-active">OK</span>
              </td>
              <td class="actions-td" @click.stop>
                <RowActionMenu>
                  <RowActionMenuItem @click="openOwnership(h.id)">View Ownership</RowActionMenuItem>
                </RowActionMenu>
              </td>
            </tr>
            <tr v-if="hosts.length === 0">
              <td colspan="9" class="empty">
                No hosts match the current filters.
                <span v-if="verified === 'true'" class="empty-hint">
                  “KYC verified” only shows hosts with identity verification — not every account with role Host.
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="totalPages > 1" class="pagination-wrap">
          <Pagination
            :page="page"
            :total-pages="totalPages"
            :total="total"
            @update:page="onPageChange"
          />
        </div>
      </template>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="ownershipOpen" class="modal-overlay" @click.self="ownershipOpen = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Host Ownership</h3>
          <button class="btn-close" @click="ownershipOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="ownershipLoading" class="loading">Loading ownership…</div>
          <template v-else-if="ownership">
            <div class="detail-grid">
              <div class="detail-card">
                <div class="dl">Host</div>
                <div class="dv fw">{{ ownership.host.displayName }}</div>
                <div class="hint">Haka ID: {{ ownership.host.hakaId ?? '—' }}</div>
                <div class="hint">Host Type: {{ ownership.host.hostType || '—' }}</div>
              </div>
              <div class="detail-card">
                <div class="dl">Current Agency</div>
                <template v-if="ownership.currentAgency">
                  <div class="dv fw">{{ ownership.currentAgency.name }}</div>
                  <div class="hint">Status: {{ ownership.currentAgency.status }}</div>
                  <div class="hint">Owner: {{ ownership.currentAgency.owner?.displayName ?? '—' }}</div>
                </template>
                <div v-else class="dim">No agency</div>
              </div>
            </div>

            <div class="change-stats">
              <span>Changes (7d): <strong>{{ ownership.agencyChangeCount_7d }}</strong></span>
              <span>Changes (30d): <strong>{{ ownership.agencyChangeCount_30d }}</strong></span>
            </div>

            <div class="history-section">
              <div class="history-title">History (latest 100)</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>From</th>
                    <th>To</th>
                    <th>By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in ownership.history" :key="r.id">
                    <td class="dim">{{ new Date(r.createdAt).toLocaleString() }}</td>
                    <td>{{ r.fromAgent?.displayName ?? '—' }}</td>
                    <td>{{ r.toAgent?.displayName ?? '—' }}</td>
                    <td>{{ r.changedByAdmin?.displayName ?? '—' }}</td>
                    <td class="dim">{{ r.reason || '—' }}</td>
                  </tr>
                  <tr v-if="ownership.history?.length === 0">
                    <td colspan="5" class="empty">No history.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p class="hint">
              Transfer / Remove actions are available in the Agency drawer for now; this modal is read-only.
            </p>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="ownershipOpen = false">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.page-sub { margin-top: 3px; font-size: 12px; color: var(--text-muted); }
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-search { flex: 1; min-width: 200px; }
.filter-select { width: auto; min-width: 160px; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-secondary:hover { background: var(--row-hover); }

.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
select.form-input { cursor: pointer; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.table-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px 0;
}
.stat-pill {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: #F8FAFC;
  border: 1px solid var(--card-border);
  border-radius: 999px;
  padding: 4px 10px;
}
.filter-hint { font-size: 12px; color: var(--text-muted); }
.empty-hint { display: block; margin-top: 6px; font-size: 12px; color: var(--text-muted); }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: var(--row-hover); }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }

.status-active { color: #22C97A; font-weight: 600; font-size: 12px; }
.status-chip { display: inline-block; background: #F1F5F9; color: var(--text-primary); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; margin-left: 4px; }
.status-warn { background: var(--warning-soft); color: var(--warning); }
.status-danger { background: var(--danger-soft); color: var(--danger); }

.pagination-wrap { padding: 0 16px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-wide { width: min(800px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.detail-card { background: #F8FAFC; border: 1px solid var(--card-border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.dl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.dv { font-size: 14px; color: var(--text-primary); }
.hint { font-size: 12px; color: var(--text-muted); margin: 0; }

.change-stats { display: flex; gap: 20px; font-size: 13px; color: var(--text-muted); }
.change-stats strong { color: var(--text-primary); }

.history-section { border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; }
.history-title { padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; border-bottom: 1px solid var(--card-border); }

@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
