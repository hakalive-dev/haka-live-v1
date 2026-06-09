<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as payrollApi from '@/api/payroll'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// ── List state ────────────────────────────────────────────────────────────────
const records      = ref<any[]>([])
const pagination   = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('')
const typeFilter   = ref('')
const loading      = ref(true)

async function fetchRecords() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page:  pagination.value.page,
      limit: pagination.value.limit,
    }
    if (statusFilter.value) params.status        = statusFilter.value
    if (typeFilter.value)   params.recipientType = typeFilter.value
    const result    = await payrollApi.listPayroll(params)
    records.value   = result.records ?? result.payroll ?? result.data ?? result
    pagination.value = result.pagination ?? pagination.value
  } catch {}
  loading.value = false
}

function handleFilter() { pagination.value.page = 1; fetchRecords() }

// ── Create modal ───────────────────────────────────────────────────────────────
const createModal   = ref(false)
const createForm    = ref({
  recipientId:  '',
  recipientType: 'host',
  amountBeans:  0,
  periodStart:  '',
  periodEnd:    '',
  notes:        '',
})
const createLoading = ref(false)
const createError   = ref('')

function openCreate() {
  createForm.value  = { recipientId: '', recipientType: 'host', amountBeans: 0, periodStart: '', periodEnd: '', notes: '' }
  createError.value = ''
  createModal.value = true
}

async function submitCreate() {
  createError.value   = ''
  createLoading.value = true
  try {
    await payrollApi.createPayrollRecord(createForm.value)
    createModal.value = false
    await fetchRecords()
    toast.success('Payroll Record Created')
  } catch (e: any) { createError.value = e?.message || 'Failed to create record' }
  createLoading.value = false
}

// ── Process (pay) ─────────────────────────────────────────────────────────────
const processLoading = ref<string | null>(null)

async function handleProcess(record: any) {
  if (!confirm(`Pay out ${record.amountBeans} beans to ${record.recipient?.username ?? record.recipientId}?`)) return
  processLoading.value = record.id
  try {
    await payrollApi.processPayroll(record.id)
    toast.success('Payroll Processed', 'Beans credited successfully.')
    await fetchRecords()
  } catch (e: any) { toast.error('Process Failed', e?.message) }
  processLoading.value = null
}

// ── Reject modal ──────────────────────────────────────────────────────────────
const rejectModal   = ref(false)
const rejectTarget  = ref<any>(null)
const rejectNotes   = ref('')
const rejectLoading = ref(false)
const rejectError   = ref('')

function openReject(record: any) {
  rejectTarget.value = record
  rejectNotes.value  = ''
  rejectError.value  = ''
  rejectModal.value  = true
}

