<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as giftsApi from '@/api/gifts'

// ── Totals ────────────────────────────────────────────────────────────────────
const totals   = ref<giftsApi.PlatformRevenue | null>(null)
const loadingT = ref(true)

async function fetchTotals() {
  loadingT.value = true
  try { totals.value = await giftsApi.getPlatformRevenue() } catch {}
  loadingT.value = false
}

// ── Ledger ────────────────────────────────────────────────────────────────────
const rows        = ref<giftsApi.PlatformRevenueLedgerRow[]>([])
const nextCursor  = ref<string | null>(null)
const cursorStack = ref<string[]>([])          // stack of previous cursors for back nav
const loadingL    = ref(true)
const fromDate    = ref('')
const toDate      = ref('')

async function fetchLedger(cursor?: string | null) {
  loadingL.value = true
  try {
    const page = await giftsApi.listPlatformRevenueLedger({
      cursor,
      limit: 20,
      from: fromDate.value || null,
      to:   toDate.value   || null,
    })
    rows.value       = page.rows
    nextCursor.value = page.nextCursor
  } catch {}
  loadingL.value = false
}

function applyFilter() {
  cursorStack.value = []
  fetchLedger(null)
}

function nextPage() {
  if (!nextCursor.value) return
  cursorStack.value.push(nextCursor.value)
  fetchLedger(nextCursor.value)
}

function prevPage() {
  cursorStack.value.pop()
  const prev = cursorStack.value[cursorStack.value.length - 1] ?? null
  fetchLedger(prev)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBeans(s: string | undefined | null) {
  if (!s) return '0'
  return BigInt(s).toLocaleString()
}

function fmtPct(rate: number) {
  return (rate * 100).toFixed(2) + '%'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function shortId(id: string) {
  return id.slice(0, 8) + '…'
}

onMounted(() => Promise.all([fetchTotals(), fetchLedger(null)]))
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Company Bean Revenue</h1>
        <p class="page-sub">Platform's implicit share from every gift transaction</p>
      </div>
    </div>

    <!-- ── KPI Row ──────────────────────────────────────────────────────────── -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-icon kpi-violet">🫘</div>
        <p class="kpi-label">All-Time Company Beans</p>
        <h2 class="kpi-value">
          <span v-if="loadingT">—</span>
          <span v-else>{{ fmtBeans(totals?.totalBeans) }}</span>
        </h2>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon kpi-emerald">📅</div>
        <p class="kpi-label">Today's Company Beans</p>
        <h2 class="kpi-value">
          <span v-if="loadingT">—</span>
          <span v-else>{{ fmtBeans(totals?.todayBeans) }}</span>
        </h2>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon kpi-sky">🗓️</div>
        <p class="kpi-label">This Month's Beans</p>
        <h2 class="kpi-value">
          <span v-if="loadingT">—</span>
          <span v-else>{{ fmtBeans(totals?.thisMonthBeans) }}</span>
        </h2>
      </div>
    </div>

    <!-- ── Ledger ───────────────────────────────────────────────────────────── -->
    <div class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Company Share Ledger</h2>
          <p class="card-sub">One row per gift — company's implicit revenue (beans)</p>
        </div>
        <div class="filter-row">
          <input v-model="fromDate" type="date" class="date-input" title="From" />
          <span class="filter-sep">–</span>
          <input v-model="toDate"   type="date" class="date-input" title="To" />
          <button class="btn btn-primary" @click="applyFilter">Filter</button>
        </div>
      </div>

      <div v-if="loadingL" class="loading">Loading ledger…</div>
      <div v-else-if="rows.length === 0" class="loading">No entries found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Gift Tx ID</th>
            <th class="num">Company Beans</th>
            <th class="num">Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="dim">{{ fmtDate(row.createdAt) }}</td>
            <td>
              <span class="mono dim" :title="row.giftTransactionId">{{ shortId(row.giftTransactionId) }}</span>
            </td>
            <td class="num beans fw">🫘 {{ fmtBeans(row.amount) }}</td>
            <td class="num dim">{{ fmtPct(row.rateApplied) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Cursor pagination -->
      <div class="cursor-nav">
        <button class="btn btn-outline" :disabled="cursorStack.length === 0" @click="prevPage">← Prev</button>
        <button class="btn btn-outline" :disabled="!nextCursor" @click="nextPage">Next →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
.page-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.kpi-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 8px;
}
.kpi-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.kpi-violet  { background: #7c3aed22; }
.kpi-emerald { background: #10b98122; }
.kpi-sky     { background: #0ea5e922; }
.kpi-label { font-size: 12px; color: var(--text-muted); margin: 0; }
.kpi-value { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; }

/* Table card */
.table-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border); gap: 16px; flex-wrap: wrap;
}
.card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.card-sub   { font-size: 12px; color: var(--text-muted); margin: 0; }

.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.date-input {
  padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--input-bg); color: var(--text-primary); font-size: 13px;
}
.filter-sep { color: var(--text-muted); }

.loading { padding: 32px; text-align: center; color: var(--text-muted); font-size: 14px; }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 10px 16px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); border-bottom: 1px solid var(--border);
  text-align: left;
}
.data-table th.num { text-align: right; }
.data-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
.data-table td.num { text-align: right; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: var(--row-hover, rgba(255,255,255,0.03)); }

.fw   { font-weight: 600; }
.dim  { color: var(--text-muted); }
.mono { font-family: monospace; font-size: 12px; }
.beans { color: var(--text-primary); }

.btn {
  padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: none; transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary  { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-outline  { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
.btn-outline:hover:not(:disabled) { background: var(--sidebar-hover); }

.cursor-nav {
  display: flex; gap: 8px; padding: 16px 24px;
  border-top: 1px solid var(--border);
}

@media (max-width: 768px) {
  .kpi-row { grid-template-columns: 1fr; }
  .card-header { flex-direction: column; align-items: flex-start; }
}
</style>
