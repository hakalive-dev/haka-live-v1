<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import * as paymentsApi from '@/api/payments'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAdminRealtime } from '@/composables/useAdminRealtime'

const toast = useToastStore()

const requests = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('')
const search = ref('')
const userIdFilter = ref('')
const loading = ref(true)
const actionLoading = ref<string | null>(null)
const approveModal = ref<{ id: string; amountUsd: number; coinsToCredit: number; user: any } | null>(null)
const rejectModal = ref<{ id: string; amountUsd: number; user: any } | null>(null)
const rejectNotes = ref('')
const proofModal = ref<string | null>(null)

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
    const result = await paymentsApi.listSellerRecharges(params)
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

async function confirmApprove() {
  if (!approveModal.value) return
  actionLoading.value = approveModal.value.id
  const id = approveModal.value.id
  approveModal.value = null
  try {
    await paymentsApi.approveSellerRecharge(id)
    toast.success('Recharge Approved — coins credited to seller')
    await fetchData()
  } catch (e: any) {
    toast.error('Approval Failed', e?.message)
  }
  actionLoading.value = null
}

async function confirmReject() {
  if (!rejectModal.value) return
  actionLoading.value = rejectModal.value.id
  const id = rejectModal.value.id
  try {
    await paymentsApi.rejectSellerRecharge(id, rejectNotes.value)
    toast.warning('Recharge Rejected')
    rejectModal.value = null
    await fetchData()
  } catch (e: any) {
    toast.error('Rejection Failed', e?.message)
  }
  actionLoading.value = null
}

function statusClass(status: string) {
  if (status === 'approved') return 'badge badge-success'
  if (status === 'rejected') return 'badge badge-danger'
  return 'badge badge-warning'
}

function methodLabel(method: string) {
  const labels: Record<string, string> = {
    upi: 'UPI', epay: 'Epay',
    usdt_trc20: 'USDT TRC20', usdt_bep20: 'USDT BEP20',
  }
  return labels[method] ?? method
}

useAdminRealtime('seller_recharges', fetchData)