async function submitReject() {
  if (!rejectTarget.value) return
  rejectError.value   = ''
  rejectLoading.value = true
  try {
    await payrollApi.rejectPayroll(rejectTarget.value.id, rejectNotes.value)
    rejectModal.value = false
    toast.success('Payroll Rejected')
    await fetchRecords()
  } catch (e: any) { rejectError.value = e?.message || 'Failed to reject record' }
  rejectLoading.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

onMounted(fetchRecords)
watch(() => pagination.value.page, fetchRecords)
</script>

<template>
  <div class="page">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <select v-model="statusFilter" @change="handleFilter" class="filter-select">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="rejected">Rejected</option>
        </select>
        <select v-model="typeFilter" @change="handleFilter" class="filter-select">
          <option value="">All Types</option>
          <option value="host">Host</option>
          <option value="agent">Agent</option>
        </select>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <button class="btn-primary" @click="openCreate">+ New Record</button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading payroll...</div>
      <div v-else-if="records.length === 0" class="loading">No payroll records found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Type</th>
            <th>Amount (beans)</th>
            <th>Period</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.id">
            <td>
              <div class="cell-name">{{ record.recipient?.username ?? record.recipientId }}</div>
              <div class="cell-sub">{{ record.recipient?.hakaId ?? '—' }}</div>
            </td>
            <td>
              <span class="type-badge">{{ record.recipientType }}</span>
            </td>
            <td>{{ Number(record.amountBeans).toLocaleString() }}</td>
            <td>
              <div>{{ formatDate(record.periodStart) }}</div>
              <div class="cell-sub">→ {{ formatDate(record.periodEnd) }}</div>
            </td>
            <td>
              <span
                class="badge"
                :class="{
                  'badge-pending':  record.status === 'pending',
                  'badge-paid':     record.status === 'paid',
                  'badge-rejected': record.status === 'rejected',
                }"
              >
                {{ record.status }}
              </span>
            </td>
            <td class="actions-td">
              <RowActionMenu v-if="record.status === 'pending'">
                <RowActionMenuItem
                  variant="success"
                  :disabled="processLoading === record.id"
                  @click="handleProcess(record)"
                >
                  {{ processLoading === record.id ? 'Paying...' : 'Pay' }}
                </RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openReject(record)">Reject</RowActionMenuItem>
              </RowActionMenu>
              <div v-else-if="record.status === 'paid'" class="cell-sub">
                Paid {{ formatDate(record.paidAt) }}
              </div>
              <div v-else-if="record.status === 'rejected'" class="cell-sub reject-notes">
                {{ record.rejectionNotes || '—' }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      v-if="pagination.totalPages > 1"
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="(p: number) => { pagination.page = p; fetchRecords() }"
    />
  </div>

  <!-- Create Modal -->
  <Teleport to="body">
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>New Payroll Record</h3>
          <button class="modal-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Recipient account UUID *</label>
            <input v-model="createForm.recipientId" placeholder="Account UUID" class="form-input" />
          </div>
          <div class="form-group">
            <label>Type *</label>
            <select v-model="createForm.recipientType" class="form-input">
              <option value="host">Host</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount Beans *</label>
            <input v-model.number="createForm.amountBeans" type="number" min="0" class="form-input" />
          </div>
          <div class="form-group">
            <label>Period Start *</label>
            <input v-model="createForm.periodStart" type="date" class="form-input" />
          </div>
          <div class="form-group">
            <label>Period End *</label>
            <input v-model="createForm.periodEnd" type="date" class="form-input" />
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea v-model="createForm.notes" placeholder="Optional notes" class="form-input" rows="2" />
          </div>
          <div v-if="createError" class="error-msg">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="createModal = false">Cancel</button>
          <button class="btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Creating...' : 'Create Record' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Reject Modal -->
  <Teleport to="body">
    <div v-if="rejectModal" class="modal-overlay" @click.self="rejectModal = false">
      <div class="modal modal-box modal-sm">
        <div class="modal-header">
          <h3>Reject Payroll</h3>
          <button class="modal-close" @click="rejectModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 4px">
            Rejecting payroll for <strong>{{ rejectTarget?.recipient?.username ?? rejectTarget?.recipientId }}</strong>.
          </p>
          <div class="form-group">
            <label>Rejection Notes</label>
            <textarea v-model="rejectNotes" placeholder="Reason for rejection..." class="form-input" rows="3" />
          </div>
          <div v-if="rejectError" class="error-msg">{{ rejectError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="rejectModal = false">Cancel</button>
          <button class="btn-danger" :disabled="rejectLoading" @click="submitReject">
            {{ rejectLoading ? 'Rejecting...' : 'Reject' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toolbar-left  { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; align-items: center; }
.filter-select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; }
.stat-pill { background: var(--surface); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: 12px; color: var(--text-dim); }

/* Table */
.table-card { background: var(--surface); border-radius: 12px; border: 1px solid var(--border); overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--border); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.cell-name { font-weight: 600; }
.cell-sub  { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.loading   { padding: 40px; text-align: center; color: var(--text-dim); }
.reject-notes { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Type badge */
.type-badge { background: #4da6ff22; color: #4da6ff; padding: 3px 8px; border-radius: 99px; font-size: 12px; font-weight: 700; text-transform: capitalize; }

/* Status badges */
.badge          { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-pending  { background: #e8a02022; color: #e8a020; }
.badge-paid     { background: #22c97a22; color: #22c97a; }
.badge-rejected { background: #ff4d4d22; color: #ff4d4d; }

/* Buttons */
.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost   { padding: 8px 16px; background: none; color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-sm      { padding: 5px 10px; background: var(--surface-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-success { background: #22c97a22; color: #22c97a; border-color: #22c97a40; }
.btn-danger  { background: #ff4d4d22; color: #ff4d4d; border-color: #ff4d4d40; padding: 8px 16px; border: 1px solid #ff4d4d40; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

/* Action row */
.action-row { display: flex; gap: 6px; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal    { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 580px; max-width: 95vw; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.modal-sm { width: 420px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.modal-close  { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; }
.modal-body   { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }

/* Forms */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.form-input { padding: 9px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--content-bg); color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box; }
.error-msg  { color: #ff4d4d; font-size: 13px; }
</style>
