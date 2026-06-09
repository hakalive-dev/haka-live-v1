<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as api from '@/api/hostChangeRequests'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'

const rows       = ref<api.ChangeRequestRow[]>([])
const loading    = ref(true)
const statusFilter = ref<string>('pending')

const filtered = computed(() =>
  statusFilter.value === 'all' ? rows.value : rows.value.filter(r => r.status === statusFilter.value)
)

async function fetchAll() {
  loading.value = true
  try { rows.value = await api.listChangeRequests() } catch {}
  loading.value = false
}

// ── Reject modal ──────────────────────────────────────────────────────────────
const rejectTarget = ref<api.ChangeRequestRow | null>(null)
const rejectReason = ref('')
const rejectSaving = ref(false)
const rejectError  = ref('')

function openReject(row: api.ChangeRequestRow) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectError.value  = ''
}

function closeReject() { rejectTarget.value = null }

async function submitReject() {
  rejectError.value = ''
  rejectSaving.value = true
  try {
    await api.rejectChangeRequest(rejectTarget.value!.id, rejectReason.value)
    closeReject()
    await fetchAll()
  } catch (e: any) {
    rejectError.value = e?.response?.data?.message ?? 'Failed.'
  }
  rejectSaving.value = false
}

// ── Approve ───────────────────────────────────────────────────────────────────
const approvingId = ref<string | null>(null)

async function approve(row: api.ChangeRequestRow) {
  const label = row.type === 'leave' ? 'leave their agent' : 'change to a new agent'
  if (!confirm(`Approve this host's request to ${label}? This will update their agent assignment immediately.`)) return
  approvingId.value = row.id
  try {
    await api.approveChangeRequest(row.id)
    await fetchAll()
  } catch (e: any) {
    alert(e?.response?.data?.message ?? 'Approval failed.')
  }
  approvingId.value = null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) { return new Date(iso).toLocaleString() }
function shortId(id: string)  { return id.slice(0, 8) + '…' }

const STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all',      label: 'All' },
]

onMounted(fetchAll)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Host Change Requests</h1>
        <p class="page-sub">Hosts requesting to leave or change their agent assignment</p>
      </div>
    </div>

    <div class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Requests</h2>
          <p class="card-sub">{{ filtered.length }} {{ statusFilter === 'all' ? 'total' : statusFilter }} request{{ filtered.length !== 1 ? 's' : '' }}</p>
        </div>
        <div class="filter-row">
          <button
            v-for="opt in STATUS_OPTIONS" :key="opt.value"
            class="btn btn-filter"
            :class="{ active: statusFilter === opt.value }"
            @click="statusFilter = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="filtered.length === 0" class="loading">No {{ statusFilter === 'all' ? '' : statusFilter + ' ' }}requests.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Host</th>
            <th>Type</th>
            <th>From Agent</th>
            <th>To Agent</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Date</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id">
            <td>
              <div class="user-cell">
                <span class="fw">{{ row.user.displayName }}</span>
                <span class="dim mono">{{ row.user.hakaId || shortId(row.userId) }}</span>
              </div>
            </td>
            <td>
              <span class="badge" :class="row.type === 'leave' ? 'badge-orange' : 'badge-blue'">
                {{ row.type }}
              </span>
            </td>
            <td class="mono dim">{{ row.fromAgentId ? shortId(row.fromAgentId) : '—' }}</td>
            <td class="mono dim">{{ row.toAgentId   ? shortId(row.toAgentId)   : '—' }}</td>
            <td class="reason-cell">{{ row.reason || '—' }}</td>
            <td>
              <span class="badge"
                :class="{
                  'badge-yellow': row.status === 'pending',
                  'badge-green':  row.status === 'approved',
                  'badge-red':    row.status === 'rejected',
                }"
              >{{ row.status }}</span>
            </td>
            <td class="dim">{{ fmtDate(row.createdAt) }}</td>
            <td class="actions-td">
              <RowActionMenu v-if="row.status === 'pending'">
                <RowActionMenuItem
                  variant="success"
                  :disabled="approvingId === row.id"
                  @click="approve(row)"
                >
                  {{ approvingId === row.id ? 'Approving…' : 'Approve' }}
                </RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openReject(row)">Reject</RowActionMenuItem>
              </RowActionMenu>
              <span v-else class="dim">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectTarget" class="modal-overlay" @click.self="closeReject">
      <div class="modal">
        <h3 class="modal-title">Reject Request</h3>
        <p class="modal-sub">
          Rejecting <strong>{{ rejectTarget.user.displayName }}</strong>'s
          {{ rejectTarget.type }} request.
        </p>
        <div class="form-field">
          <label class="form-label">Reason (optional)</label>
          <textarea v-model="rejectReason" class="form-textarea" rows="3" placeholder="Explain why this request is rejected…" />
        </div>
        <p v-if="rejectError" class="form-error">{{ rejectError }}</p>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="closeReject">Cancel</button>
          <button class="btn btn-danger" :disabled="rejectSaving" @click="submitReject">
            {{ rejectSaving ? 'Rejecting…' : 'Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title  { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
.page-sub    { font-size: 13px; color: var(--text-muted); margin: 0; }

.table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border); gap: 16px; flex-wrap: wrap;
}
.card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.card-sub   { font-size: 12px; color: var(--text-muted); margin: 0; }

