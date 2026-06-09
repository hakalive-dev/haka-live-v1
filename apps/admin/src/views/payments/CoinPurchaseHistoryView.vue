<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as paymentsApi from '@/api/payments'
import StatusBadge from '@/components/common/StatusBadge.vue'
import Pagination from '@/components/common/Pagination.vue'

const purchases = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('')
const methodFilter = ref('')
const packageFilter = ref('')
const userIdFilter = ref('')
const search = ref('')
const fromDate = ref('')
const toDate = ref('')
const loading = ref(true)
const summaryLoading = ref(false)
const selected = ref<any | null>(null)
const summary = ref<any>({
  totalAmountGbp: '0',
  totalAmountUsd: '0',
  succeededCount: 0,
  failedCount: 0,
  pendingCount: 0,
  totalCoinsCredited: 0,
  byMethod: {},
})
const exporting = ref(false)

function buildParams() {
  const params: Record<string, any> = {
    page: pagination.value.page,
    limit: pagination.value.limit,
  }
  if (statusFilter.value) params.status = statusFilter.value
  if (methodFilter.value) params.method = methodFilter.value
  if (packageFilter.value) params.packageId = packageFilter.value
  if (userIdFilter.value) params.userId = userIdFilter.value
  else if (search.value) params.search = search.value
  if (fromDate.value) params.from = fromDate.value
  if (toDate.value) params.to = toDate.value
  return params
}

function packageOptions() {
  const map = new Map<string, any>()
  for (const p of purchases.value) {
    if (p.package?.id) map.set(p.package.id, p.package)
  }
  return Array.from(map.values())
}

async function fetchPurchases() {
  loading.value = true
  summaryLoading.value = true
  try {
    const params = buildParams()
    const [result, totals] = await Promise.all([
      paymentsApi.listCoinPurchases(params),
      paymentsApi.getCoinPurchasesSummary(params),
    ])
    purchases.value = result.items
    pagination.value = result.pagination
    summary.value = totals
  } catch {
    // handled by UI state
  }
  loading.value = false
  summaryLoading.value = false
}

function handleSearch() {
  pagination.value.page = 1
  fetchPurchases()
}

function handleFilter() {
  pagination.value.page = 1
  fetchPurchases()
}

async function handleExport() {
  exporting.value = true
  try {
    const blob = await paymentsApi.exportCoinPurchases(buildParams())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coin-purchases-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    exporting.value = false
  }
}