onMounted(fetchData)
watch(() => pagination.value.page, fetchData)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Seller Recharge Requests</h2>
      <div class="page-stats" style="display: flex; align-items: center; gap: 12px;">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <RouterLink to="/seller-recharge-settings" class="btn btn-secondary btn-sm">
          Payment setup
        </RouterLink>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        @keyup.enter="handleSearch"
        class="search-input"
        placeholder="Search by name or Haka ID..."
        :disabled="!!userIdFilter"
      />
      <input
        v-model="userIdFilter"
        @keyup.enter="handleSearch"
        class="search-input"
        placeholder="Filter by account UUID..."
        :disabled="!!search"
      />
      <select v-model="statusFilter" @change="handleFilterChange" class="filter-select">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      <button class="btn btn-primary" @click="handleSearch">Search</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading recharge requests...</div>
      <div v-else-if="requests.length === 0" class="empty">No recharge requests found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Seller</th>
            <th>Haka ID</th>
            <th>USD Amount</th>
            <th>Coins to Credit</th>
            <th>Method</th>
            <th>Proof</th>
            <th>TX Hash</th>
            <th>Status</th>
            <th>Submitted</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req in requests" :key="req.id">
            <td>
              <div class="user-name">{{ req.seller?.displayName ?? '—' }}</div>
            </td>
            <td class="mono">{{ req.seller?.hakaId ?? '—' }}</td>
            <td class="bold">${{ Number(req.amountUsd).toFixed(2) }}</td>
            <td class="bold">{{ req.coinsToCredit.toLocaleString() }}</td>
            <td><span class="method-pill">{{ methodLabel(req.paymentMethod) }}</span></td>
            <td>
              <button
                v-if="req.proofImageUrl"
                class="btn btn-secondary btn-sm"
                @click="proofModal = req.proofImageUrl"
              >
                View
              </button>
              <span v-else class="empty-cell">—</span>
            </td>
            <td class="mono small tx-hash">{{ req.txHash || '—' }}</td>
            <td><span :class="statusClass(req.status)">{{ req.status }}</span></td>
            <td class="mono small">{{ new Date(req.createdAt).toLocaleString() }}</td>
            <td class="actions-td">
              <RowActionMenu v-if="req.status === 'pending'">
                <RowActionMenuItem
                  variant="success"
                  :disabled="actionLoading === req.id"
                  @click="approveModal = { id: req.id, amountUsd: req.amountUsd, coinsToCredit: req.coinsToCredit, user: req.seller }"
                >
                  Approve
                </RowActionMenuItem>
                <RowActionMenuItem
                  variant="danger"
                  :disabled="actionLoading === req.id"
                  @click="rejectModal = { id: req.id, amountUsd: req.amountUsd, user: req.seller }; rejectNotes = ''"
                >
                  Reject
                </RowActionMenuItem>
              </RowActionMenu>
              <div v-else>
                <div class="processed-label">Processed</div>
                <div v-if="req.adminNotes" class="admin-note">{{ req.adminNotes }}</div>
              </div>
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

    <!-- Proof image modal -->
    <div v-if="proofModal" class="modal-overlay" @click.self="proofModal = null">
      <div class="modal proof-modal">
        <div class="modal-close-row">
          <button class="btn btn-secondary btn-sm" @click="proofModal = null">Close</button>
        </div>
        <img :src="proofModal" class="proof-img" alt="Payment proof" />
      </div>
    </div>

    <!-- Approve modal -->
    <div v-if="approveModal" class="modal-overlay" @click.self="approveModal = null">
      <div class="modal">
        <h3>Approve Recharge</h3>
        <p>
          Credit <strong>{{ Number(approveModal.coinsToCredit).toLocaleString() }} coins</strong>
          (${{ Number(approveModal.amountUsd).toFixed(2) }}) to
          <strong>{{ approveModal.user?.displayName }}</strong>?<br />
          Ensure the payment has been received before approving.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="approveModal = null">Cancel</button>
          <button class="btn btn-success" :disabled="actionLoading !== null" @click="confirmApprove">
            Yes, Approve
          </button>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectModal" class="modal-overlay" @click.self="rejectModal = null">
      <div class="modal">
        <h3>Reject Recharge</h3>
        <p>
          Rejecting ${{ Number(rejectModal.amountUsd).toFixed(2) }} recharge from
          <strong>{{ rejectModal.user?.displayName }}</strong>.<br />
          No coins will be credited.
        </p>
        <div class="form-group">
          <label>Reason / Notes (optional)</label>
          <textarea
            v-model="rejectNotes"
            class="form-textarea"
            placeholder="Enter rejection reason..."
            rows="3"
          />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="rejectModal = null">Cancel</button>
          <button class="btn btn-danger" :disabled="actionLoading !== null" @click="confirmReject">
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.search-input { flex: 1; height: 38px; padding: 0 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
.search-input:focus { border-color: #7B4FFF; }
.filter-select { height: 38px; padding: 0 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; background: #fff; }
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
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #888; border-bottom: 1px solid #eee; }
.data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.user-name { font-weight: 600; }
.mono { font-family: monospace; font-size: 13px; }
.small { font-size: 12px; color: #666; }
.bold { font-weight: 600; }
.empty-cell { color: #bbb; }
.action-btns { display: flex; gap: 8px; }
.processed-label { font-size: 12px; color: #999; }
.admin-note { font-size: 11px; color: #666; margin-top: 2px; max-width: 160px; }
.method-pill { background: #ede9fe; color: #5B21B6; border-radius: 8px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
.tx-hash { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.badge-warning { background: #fff3cd; color: #856404; }
.badge-success { background: #d1fae5; color: #065f46; }
.badge-danger { background: #fee2e2; color: #991b1b; }
.loading, .empty { padding: 40px; text-align: center; color: #999; font-size: 14px; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; padding: 24px; width: 440px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
.modal h3 { margin: 0 0 12px; font-size: 18px; }
.modal p { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 16px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.form-textarea { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; resize: vertical; outline: none; box-sizing: border-box; }
.form-textarea:focus { border-color: #7B4FFF; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.proof-modal { width: auto; max-width: 90vw; }
.modal-close-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.proof-img { max-width: 100%; max-height: 70vh; border-radius: 8px; display: block; }
</style>
