<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as paymentsApi from '@/api/payments'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { useAdminRealtime } from '@/composables/useAdminRealtime'

const toast = useToastStore()
const auth = useAuthStore()

const requests = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('')
const search = ref('')
const userIdFilter = ref('')
const loading = ref(true)
const actionLoading = ref<string | null>(null)

const approveModal = ref<{ id: string; beansAmount: number; user: any } | null>(null)
const rejectModal = ref<{ id: string; beansAmount: number; user: any } | null>(null)
const assignModal = ref<{ id: string; countryCode: string; beansAmount: number } | null>(null)
const verifyModal = ref<{
  id: string
  proofUrl: string
  beansAmount: number
  payout: Record<string, string> | null
} | null>(null)
const rejectNotes = ref('')
const assignAgentId = ref('')
const payrollAgents = ref<any[]>([])

const ACTIVE_STATUSES = new Set([
  'pending',
  'pending_review',
  'assigned',
  'proof_submitted',
])

function normalizedStatus(status: string): string {
  return status === 'pending' ? 'pending_review' : status
}

function canApproveOrReject(status: string): boolean {
  return ACTIVE_STATUSES.has(normalizedStatus(status))
}

function canAssign(status: string): boolean {
  return normalizedStatus(status) === 'pending_review'
}

function canVerifyProof(status: string): boolean {
  return normalizedStatus(status) === 'proof_submitted'
}

function hasWithdrawalActions(status: string): boolean {
  return canAssign(status) || canVerifyProof(status) || canApproveOrReject(status)
}

async function loadPayrollAgents(countryCode: string) {
  try {
    payrollAgents.value = await paymentsApi.listPayrollAgents(countryCode)
  } catch {
    payrollAgents.value = []
  }
}

function openAssignModal(req: any) {
  assignAgentId.value = req.assignedAgentId ?? ''
  assignModal.value = {
    id: req.id,
    countryCode: req.countryCode ?? '',
    beansAmount: Number(req.beansAmount),
  }
  void loadPayrollAgents(req.countryCode ?? '')
}

async function confirmAssign() {
  if (!assignModal.value || !assignAgentId.value) return
  actionLoading.value = assignModal.value.id
  const id = assignModal.value.id
  try {
    await paymentsApi.assignWithdrawal(id, assignAgentId.value)
    toast.success('Assigned', 'Payroll agent notified.')
    assignModal.value = null
    await fetchData()
  } catch (e: any) {
    toast.error('Assign failed', e?.message)
  }
  actionLoading.value = null
}

function payoutDetailLines(payout: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!payout) return []
  const rows: { label: string; value: string }[] = []
  const p = payout as Record<string, string>
  if (p.label) rows.push({ label: 'Payment Method', value: p.label })
  if (p.bankName) rows.push({ label: 'Bank name', value: p.bankName })
  if (p.accountNumber) rows.push({ label: 'Account', value: p.accountNumber })
  else if (p.maskedAccount) rows.push({ label: 'Account', value: p.maskedAccount })
  if (p.ifscCode) rows.push({ label: 'IFSC', value: p.ifscCode })
  if (p.epayAccount) rows.push({ label: 'Epay', value: p.epayAccount })
  if (p.bep20Address) rows.push({ label: 'BEP20', value: p.bep20Address })
  if (p.trc20Address) rows.push({ label: 'TRC20', value: p.trc20Address })
  const holder = p.accountHolderName || p.accountLabel
  if (holder) rows.push({ label: 'Full Name', value: holder })
  if (p.countryName) rows.push({ label: 'Country', value: p.countryName })
  return rows
}

function openVerifyModal(req: any) {
  verifyModal.value = {
    id: req.id,
    proofUrl: req.proofUrl ?? '',
    beansAmount: Number(req.beansAmount),
    payout: req.payout ?? null,
  }
}

