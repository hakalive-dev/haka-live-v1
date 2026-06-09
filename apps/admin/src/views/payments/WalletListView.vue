<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as paymentsApi from '@/api/payments'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const wallets = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search = ref('')
const loading = ref(true)

// Manual balance adjustment modal
const adjustModal = ref<{ userId: string; displayName: string; hakaId: string } | null>(null)
const adjustForm = ref({ currency: 'coins' as 'coins' | 'beans', amount: 0, reason: '' })
const adjustLoading = ref(false)

async function fetchWallets() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (search.value) params.search = search.value
    const result = await paymentsApi.listWallets(params)
    wallets.value = result.wallets
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchWallets() }

function openAdjust(w: any) {
  adjustModal.value = { userId: w.user.id, displayName: w.user.displayName, hakaId: w.user.hakaId }
  adjustForm.value = { currency: 'coins', amount: 0, reason: '' }
}

async function submitAdjust() {
  if (!adjustModal.value || adjustForm.value.amount === 0 || !adjustForm.value.reason) return
  adjustLoading.value = true
  try {
    await paymentsApi.adjustBalance(adjustModal.value.userId, adjustForm.value.currency, adjustForm.value.amount, adjustForm.value.reason)
    toast.success('Balance Adjusted')
    adjustModal.value = null
    await fetchWallets()
  } catch (e: any) {
    toast.error('Adjustment Failed', e?.message)
  }
  adjustLoading.value = false
}

onMounted(fetchWallets)
watch(() => pagination.value.page, fetchWallets)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>User Wallets</h2>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="toolbar">
      <input v-model="search" @keyup.enter="handleSearch" class="search-input" placeholder="Search by user name or Haka ID..." />
      <button class="btn btn-primary" @click="handleSearch">Search</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading wallets...</div>
      <div v-else-if="wallets.length === 0" class="loading">No wallets found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Haka ID</th>
            <th>Coins</th>
            <th>Beans</th>
            <th>Updated</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in wallets" :key="w.id">
            <td class="cell-primary">{{ w.user?.displayName || '—' }}</td>
            <td class="haka-id">{{ w.user?.hakaId || '—' }}</td>
            <td><span class="coin-val">🪙 {{ w.coinBalance.toLocaleString() }}</span></td>
            <td><span class="bean-val">🫘 {{ w.beanBalance.toLocaleString() }}</span></td>
            <td class="dim">{{ new Date(w.updatedAt).toLocaleString() }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openAdjust(w)">Adjust Balance</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total" @update:page="(p: number) => pagination.page = p" />

    <!-- Adjust Modal -->
    <div v-if="adjustModal" class="modal-overlay" @click.self="adjustModal = null">
      <div class="modal">
        <h3>Adjust Balance</h3>
        <p>
          Manually adjust wallet for <strong>{{ adjustModal.displayName }}</strong>
          <span class="haka-id"> ({{ adjustModal.hakaId }})</span>
        </p>
        <div class="form-group">
          <label>Currency</label>
          <select v-model="adjustForm.currency" class="form-input">
            <option value="coins">Coins 🪙</option>
            <option value="beans">Beans 🫘</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (positive = credit, negative = deduct)</label>
          <input type="number" v-model.number="adjustForm.amount" class="form-input" placeholder="e.g. 500 or -100" />
        </div>
        <div class="form-group">
          <label>Reason (required)</label>
          <input v-model="adjustForm.reason" class="form-input" placeholder="e.g. Compensation for issue #123" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="adjustModal = null">Cancel</button>
          <button
            class="btn"
            :class="adjustForm.amount >= 0 ? 'btn-success' : 'btn-danger'"
            :disabled="adjustLoading || adjustForm.amount === 0 || !adjustForm.reason"
            @click="submitAdjust"
          >
            {{ adjustLoading ? 'Adjusting...' : (adjustForm.amount >= 0 ? 'Credit Balance' : 'Deduct Balance') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.toolbar { display: flex; gap: 8px; }
.search-input { flex: 1; height: 40px; padding: 0 14px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); outline: none; }
.search-input:focus { border-color: var(--primary); }
.btn { height: 38px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-success { background: #22C97A; color: #fff; }
.btn-danger { background: #FF4D4D; color: #fff; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-outline { background: transparent; border: 1px solid #ddd; color: #555; height: 28px; padding: 0 10px; font-size: 12px; }
.btn-sm { height: 28px; padding: 0 12px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.cell-primary { font-weight: 500; }
.haka-id { color: var(--primary); font-weight: 700; }
.coin-val { color: var(--warning); font-weight: 600; }
.bean-val { color: var(--success); font-weight: 600; }
.dim { color: var(--text-muted); font-size: 12px; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; padding: 24px; width: 440px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal h3 { margin: 0 0 8px; font-size: 18px; }
.modal p { font-size: 14px; color: #555; margin-bottom: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.form-input {
  width: 100%; height: 38px; padding: 0 12px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;
  background: #fff;
}
.form-input:focus { border-color: #7B4FFF; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
</style>
