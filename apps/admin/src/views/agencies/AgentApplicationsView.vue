<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as api from '@/api/agentApplications'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'

const rows        = ref<api.AgentApplication[]>([])
const loading     = ref(true)
const statusFilter = ref('pending')

const filtered = computed(() =>
  statusFilter.value === 'all' ? rows.value : rows.value.filter(r => r.status === statusFilter.value)
)

async function fetchAll() {
  loading.value = true
  try { rows.value = await api.listApplications() } catch {}
  loading.value = false
}

onMounted(fetchAll)

// ── Approve modal ─────────────────────────────────────────────────────────────
const approveTarget = ref<api.AgentApplication | null>(null)
const approveNote   = ref('')
const approveSaving = ref(false)
const approveError  = ref('')

function openApprove(row: api.AgentApplication) {
  approveTarget.value = row
  approveNote.value   = ''
  approveError.value  = ''
}
function closeApprove() { approveTarget.value = null }

async function submitApprove() {
  approveError.value  = ''
  approveSaving.value = true
  try {
    await api.approveApplication(approveTarget.value!.id, approveNote.value)
    closeApprove()
    await fetchAll()
  } catch (e: any) {
    approveError.value = e?.response?.data?.message ?? 'Approval failed.'
  }
  approveSaving.value = false
}

// ── Reject modal ──────────────────────────────────────────────────────────────
const rejectTarget = ref<api.AgentApplication | null>(null)
const rejectNote   = ref('')
const rejectSaving = ref(false)
const rejectError  = ref('')

function openReject(row: api.AgentApplication) {
  rejectTarget.value = row
  rejectNote.value   = ''
  rejectError.value  = ''
}
function closeReject() { rejectTarget.value = null }

async function submitReject() {
  rejectError.value  = ''
  rejectSaving.value = true
  try {
    await api.rejectApplication(rejectTarget.value!.id, rejectNote.value)
    closeReject()
    await fetchAll()
  } catch (e: any) {
    rejectError.value = e?.response?.data?.message ?? 'Rejection failed.'
  }
  rejectSaving.value = false
}

function statusClass(s: string) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected') return 'badge-danger'
  return 'badge-warn'
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function applicationType(row: api.AgentApplication) {
  if (row.designatedAdminId || row.designatedAdmin) return 'Root / Auto'
  if (row.parentAgent) return 'Sub-agent'
  return 'Root'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Agent Applications</h1>
    </div>

    <!-- Filters -->
    <div class="filters">
      <button
        v-for="s in ['pending', 'approved', 'rejected', 'all']"
        :key="s"
        class="filter-btn"
        :class="{ active: statusFilter === s }"
        @click="statusFilter = s"
      >{{ s.charAt(0).toUpperCase() + s.slice(1) }}</button>
    </div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="filtered.length === 0" class="empty">No applications found.</div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Type</th>
            <th>Proposed Name</th>
            <th>Country</th>
            <th>Parent / Admin</th>
            <th>Status</th>
            <th>Applied</th>
            <th>Note</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id">
            <td>
              <div class="user-cell">
                <span class="user-name">{{ row.user.displayName }}</span>
                <span class="user-sub">{{ row.user.hakaId ?? row.user.username ?? '' }}</span>
              </div>
            </td>
            <td>{{ applicationType(row) }}</td>
            <td>{{ row.proposedName }}</td>
            <td>{{ row.country || '—' }}</td>
            <td>
              <template v-if="row.designatedAdmin">
                {{ row.designatedAdmin.displayName }}
                <span class="user-sub mono">{{ row.designatedAdmin.hakaId ?? '' }}</span>
              </template>
              <template v-else>
                {{ row.parentAgent?.displayName ?? '—' }}
              </template>
            </td>
            <td><span class="badge" :class="statusClass(row.status)">{{ row.status }}</span></td>
            <td>{{ fmt(row.createdAt) }}</td>
            <td class="note-cell">{{ row.note || '—' }}</td>
            <td class="actions-td">
              <RowActionMenu v-if="row.status === 'pending'">
                <RowActionMenuItem variant="success" @click="openApprove(row)">Approve</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openReject(row)">Reject</RowActionMenuItem>
              </RowActionMenu>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Approve modal -->
    <div v-if="approveTarget" class="modal-overlay" @click.self="closeApprove">
      <div class="modal">
        <h3>Approve Application</h3>
        <p class="modal-sub">
          Approving will create an agency "<strong>{{ approveTarget.proposedName }}</strong>"
          and promote <strong>{{ approveTarget.user.displayName }}</strong> to agent.
        </p>
        <label class="field-label">Note (optional)</label>
        <textarea v-model="approveNote" class="textarea" rows="3" placeholder="Internal note…" />
        <p v-if="approveError" class="error-text">{{ approveError }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeApprove">Cancel</button>
          <button class="btn btn-success" :disabled="approveSaving" @click="submitApprove">
            {{ approveSaving ? 'Approving…' : 'Confirm Approve' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectTarget" class="modal-overlay" @click.self="closeReject">
      <div class="modal">
        <h3>Reject Application</h3>
        <p class="modal-sub">
          Rejecting the application from <strong>{{ rejectTarget.user.displayName }}</strong>.
        </p>
        <label class="field-label">Reason / Note</label>
        <textarea v-model="rejectNote" class="textarea" rows="3" placeholder="Reason for rejection…" />
        <p v-if="rejectError" class="error-text">{{ rejectError }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeReject">Cancel</button>
          <button class="btn btn-danger" :disabled="rejectSaving" @click="submitReject">
            {{ rejectSaving ? 'Rejecting…' : 'Confirm Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 0; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; }

.filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-btn {
  padding: 6px 14px; border-radius: 20px; border: 1px solid #ddd;
  background: #fff; cursor: pointer; font-size: 13px; font-weight: 500; color: #555;
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--primary); color: var(--primary); }
.filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.loading, .empty { color: #888; font-size: 14px; padding: 32px 0; text-align: center; }

.table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #eee; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { background: #f8f9fa; padding: 10px 14px; text-align: left; font-weight: 600; color: #555; border-bottom: 1px solid #eee; white-space: nowrap; }
.table td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: #fafafa; }

.user-cell { display: flex; flex-direction: column; gap: 2px; }
.user-name  { font-weight: 600; color: #111; }
.user-sub   { font-size: 11px; color: #999; }

.note-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #666; }

.badge { display: inline-block; padding: 2px 9px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.badge-warn    { background: #fff3cd; color: #856404; }
.badge-success { background: #d1fae5; color: #065f46; }
.badge-danger  { background: #fee2e2; color: #991b1b; }
.muted { color: #bbb; }

.btn { padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-success { background: #10b981; color: #fff; }
.btn-danger  { background: #ef4444; color: #fff; }
.btn-ghost   { background: #f0f0f0; color: #444; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.modal {
  background: #fff; border-radius: 12px; padding: 28px 32px;
  width: 440px; max-width: 95vw; display: flex; flex-direction: column; gap: 14px;
}
.modal h3 { margin: 0; font-size: 18px; font-weight: 700; }
.modal-sub { margin: 0; font-size: 13px; color: #555; line-height: 1.5; }
.field-label { font-size: 12px; font-weight: 600; color: #777; }
.textarea {
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 13px; resize: vertical; box-sizing: border-box;
}
.error-text { color: #ef4444; font-size: 12px; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
</style>