.filter-row { display: flex; gap: 6px; flex-wrap: wrap; }

.loading { padding: 32px; text-align: center; color: var(--text-muted); font-size: 14px; }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 10px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); border-bottom: 1px solid var(--border); text-align: left;
}
.data-table th.actions-th { text-align: right; width: 160px; }
.data-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border-subtle, var(--border)); vertical-align: middle; }
.data-table td.actions-td { text-align: right; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: var(--row-hover, rgba(255,255,255,0.03)); }

.user-cell { display: flex; flex-direction: column; gap: 2px; }
.reason-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); font-size: 12px; }

.fw   { font-weight: 600; }
.dim  { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; }

/* Badges */
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 20px;
  font-size: 11px; font-weight: 600; text-transform: capitalize;
}
.badge-orange { background: #d9770622; color: #d97706; }
.badge-blue   { background: #3b82f622; color: #3b82f6; }
.badge-yellow { background: #f59e0b22; color: #f59e0b; }
.badge-green  { background: #10b98122; color: #10b981; }
.badge-red    { background: #ef444422; color: #ef4444; }

/* Buttons */
.btn {
  padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: none; transition: opacity 0.15s; white-space: nowrap;
}
.btn:disabled    { opacity: 0.4; cursor: not-allowed; }
.btn-primary     { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-outline     { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
.btn-outline:hover:not(:disabled) { background: var(--row-hover, rgba(255,255,255,0.05)); }
.btn-danger      { background: transparent; border: 1px solid #ef4444; color: #ef4444; }
.btn-danger:hover:not(:disabled)  { background: #ef444415; }
.btn-sm          { padding: 5px 12px; font-size: 12px; }
.btn-filter      { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 5px 12px; font-size: 12px; border-radius: 6px; }
.btn-filter.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.actions-td .btn { margin-left: 6px; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.modal {
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px;
  padding: 28px; width: 420px; max-width: 90vw; display: flex; flex-direction: column; gap: 16px;
}
.modal-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.modal-sub   { font-size: 13px; color: var(--text-muted); margin: 0; }
.form-field  { display: flex; flex-direction: column; gap: 6px; }
.form-label  { font-size: 12px; font-weight: 500; color: var(--text-muted); }
.form-textarea {
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--input-bg); color: var(--text-primary); font-size: 13px;
  resize: vertical; font-family: inherit;
}
.form-error  { font-size: 12px; color: #ef4444; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