onMounted(fetchPurchases)
watch(() => pagination.value.page, fetchPurchases)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Recharge Records &mdash; Coin Purchases</h2>
      <div class="header-actions">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <button class="btn-search" :disabled="exporting" @click="handleExport">
          {{ exporting ? 'Exporting...' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Succeeded USD</span>
        <strong>${{ summaryLoading ? '...' : summary.totalAmountUsd }}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Succeeded</span>
        <strong>{{ summaryLoading ? '...' : summary.succeededCount }}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Failed / Pending</span>
        <strong>{{ summaryLoading ? '...' : `${summary.failedCount} / ${summary.pendingCount}` }}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Coins Credited</span>
        <strong>{{ summaryLoading ? '...' : summary.totalCoinsCredited.toLocaleString() }}</strong>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        class="search-input"
        placeholder="Search by name or Haka ID..."
        @keyup.enter="handleSearch"
        :disabled="!!userIdFilter"
      />
      <input
        v-model="userIdFilter"
        class="search-input"
        placeholder="Filter by account UUID..."
        @keyup.enter="handleSearch"
        :disabled="!!search"
      />
      <select v-model="statusFilter" class="filter-select" @change="handleFilter">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="succeeded">Succeeded</option>
        <option value="failed">Failed</option>
      </select>
      <select v-model="methodFilter" class="filter-select" @change="handleFilter">
        <option value="">All Methods</option>
        <option value="card">Card</option>
        <option value="apple_pay">Apple Pay</option>
        <option value="google_pay">Google Pay</option>
      </select>
      <select v-model="packageFilter" class="filter-select" @change="handleFilter">
        <option value="">All Packages</option>
        <option v-for="pkg in packageOptions()" :key="pkg.id" :value="pkg.id">
          {{ pkg.coins.toLocaleString() }} + {{ pkg.bonusCoins.toLocaleString() }} coins
        </option>
      </select>
      <input
        v-model="fromDate"
        type="date"
        class="date-input"
        @change="handleFilter"
      />
      <input
        v-model="toDate"
        type="date"
        class="date-input"
        @change="handleFilter"
      />
      <button class="btn-search" @click="handleSearch">Search</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading purchases...</div>
      <div v-else-if="purchases.length === 0" class="loading">No purchases found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Coins</th>
            <th>Package</th>
            <th>Amount (USD)</th>
            <th>Method</th>
            <th>Status</th>
            <th>Credited</th>
            <th>Payment Intent</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in purchases"
            :key="p.id"
            class="clickable-row"
            @click="selected = p"
          >
            <td>
              <div class="fw">{{ p.user?.displayName || '—' }}</div>
              <div class="dim mono">{{ p.user?.hakaId || '—' }}</div>
            </td>
            <td class="fw">
              {{ p.package?.coins?.toLocaleString() ?? '—' }}
              <span v-if="p.package?.bonusCoins">(+{{ p.package.bonusCoins }})</span>
            </td>
            <td class="dim">
              Package #{{ p.package?.id.slice(0, 6) || '—' }}
            </td>
            <td class="fw">
              ${{ (((p.package?.coins ?? 0) + (p.package?.bonusCoins ?? 0)) / 10000).toFixed(2) }}
            </td>
            <td>
              <StatusBadge :value="p.method" />
            </td>
            <td>
              <StatusBadge :value="p.status" />
            </td>
            <td>
              <span
                :class="[
                  'pill',
                  p.coinsCredited ? 'pill-success' : 'pill-warning',
                ]"
              >
                {{ p.coinsCredited ? 'Yes' : 'No' }}
              </span>
            </td>
            <td class="mono small ellipsis">
              {{ p.stripePaymentIntentId }}
            </td>
            <td class="dim small">
              {{ new Date(p.createdAt).toLocaleString() }}
            </td>
          </tr>
        </tbody>
      </table>

      <Pagination
        :page="pagination.page"
        :total-pages="pagination.totalPages"
        :total="pagination.total"
        @update:page="(p: number) => (pagination.page = p)"
      />
    </div>

    <!-- Detail modal -->
    <Teleport to="body">
      <div
        v-if="selected"
        class="modal-overlay"
        @click.self="selected = null"
      >
        <div class="modal-box">
          <div class="modal-header">
            <div>
              <h3>Purchase Detail</h3>
              <div class="modal-sub">
                {{ selected.user?.displayName || 'Unknown user' }}
              </div>
            </div>
            <button class="btn-close" @click="selected = null">✕</button>
          </div>
          <div class="detail-body">
            <div class="amount-hero">
              <span class="hero-amount">
                ${{ (((selected.package?.coins ?? 0) + (selected.package?.bonusCoins ?? 0)) / 10000).toFixed(2) }}
              </span>
              <span class="hero-coins">
                {{ selected.package?.coins?.toLocaleString() ?? '—' }} coins
              </span>
            </div>
            <div class="detail-grid">
              <div class="dfield">
                <span class="dl">User</span>
                <span class="dv fw">{{ selected.user?.displayName }}</span>
              </div>
              <div class="dfield">
                <span class="dl">Haka ID</span>
                <span class="dv mono">
                  {{ selected.user?.hakaId || '—' }}
                </span>
              </div>
              <div class="dfield">
                <span class="dl">Status</span>
                <StatusBadge :value="selected.status" />
              </div>
              <div class="dfield">
                <span class="dl">Method</span>
                <StatusBadge :value="selected.method" />
              </div>
              <div class="dfield">
                <span class="dl">Coins Credited</span>
                <span class="dv">
                  {{ selected.coinsCredited ? 'Yes' : 'No' }}
                </span>
              </div>
              <div class="dfield full">
                <span class="dl">Payment Intent ID</span>
                <span class="dv mono small">
                  {{ selected.stripePaymentIntentId }}
                </span>
              </div>
              <div class="dfield full">
                <span class="dl">Date</span>
                <span class="dv">
                  {{ new Date(selected.createdAt).toLocaleString() }}
                </span>
              </div>
              <div class="dfield full">
                <span class="dl">Purchase ID</span>
                <span class="dv mono small">
                  {{ selected.id }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.stat-pill {
  background: #f0f0f0;
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 13px;
  color: #555;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
}

.summary-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}

.summary-card strong {
  font-size: 18px;
  color: var(--text-primary);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-input {
  flex: 1;
  min-width: 220px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--card-bg);
  color: var(--text-primary);
  outline: none;
}

.search-input:focus {
  border-color: #7b4fff;
}

.filter-select,
.date-input {
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--card-bg);
  color: var(--text-primary);
  outline: none;
}

.btn-search {
  height: 38px;
  padding: 0 16px;
  background: #7b4fff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-search:hover {
  background: #6040e0;
}

.table-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
}

.loading {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  background: #f8fafc;
}

.data-table td {
  padding: 10px 16px;
  font-size: 13px;
  border-top: 1px solid #f1f5f9;
  vertical-align: middle;
}

.clickable-row {
  cursor: pointer;
}

.clickable-row:hover td {
  background: var(--row-hover);
}

.fw {
  font-weight: 500;
}

.dim {
  color: var(--text-muted);
  font-size: 12px;
}

.mono {
  font-family: monospace;
}

.small {
  font-size: 12px;
}

.ellipsis {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.pill-success {
  background: #dcfce7;
  color: #166534;
}

.pill-warning {
  background: #fef3c7;
  color: #92400e;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal-box {
  background: var(--card-bg);
  border-radius: 16px;
  width: min(520px, 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--card-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.modal-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.btn-close {
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-close:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.detail-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.amount-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  padding: 16px 20px;
  border-radius: 10px;
  background: #eff6ff;
}

.hero-amount {
  font-size: 28px;
  font-weight: 800;
  color: #1d4ed8;
}

.hero-coins {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.dfield {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dfield.full {
  grid-column: 1 / -1;
}

.dl {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.dv {
  font-size: 13px;
  color: var(--text-primary);
}
</style>

