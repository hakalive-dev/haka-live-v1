<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as hostAppsApi from '@/api/hostApplications'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const items = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('pending')
const loading = ref(true)

// Review modal
const reviewModal = ref<any>(null)
const reviewAction = ref<'approve' | 'reject'>('approve')
const reviewNote = ref('')
const reviewLoading = ref(false)

async function fetchApplications() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (statusFilter.value) params.status = statusFilter.value
    const result = await hostAppsApi.listHostApplications(params)
    items.value = result.items
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleFilter() { pagination.value.page = 1; fetchApplications() }

function openReview(app: any, action: 'approve' | 'reject') {
  reviewModal.value = app
  reviewAction.value = action
  reviewNote.value = ''
}

async function submitReview() {
  if (!reviewModal.value) return
  reviewLoading.value = true
  try {
    if (reviewAction.value === 'approve') {
      await hostAppsApi.approveApplication(reviewModal.value.id, reviewNote.value)
      toast.success('Application Approved')
    } else {
      await hostAppsApi.rejectApplication(reviewModal.value.id, reviewNote.value)
      toast.warning('Application Rejected')
    }
    reviewModal.value = null
    await fetchApplications()
  } catch (e: any) { toast.error('Action Failed', e?.message) }
  reviewLoading.value = false
}

function pathLabel(path: string) {
  const map: Record<string, string> = {
    agency_invitation: 'Agency Invitation',
    self_apply_with_agent: 'Self-Apply (with Agent)',
    self_apply_independent: 'Self-Apply (Independent)',
  }
  return map[path] || path
}

function statusClass(status: string) {
  if (status === 'pending') return 'badge-pending'
  if (status === 'approved') return 'badge-approved'
  return 'badge-rejected'
}

onMounted(fetchApplications)
watch(() => pagination.value.page, fetchApplications)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <select v-model="statusFilter" @change="handleFilter" class="filter-select">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading applications...</div>
      <div v-else-if="items.length === 0" class="loading">No applications found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Path</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Note</th>
            <th>Reviewed</th>
            <th>Applied</th>
            <th v-if="statusFilter === 'pending' || statusFilter === ''" class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="app in items" :key="app.id">
            <td>
              <div class="fw">{{ app.user?.displayName || '—' }}</div>
              <div class="dim mono">{{ app.user?.hakaId }}</div>
            </td>
            <td><span class="path-badge">{{ pathLabel(app.path) }}</span></td>
            <td>
              <span v-if="app.agent" class="fw">{{ app.agent.displayName }}</span>
              <span v-else class="dim">—</span>
            </td>
            <td><span :class="['status-badge', statusClass(app.status)]">{{ app.status }}</span></td>
            <td class="dim">{{ app.note || '—' }}</td>
            <td class="dim">{{ app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString() : '—' }}</td>
            <td class="dim">{{ new Date(app.createdAt).toLocaleDateString() }}</td>
            <td v-if="statusFilter === 'pending' || statusFilter === ''" class="actions-td" @click.stop>
              <RowActionMenu v-if="app.status === 'pending' && app.path !== 'agency_invitation'">
                <RowActionMenuItem variant="success" @click="openReview(app, 'approve')">Approve</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openReview(app, 'reject')">Reject</RowActionMenuItem>
              </RowActionMenu>
              <span v-else-if="app.status === 'pending' && app.path === 'agency_invitation'" class="invitee-label">
                Awaiting invitee
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total"
        @update:page="(p) => pagination.page = p" />
    </div>
  </div>

  <Teleport to="body">
    <div v-if="reviewModal" class="modal-overlay" @click.self="reviewModal = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>{{ reviewAction === 'approve' ? 'Approve Application' : 'Reject Application' }}</h3>
          <button class="btn-close" @click="reviewModal = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="app-summary">
            <div class="summary-row">
              <span class="sl">Applicant</span>
              <span class="sv fw">{{ reviewModal.user?.displayName }}</span>
            </div>
            <div class="summary-row">
              <span class="sl">Haka ID</span>
              <span class="sv mono dim">{{ reviewModal.user?.hakaId }}</span>
            </div>
            <div class="summary-row">
              <span class="sl">Path</span>
              <span class="sv">{{ pathLabel(reviewModal.path) }}</span>
            </div>
            <div v-if="reviewModal.agent" class="summary-row">
              <span class="sl">Agent</span>
              <span class="sv fw">{{ reviewModal.agent.displayName }}</span>
            </div>
          </div>

          <div v-if="reviewAction === 'approve'" class="info-box info-approve">
            Approving will promote this user to <strong>Host</strong> role immediately.
          </div>
          <div v-else class="info-box info-reject">
            Rejecting will deny this host application. The user can re-apply later.
          </div>

          <div class="form-group">
            <label>Note (optional)</label>
            <textarea v-model="reviewNote" class="form-textarea" rows="3"
              :placeholder="reviewAction === 'approve' ? 'Welcome message or conditions...' : 'Reason for rejection...'" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="reviewModal = null">Cancel</button>
          <button class="btn" :class="reviewAction === 'approve' ? 'btn-approve-lg' : 'btn-reject-lg'"
            :disabled="reviewLoading" @click="submitReview">
            {{ reviewLoading ? 'Processing...' : (reviewAction === 'approve' ? 'Approve Host' : 'Reject') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; }
.filter-select { height: 40px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); cursor: pointer; outline: none; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; white-space: nowrap; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; color: var(--text-primary); }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.path-badge { background: #f0f0f0; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; color: #555; }
.status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-pending { background: #fef3c7; color: #92400e; }
.badge-approved { background: #d1fae5; color: #065f46; }
.badge-rejected { background: #fee2e2; color: #991b1b; }
.row-actions { display: flex; gap: 6px; }
.invitee-label { font-size: 12px; color: var(--text-muted); font-style: italic; }
.btn-approve { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; cursor: pointer; }
.btn-approve:hover { background: #a7f3d0; }
.btn-reject { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; cursor: pointer; }
.btn-reject:hover { background: #fecaca; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(500px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }
.app-summary { background: var(--content-bg); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.summary-row { display: flex; align-items: center; gap: 12px; }
.sl { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); width: 80px; flex-shrink: 0; }
.sv { font-size: 13px; color: var(--text-primary); }
.info-box { padding: 10px 14px; border-radius: 8px; font-size: 13px; }
.info-approve { background: #d1fae5; color: #065f46; }
.info-reject { background: #fee2e2; color: #991b1b; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-textarea { padding: 10px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; resize: vertical; font-family: inherit; }
.form-textarea:focus { border-color: var(--primary); }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-approve-lg { background: #22C97A; color: #fff; }
.btn-reject-lg { background: #FF4D4D; color: #fff; }
</style>
