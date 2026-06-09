<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as paymentsApi from '@/api/payments'
import StatusBadge from '@/components/common/StatusBadge.vue'
import Pagination from '@/components/common/Pagination.vue'

const transactions = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const currencyFilter = ref('')
const typeFilter = ref('')
const userIdFilter = ref('')
const loading = ref(true)
const selected = ref<any>(null)

async function fetchTransactions() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (currencyFilter.value) params.currency = currencyFilter.value
    if (typeFilter.value)     params.transactionType = typeFilter.value
    if (userIdFilter.value)   params.userId = userIdFilter.value
    const result = await paymentsApi.listWalletTransactions(params)
    transactions.value = result.transactions
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleFilter() { pagination.value.page = 1; fetchTransactions() }
function handleSearch() { pagination.value.page = 1; fetchTransactions() }
onMounted(fetchTransactions)
watch(() => pagination.value.page, fetchTransactions)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <input
        v-model="userIdFilter"
        placeholder="Filter by account UUID..."
        class="search-input"
        @keyup.enter="handleSearch"
      />
      <select v-model="currencyFilter" @change="handleFilter" class="filter-select">
        <option value="">All Currency</option>
        <option value="coins">Coins</option>
        <option value="beans">Beans</option>
      </select>
      <select v-model="typeFilter" @change="handleFilter" class="filter-select">
        <option value="">All Types</option>
        <option value="credit">Credit</option>
        <option value="debit">Debit</option>
      </select>
      <button class="btn-search" @click="handleSearch">Search</button>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="transactions.length === 0" class="loading">No transactions found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Type</th>
            <th>Currency</th>
            <th>Amount</th>
            <th>Balance After</th>
            <th>Reference</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id" class="clickable-row" @click="selected = tx">
            <td>
              <div class="fw">{{ tx.wallet?.user?.displayName || '—' }}</div>
              <div class="dim mono">{{ tx.wallet?.user?.hakaId }}</div>
            </td>
            <td><StatusBadge :value="tx.transactionType" /></td>
            <td><StatusBadge :value="tx.currency" /></td>
            <td :class="tx.transactionType === 'credit' ? 'credit' : 'debit'">
              {{ tx.transactionType === 'credit' ? '+' : '-' }}{{ tx.amount.toLocaleString() }}
            </td>
            <td>{{ tx.balanceAfter.toLocaleString() }}</td>
            <td class="dim">{{ tx.reference || '—' }}</td>
            <td class="dim">{{ new Date(tx.createdAt).toLocaleString() }}</td>
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
            <h3>Transaction Detail</h3>
            <div class="modal-sub">{{ selected.wallet?.user?.displayName }}</div>
          </div>
          <button class="btn-close" @click="selected = null">✕</button>
        </div>
        <div class="detail-body">
          <!-- Amount hero -->
          <div class="amount-hero" :class="selected.transactionType === 'credit' ? 'hero-credit' : 'hero-debit'">
            <span class="hero-sign">{{ selected.transactionType === 'credit' ? '+' : '-' }}</span>
            <span class="hero-amount">{{ selected.amount.toLocaleString() }}</span>
            <span class="hero-currency">{{ selected.currency }}</span>
          </div>
          <div class="detail-grid">
            <div class="dfield"><span class="dl">User</span><span class="dv fw">{{ selected.wallet?.user?.displayName }}</span></div>
            <div class="dfield"><span class="dl">Haka ID</span><span class="dv mono">{{ selected.wallet?.user?.hakaId || '—' }}</span></div>
            <div class="dfield"><span class="dl">Type</span><StatusBadge :value="selected.transactionType" /></div>
            <div class="dfield"><span class="dl">Currency</span><StatusBadge :value="selected.currency" /></div>
            <div class="dfield"><span class="dl">Amount</span>
              <span class="dv fw" :class="selected.transactionType === 'credit' ? 'credit' : 'debit'">
                {{ selected.transactionType === 'credit' ? '+' : '-' }}{{ selected.amount.toLocaleString() }}
              </span>
            </div>
            <div class="dfield"><span class="dl">Balance After</span><span class="dv fw">{{ selected.balanceAfter.toLocaleString() }}</span></div>
            <div class="dfield"><span class="dl">Reference</span><span class="dv mono">{{ selected.reference || '—' }}</span></div>
            <div class="dfield"><span class="dl">Description</span><span class="dv">{{ selected.description || '—' }}</span></div>
            <div class="dfield full"><span class="dl">Transaction ID</span><span class="dv mono dim">{{ selected.id }}</span></div>
            <div class="dfield full"><span class="dl">Date</span><span class="dv">{{ new Date(selected.createdAt).toLocaleString() }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 220px; height: 40px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; }
.search-input:focus { border-color: #7B4FFF; }
.filter-select { height: 40px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); cursor: pointer; outline: none; }
.btn-search { height: 40px; padding: 0 16px; background: #7B4FFF; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-search:hover { background: #6040e0; }
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
.credit { color: var(--success); font-weight: 600; }
.debit { color: var(--danger); font-weight: 600; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(520px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.detail-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.amount-hero { display: flex; align-items: baseline; gap: 6px; padding: 16px 20px; border-radius: 10px; }
.hero-credit { background: #d1fae5; }
.hero-debit { background: #fee2e2; }
.hero-sign { font-size: 22px; font-weight: 700; }
.hero-amount { font-size: 32px; font-weight: 800; }
.hero-currency { font-size: 14px; font-weight: 600; text-transform: uppercase; opacity: 0.7; }
.hero-credit .hero-sign, .hero-credit .hero-amount, .hero-credit .hero-currency { color: #065f46; }
.hero-debit .hero-sign, .hero-debit .hero-amount, .hero-debit .hero-currency { color: #991b1b; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dfield { display: flex; flex-direction: column; gap: 3px; }
.dfield.full { grid-column: 1 / -1; }
.dl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.dv { font-size: 13px; color: var(--text-primary); }
</style>