async function confirmVerify() {
  if (!verifyModal.value) return
  actionLoading.value = verifyModal.value.id
  const id = verifyModal.value.id
  try {
    await paymentsApi.verifyWithdrawalProof(id)
    toast.success('Verified', 'Ledger credited to payroll agent.')
    verifyModal.value = null
    await fetchData()
  } catch (e: any) {
    toast.error('Verify failed', e?.message)
  }
  actionLoading.value = null
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    }
    if (statusFilter.value) params.status = statusFilter.value
    if (userIdFilter.value) params.userId = userIdFilter.value
    else if (search.value) params.search = search.value
    const result = await paymentsApi.listWithdrawals(params)
    requests.value = result.items
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() {
  pagination.value.page = 1
  fetchData()
}

function handleFilterChange() {
  pagination.value.page = 1
  fetchData()
}

function openApproveModal(req: any) {
  approveModal.value = { id: req.id, beansAmount: req.beansAmount, user: req.user }
}

async function confirmApprove() {
  if (!approveModal.value) return
  actionLoading.value = approveModal.value.id
  const id = approveModal.value.id
  approveModal.value = null
  try {
    await paymentsApi.approveWithdrawal(id)
    toast.success('Withdrawal approved', 'Marked completed. User beans were already held on submit.')
    await fetchData()
  } catch (e: any) {
    toast.error('Approve Failed', e?.message)
  }
  actionLoading.value = null
}

function openRejectModal(req: any) {
  rejectModal.value = { id: req.id, beansAmount: req.beansAmount, user: req.user }
  rejectNotes.value = ''
}

async function confirmReject() {
  if (!rejectModal.value) return
  actionLoading.value = rejectModal.value.id
  try {
    await paymentsApi.rejectWithdrawal(rejectModal.value.id, rejectNotes.value)
    toast.warning('Withdrawal Rejected', 'Beans returned to the user.')
    rejectModal.value = null
    await fetchData()
  } catch (e: any) {
    toast.error('Rejection Failed', e?.message)
  }
  actionLoading.value = null
}

function statusClass(status: string) {
  const s = status === 'pending' ? 'pending_review' : status
  if (s === 'completed' || s === 'approved') return 'badge badge-success'
  if (s === 'rejected') return 'badge badge-danger'
  if (s === 'proof_submitted') return 'badge badge-info'
  if (s === 'assigned') return 'badge badge-assigned'
  return 'badge badge-warning'
}

function displayStatus(status: string) {
  if (status === 'pending') return 'pending_review'
  return status
}

useAdminRealtime('withdrawals', fetchData)

onMounted(fetchData)
watch(() => pagination.value.page, fetchData)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Withdrawal requests</h2>
      <div class="page-stats">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
      </div>
    </div>

    <p class="flow-hint">
      <strong>Assign</strong> a country payroll agent → agent pays user and uploads proof →
      <strong>Verify proof</strong> credits agent ledger.
      <strong>Force complete</strong> / <strong>Reject</strong> for edge cases.
      <router-link to="/payroll-agents">Manage payroll agents</router-link>
    </p>

    <div class="toolbar">
      <input
        v-model="search"
        class="search-input"
        placeholder="Search by name or Haka ID..."
        :disabled="!!userIdFilter"
        @keyup.enter="handleSearch"
      />
      <input
        v-model="userIdFilter"
        class="search-input"
        placeholder="Filter by account UUID..."
        :disabled="!!search"
        @keyup.enter="handleSearch"
      />
      <select v-model="statusFilter" class="filter-select" @change="handleFilterChange">
        <option value="">All statuses</option>
        <option value="pending_review">Pending review</option>
        <option value="assigned">Assigned (legacy)</option>
        <option value="proof_submitted">Proof submitted (legacy)</option>
        <option value="completed">Completed</option>
        <option value="approved">Approved (legacy)</option>
        <option value="rejected">Rejected</option>
      </select>
      <button class="btn btn-primary" @click="handleSearch">Search</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading withdrawal requests...</div>
      <div v-else-if="requests.length === 0" class="empty">No withdrawal requests found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Beans</th>
            <th>Payout</th>
            <th>User notes</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Proof</th>
            <th>Submitted</th>
            <th>Processed</th>
            <th v-if="auth.hasPermission('payment.withdrawal')" class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in requests" :key="req.id">
            <td>
              <div class="user-name">{{ req.user?.displayName ?? '—' }}</div>
              <div class="user-meta small mono">
                <span class="dim">Haka ID:</span>
                <span v-if="req.user?.hakaId" class="value">{{ req.user.hakaId }}</span>
                <span v-else class="dim">—</span>
              </div>
            </td>
            <td class="bold">{{ req.beansAmount.toLocaleString() }}</td>
            <td class="small">
              <template v-if="req.currency && req.localAmount != null">
                {{ req.currency }} {{ Number(req.localAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                <span v-if="req.countryCode" class="dim">({{ req.countryCode }})</span>
              </template>
              <span v-else class="dim">—</span>
            </td>
            <td class="note-cell">{{ req.notes || '—' }}</td>
            <td class="small">{{ req.assignedAgent?.displayName ?? '—' }}</td>
            <td>
              <span :class="statusClass(req.status)">{{ displayStatus(req.status) }}</span>
            </td>
            <td class="small">
              <a v-if="req.proofUrl" :href="req.proofUrl" target="_blank" rel="noopener">View</a>
              <span v-else class="dim">—</span>
            </td>
            <td class="mono small">{{ new Date(req.createdAt).toLocaleString() }}</td>
            <td class="mono small">
              {{ req.processedAt ? new Date(req.processedAt).toLocaleString() : '—' }}
            </td>
            <td v-if="auth.hasPermission('payment.withdrawal')" class="actions-td" @click.stop>
              <RowActionMenu v-if="hasWithdrawalActions(req.status)">
                <RowActionMenuItem
                  v-if="canAssign(req.status)"
                  :disabled="actionLoading === req.id"
                  @click="openAssignModal(req)"
                >
                  Assign
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-if="canVerifyProof(req.status)"
                  variant="success"
                  :disabled="actionLoading === req.id"
                  @click="openVerifyModal(req)"
                >
                  Verify
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-if="canApproveOrReject(req.status)"
                  :disabled="actionLoading === req.id"
                  @click="openApproveModal(req)"
                >
                  Force complete
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-if="canApproveOrReject(req.status)"
                  variant="danger"
                  :disabled="actionLoading === req.id"
                  @click="openRejectModal(req)"
                >
                  Reject
                </RowActionMenuItem>
              </RowActionMenu>
              <span v-else class="processed-label">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="(p: number) => (pagination.page = p)"
    />

    <!-- Assign modal -->
    <div v-if="assignModal" class="modal-overlay" @click.self="assignModal = null">
      <div class="modal">
        <h3>Assign payroll agent</h3>
        <p>Country: <strong>{{ assignModal.countryCode }}</strong> · {{ assignModal.beansAmount.toLocaleString() }} beans</p>
        <div class="form-group">
          <label>Agent</label>
          <select v-model="assignAgentId" class="filter-select full">
            <option value="">Select agent…</option>
            <option v-for="a in payrollAgents" :key="a.id" :value="a.id">
              {{ a.displayName }} ({{ a.countryCode }})
            </option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="assignModal = null">Cancel</button>
          <button class="btn btn-primary" :disabled="!assignAgentId" @click="confirmAssign">Assign</button>
        </div>
      </div>
    </div>

    <!-- Verify modal -->
    <div v-if="verifyModal" class="modal-overlay" @click.self="verifyModal = null">
      <div class="modal">
        <h3>Verify payment proof</h3>
        <p>{{ verifyModal.beansAmount.toLocaleString() }} beans — confirm proof matches payout.</p>
        <div v-if="payoutDetailLines(verifyModal.payout).length" class="payout-detail-box">
          <p class="payout-detail-title">Payout details (agent view)</p>
          <div
            v-for="row in payoutDetailLines(verifyModal.payout)"
            :key="row.label"
            class="payout-detail-row"
          >
            <span class="payout-label">{{ row.label }}</span>
            <span class="payout-value">{{ row.value }}</span>
          </div>
        </div>
        <p v-if="verifyModal.proofUrl">
          <a :href="verifyModal.proofUrl" target="_blank" rel="noopener">Open proof screenshot</a>
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="verifyModal = null">Cancel</button>
          <button class="btn btn-success" @click="confirmVerify">Verify & complete</button>
        </div>
      </div>
    </div>

    <!-- Approve modal -->
    <div v-if="approveModal" class="modal-overlay" @click.self="approveModal = null">
      <div class="modal">
        <h3>Force complete withdrawal</h3>
        <p>
          Confirm you have paid
          <strong>{{ approveModal.user?.displayName }}</strong>
          off-app for
          <strong>{{ approveModal.beansAmount.toLocaleString() }}</strong>
          beans. This marks the request completed; held beans are not returned to the user.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="approveModal = null">Cancel</button>
          <button
            class="btn btn-success"
            :disabled="actionLoading !== null"
            @click="confirmApprove"
          >
            Force complete
          </button>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectModal" class="modal-overlay" @click.self="rejectModal = null">
      <div class="modal">
        <h3>Reject withdrawal</h3>
        <p>
          Rejecting
          <strong>{{ rejectModal.beansAmount.toLocaleString() }}</strong>
          beans for
          <strong>{{ rejectModal.user?.displayName }}</strong>.
          Held beans will be returned to their wallet.
        </p>
        <div class="form-group">
          <label>Reason (optional)</label>
          <textarea
            v-model="rejectNotes"
            class="form-textarea"
            placeholder="Reason for rejection..."
            rows="3"
          />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="rejectModal = null">Cancel</button>
          <button
            class="btn btn-danger"
            :disabled="actionLoading !== null"
            @click="confirmReject"
          >
            Confirm reject
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.flow-hint {
  font-size: 13px; color: #555; line-height: 1.5; margin: 0 0 16px; max-width: 900px;
}
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input {
  flex: 1; min-width: 160px; height: 38px; padding: 0 12px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none;
}
.search-input:focus { border-color: #7B4FFF; }
.filter-select {
  height: 38px; padding: 0 10px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; background: #fff;
}
.filter-select.full { width: 100%; box-sizing: border-box; }
.flow-hint a { color: #7B4FFF; }
.btn { height: 38px; padding: 0 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary { background: #7B4FFF; color: #fff; }
.btn-primary:hover { background: #6040e0; }
.btn-success { background: #22C97A; color: #fff; }
.btn-success:hover { background: #1aad68; }
.btn-danger { background: #FF4D4D; color: #fff; }
.btn-danger:hover { background: #e03e3e; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.table-card { background: #fff; border-radius: 8px; border: 1px solid #eee; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 800px; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #888; border-bottom: 1px solid #eee; }
.data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.user-name { font-weight: 600; }
.user-meta { margin-top: 4px; display: flex; align-items: baseline; gap: 6px; }
.user-meta .value { font-weight: 600; color: #333; }
.mono { font-family: monospace; font-size: 13px; }
.small { font-size: 12px; }
.dim { color: #999; }
.bold { font-weight: 600; }
.note-cell { max-width: 160px; color: #666; font-size: 13px; }
.action-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.processed-label { font-size: 12px; color: #999; }
.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.badge-warning { background: #fff3cd; color: #856404; }
.badge-success { background: #d1fae5; color: #065f46; }
.badge-danger { background: #fee2e2; color: #991b1b; }
.badge-info { background: #dbeafe; color: #1e40af; }
.badge-assigned { background: #e0e7ff; color: #3730a3; }
.loading, .empty { padding: 40px; text-align: center; color: #999; font-size: 14px; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; padding: 24px; width: 440px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal h3 { margin: 0 0 12px; font-size: 18px; }
.modal p { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 16px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.form-textarea {
  width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 14px; outline: none; box-sizing: border-box; resize: vertical;
}
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.payout-detail-box {
  background: #f8f8fc; border: 1px solid #e8e8f0; border-radius: 8px;
  padding: 12px; margin-bottom: 16px; max-height: 220px; overflow-y: auto;
}
.payout-detail-title { font-size: 12px; font-weight: 700; margin: 0 0 8px; color: #333; }
.payout-detail-row {
  display: flex; justify-content: space-between; gap: 12px;
  font-size: 13px; padding: 4px 0; border-bottom: 1px solid #eee;
}
.payout-detail-row:last-child { border-bottom: none; }
.payout-label { color: #888; flex-shrink: 0; }
.payout-value { font-weight: 600; text-align: right; word-break: break-all; }
</style>
