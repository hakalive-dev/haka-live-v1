<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import * as api from '@/api/masterWallet'
import Pagination from '@/components/common/Pagination.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const toast        = useToastStore()
const auth         = useAuthStore()
const isSuperAdmin = auth.isSuperAdmin

// ── Overview ─────────────────────────────────────────────────────────────────
const overview    = ref<api.CirculationStats | null>(null)
const wallets     = ref<api.SystemWalletInfo[]>([])
const pendingMints = ref(0)
const loadingOv   = ref(true)

async function fetchOverview() {
  loadingOv.value = true
  try {
    const data = await api.getOverview()
    wallets.value    = data.wallets
    overview.value   = data.circulation
    pendingMints.value = data.pendingMints
  } catch {}
  loadingOv.value = false
}

// ── KPI cards (computed from real data) ──────────────────────────────────────
const kpis = computed(() => {
  const master = wallets.value.find(w => w.walletType === 'MASTER')
  const recovery = wallets.value.find(w => w.walletType === 'RECOVERY')
  const revenue = wallets.value.find(w => w.walletType === 'REVENUE')
  return [
    { title: 'Master Balance',      value: fmtCoins(master?.balance),    icon: 'wallet',   color: 'violet' },
    { title: 'Coins in Circulation', value: fmtCoins(overview.value?.userCoins), icon: 'coins', color: 'blue' },
    { title: 'Total Minted',        value: fmtCoins(overview.value?.totalMinted), icon: 'up',  color: 'emerald' },
    { title: 'Recovery Pool',       value: fmtCoins(recovery?.balance),  icon: 'shield',   color: 'amber' },
    { title: 'Revenue',             value: fmtCoins(revenue?.balance),   icon: 'revenue',  color: 'sky' },
  ]
})

// ── Mint Requests ─────────────────────────────────────────────────────────────
const mintReqs       = ref<api.MintRequest[]>([])
const mintReqsLoading = ref(false)
const mintReqsTab    = ref<'pending' | 'all'>('pending')
const showMintRequests = ref(false)

async function fetchMintRequests() {
  mintReqsLoading.value = true
  try {
    mintReqs.value = await api.listMintRequests(mintReqsTab.value === 'pending' ? 'pending' : undefined)
  } catch {}
  mintReqsLoading.value = false
}

async function handleApproveMint(id: string) {
  try {
    await api.approveMint(id)
    toast.success('Mint Approved', 'Coins added to Master Wallet')
    await Promise.all([fetchOverview(), fetchMintRequests(), fetchTxs()])
  } catch (e: any) { toast.error('Approval Failed', e?.response?.data?.message || e?.message) }
}

async function handleRejectMint(id: string) {
  const reason = window.prompt('Reject reason (required):')
  if (!reason?.trim()) return
  try {
    await api.rejectMint(id, reason.trim())
    toast.info('Mint Rejected')
    await fetchMintRequests()
    await fetchOverview()
  } catch (e: any) { toast.error('Rejection Failed', e?.response?.data?.message || e?.message) }
}

// ── Transactions ──────────────────────────────────────────────────────────────
const txs       = ref<api.SystemTx[]>([])
const txPag     = ref({ page: 1, limit: 50, total: 0, totalPages: 0 })
const txType    = ref('')
const txStatus  = ref('')
const txLoading = ref(false)

// Purchases (coin top-ups) — surfaced here for full audit visibility
const purchaseTab = ref<'system' | 'purchases'>('system')
const purchases = ref<any[]>([])
const purchasePag = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const purchaseStatus = ref('')
const purchaseLoading = ref(false)

async function fetchTxs() {
  txLoading.value = true
  try {
    const params: any = { page: txPag.value.page, limit: txPag.value.limit }
    if (txType.value)  params.txType  = txType.value
    if (txStatus.value) params.status = txStatus.value
    const data = await api.listTransactions(params)
    txs.value  = data.transactions
    Object.assign(txPag.value, data.pagination)
  } catch {}
  txLoading.value = false
}

async function fetchPurchases() {
  purchaseLoading.value = true
  try {
    const params: any = {
      page: purchasePag.value.page,
      limit: purchasePag.value.limit,
      status: purchaseStatus.value || undefined,
    }
    const data = await import('@/api/payments').then(m => m.listCoinPurchases(params))
    purchases.value = data.items
    Object.assign(purchasePag.value, data.pagination)
  } catch {
    // handled by UI
  }
  purchaseLoading.value = false
}

// ── Reversal ──────────────────────────────────────────────────────────────────
const reverseModal  = ref(false)
const reverseTxId   = ref('')
const reverseTx     = ref<api.SystemTx | null>(null)
const reverseReason = ref('')
const reverseLoading = ref(false)

function openReverse(tx: api.SystemTx) {
  reverseTxId.value   = tx.id
  reverseTx.value     = tx
  reverseReason.value = ''
  reverseModal.value  = true
}

async function submitReverse() {
  if (!reverseReason.value.trim()) { toast.warning('Reason required'); return }
  reverseLoading.value = true
  try {
    await api.reverseTransaction(reverseTxId.value, reverseReason.value.trim())
    toast.success('Transaction Reversed', 'Counter-entry recorded in ledger')
    reverseModal.value = false
    await Promise.all([fetchOverview(), fetchTxs()])
  } catch (e: any) { toast.error('Reversal Failed', e?.response?.data?.message || e?.message) }
  reverseLoading.value = false
}

// ── Request Mint modal ────────────────────────────────────────────────────────
const mintModal   = ref(false)
const mintAmount  = ref('')
const mintReason  = ref('')
const mintLoading = ref(false)

async function submitMintRequest() {
  const amt = parseInt(mintAmount.value, 10)
  if (isNaN(amt) || amt <= 0) { toast.warning('Invalid amount'); return }
  if (!mintReason.value.trim()) { toast.warning('Reason required'); return }
  mintLoading.value = true
  try {
    await api.requestMint({ amount: amt, reason: mintReason.value.trim() })
    toast.success('Mint Request Submitted', 'A second super_admin must approve before coins are created')
    mintModal.value = false
    mintAmount.value = ''
    mintReason.value = ''
    showMintRequests.value = true
    await Promise.all([fetchOverview(), fetchMintRequests()])
  } catch (e: any) { toast.error('Request Failed', e?.response?.data?.message || e?.message) }
  mintLoading.value = false
}

// ── Transfer modal ────────────────────────────────────────────────────────────
const transferModal   = ref(false)
const transferFrom    = ref('MASTER')
const transferTo      = ref('RECOVERY')
const transferAmount  = ref('')
const transferReason  = ref('')
const transferLoading = ref(false)

async function submitTransfer() {
  const amt = parseInt(transferAmount.value, 10)
  if (isNaN(amt) || amt <= 0) { toast.warning('Invalid amount'); return }
  if (transferFrom.value === transferTo.value) { toast.warning('Source and destination must differ'); return }
  if (!transferReason.value.trim()) { toast.warning('Reason required'); return }
  transferLoading.value = true
  try {
    await api.transferWallets({ fromType: transferFrom.value, toType: transferTo.value, amount: amt, reason: transferReason.value.trim() })
    toast.success('Transfer Complete')
    transferModal.value = false
    transferAmount.value = ''
    transferReason.value = ''
    await Promise.all([fetchOverview(), fetchTxs()])
  } catch (e: any) { toast.error('Transfer Failed', e?.response?.data?.message || e?.message) }
  transferLoading.value = false
}

// ── Credit User modal ─────────────────────────────────────────────────────────
const creditModal   = ref(false)
const creditUserId  = ref('')
const creditAmount  = ref('')
const creditReason  = ref('')
const creditLoading = ref(false)

async function submitCredit() {
  const amt = parseInt(creditAmount.value, 10)
  if (isNaN(amt) || amt <= 0) { toast.warning('Invalid amount'); return }
  if (!creditUserId.value.trim()) { toast.warning('Account UUID required'); return }
  if (!creditReason.value.trim()) { toast.warning('Reason required'); return }
  creditLoading.value = true
  try {
    await api.creditUser({ userId: creditUserId.value.trim(), amount: amt, reason: creditReason.value.trim() })
    toast.success('User Credited', `${amt.toLocaleString()} coins from Master Wallet`)
    creditModal.value = false; creditUserId.value = ''; creditAmount.value = ''; creditReason.value = ''
    await Promise.all([fetchOverview(), fetchTxs()])
  } catch (e: any) { toast.error('Credit Failed', e?.response?.data?.message || e?.message) }
  creditLoading.value = false
}

// ── Deduct User modal ─────────────────────────────────────────────────────────
const deductModal   = ref(false)
const deductUserId  = ref('')
const deductAmount  = ref('')
const deductReason  = ref('')
const deductLoading = ref(false)

async function submitDeduct() {
  const amt = parseInt(deductAmount.value, 10)
  if (isNaN(amt) || amt <= 0) { toast.warning('Invalid amount'); return }
  if (!deductUserId.value.trim()) { toast.warning('Account UUID required'); return }
  if (!deductReason.value.trim()) { toast.warning('Reason required'); return }
  deductLoading.value = true
  try {
    await api.deductUser({ userId: deductUserId.value.trim(), amount: amt, reason: deductReason.value.trim() })
    toast.success('Coins Deducted', `${amt.toLocaleString()} → Recovery Wallet`)
    deductModal.value = false; deductUserId.value = ''; deductAmount.value = ''; deductReason.value = ''
    await Promise.all([fetchOverview(), fetchTxs()])
  } catch (e: any) { toast.error('Deduct Failed', e?.response?.data?.message || e?.message) }
  deductLoading.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function walletIcon(type: string) {
  const m: Record<string, string> = { MASTER: '🏦', RECOVERY: '🛡️', BONUS: '🎁', REVENUE: '💹' }
  return m[type] ?? '💰'
}
function walletColorClass(type: string) {
  const m: Record<string, string> = { MASTER: 'wc-violet', RECOVERY: 'wc-amber', BONUS: 'wc-emerald', REVENUE: 'wc-sky' }
  return m[type] ?? 'wc-violet'
}
function txBadgeClass(type: string) {
  const m: Record<string, string> = {
    MINT: 'tbadge-mint', CREDIT_USER: 'tbadge-credit', DEDUCT_USER: 'tbadge-deduct',
    TRANSFER: 'tbadge-transfer', REVERSAL: 'tbadge-reversal',
    COLLECT_REVENUE: 'tbadge-revenue', ALLOCATE_BONUS: 'tbadge-bonus',
  }
  return m[type] ?? ''
}
function fmtCoins(n: string | undefined | null) {
  if (!n) return '0'
  return BigInt(n).toLocaleString()
}
function canReverse(tx: api.SystemTx) {
  return tx.status === 'active' && ['CREDIT_USER', 'DEDUCT_USER', 'TRANSFER'].includes(tx.txType)
}
function statusBadge(status: string) {
  if (status === 'active') return 'sb-success'
  if (status === 'reversed') return 'sb-muted'
  return 'sb-review'
}

onMounted(async () => {
  await Promise.all([fetchOverview(), fetchTxs(), fetchPurchases()])
  if (isSuperAdmin) fetchMintRequests()
})
</script>

<template>
  <div class="page">

    <!-- ── KPI Row ──────────────────────────────────────────────────────────── -->
    <div class="kpi-row">
      <div v-for="(kpi, i) in kpis" :key="i" class="kpi-card">
        <div class="kpi-top">
          <div :class="['kpi-icon', `kpi-${kpi.color}`]">
            <span v-if="kpi.icon === 'wallet'">&#x1F4B0;</span>
            <span v-else-if="kpi.icon === 'coins'">&#x1FA99;</span>
            <span v-else-if="kpi.icon === 'up'">&#x2B06;</span>
            <span v-else-if="kpi.icon === 'shield'">&#x1F6E1;</span>
            <span v-else-if="kpi.icon === 'revenue'">&#x1F4B9;</span>
          </div>
        </div>
        <p class="kpi-label">{{ kpi.title }}</p>
        <h2 class="kpi-value">{{ kpi.value }}</h2>
      </div>
    </div>

    <!-- ── System Wallets + Mint Requests ───────────────────────────────────── -->
    <div class="main-grid">

      <!-- Left: System Wallets -->
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">System Wallets</h2>
            <p class="card-sub">Monitor operational balances across treasury wallets</p>
          </div>
          <button v-if="isSuperAdmin" class="btn-outline" @click="transferModal = true">Transfer</button>
        </div>
        <div v-if="loadingOv" class="card-loading">Loading wallets...</div>
        <div v-else class="wallet-grid">
          <div v-for="w in wallets" :key="w.walletType" :class="['wallet-tile', walletColorClass(w.walletType)]">
            <div class="wt-top">
              <p class="wt-name">{{ walletIcon(w.walletType) }} {{ w.walletType }}</p>
              <span class="wt-status">Active</span>
            </div>
            <h3 class="wt-balance">{{ fmtCoins(w.balance) }}</h3>
            <div class="wt-sub">
              <span class="wt-in">&#8593; {{ fmtCoins(w.totalIn) }} in</span>
              <span class="wt-out">&#8595; {{ fmtCoins(w.totalOut) }} out</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Circulation + Alerts -->
      <div class="right-stack">
        <!-- Circulation -->
        <div class="card circ-card" v-if="overview">
          <h2 class="card-title">Coin Circulation</h2>
          <div class="circ-grid">
            <div class="circ-item"><span class="circ-value cv-minted">{{ fmtCoins(overview.totalMinted) }}</span><span class="circ-label">Total Minted</span></div>
            <div class="circ-item"><span class="circ-value cv-issued">{{ fmtCoins(overview.totalIssued) }}</span><span class="circ-label">Issued</span></div>
            <div class="circ-item"><span class="circ-value cv-active">{{ fmtCoins(overview.userCoins) }}</span><span class="circ-label">User Wallets</span></div>
            <div class="circ-item"><span class="circ-value cv-recovery">{{ fmtCoins(overview.recoveryCoins) }}</span><span class="circ-label">Recovery</span></div>
            <div class="circ-item"><span class="circ-value cv-bonus">{{ fmtCoins(overview.bonusCoins) }}</span><span class="circ-label">Bonus</span></div>
            <div class="circ-item"><span class="circ-value cv-revenue">{{ fmtCoins(overview.revenueCoins) }}</span><span class="circ-label">Revenue</span></div>
          </div>
        </div>

        <!-- Pending Mints Alert -->
        <div v-if="isSuperAdmin && pendingMints > 0" class="alert-card">
          <div class="alert-icon">&#x1F6A8;</div>
          <div>
            <h3 class="alert-title">{{ pendingMints }} Pending Mint {{ pendingMints === 1 ? 'Request' : 'Requests' }}</h3>
            <p class="alert-sub">Requires a second super_admin to approve</p>
          </div>
          <button class="btn-sm btn-alert" @click="showMintRequests = !showMintRequests">
            {{ showMintRequests ? 'Hide' : 'Review' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Mint Requests Panel ──────────────────────────────────────────────── -->
    <div v-if="isSuperAdmin && showMintRequests" class="card mint-panel">
      <div class="mint-panel-header">
        <div>
          <h2 class="card-title">Mint Requests &mdash; 2-Step Approval</h2>
          <p class="card-sub">You <strong>cannot</strong> approve your own request. A second super_admin must approve.</p>
        </div>
        <div class="tab-row">
          <button :class="['tab-btn', mintReqsTab === 'pending' ? 'tab-active' : '']" @click="mintReqsTab = 'pending'; fetchMintRequests()">Pending</button>
          <button :class="['tab-btn', mintReqsTab === 'all' ? 'tab-active' : '']" @click="mintReqsTab = 'all'; fetchMintRequests()">All</button>
        </div>
      </div>
      <div v-if="mintReqsLoading" class="card-loading">Loading...</div>
      <div v-else-if="mintReqs.length === 0" class="card-empty">No {{ mintReqsTab === 'pending' ? 'pending' : '' }} mint requests</div>
      <div v-else class="mint-list">
        <div v-for="r in mintReqs" :key="r.id" class="mint-item">
          <div class="mint-left">
            <div class="mint-amount">{{ fmtCoins(r.amount) }} coins</div>
            <div class="mint-reason">{{ r.reason }}</div>
            <div class="mint-meta">By <span class="mono">{{ r.requestedBy.slice(0, 8) }}...</span> &middot; {{ new Date(r.createdAt).toLocaleString() }}</div>
          </div>
          <div class="mint-right">
            <span :class="['pill', `pill-${r.status}`]">{{ r.status }}</span>
            <template v-if="r.status === 'pending'">
              <button class="btn-sm btn-approve" @click="handleApproveMint(r.id)">Approve</button>
              <button class="btn-sm btn-reject" @click="handleRejectMint(r.id)">Reject</button>
            </template>
            <span v-if="r.rejectReason" class="reject-text">{{ r.rejectReason }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Ledger Tabs: System vs Purchases ───────────────────────────────────── -->
    <div class="card tx-card">
      <div class="tx-header tx-header-tabs">
        <div>
          <h2 class="card-title">Master Wallet Ledger</h2>
          <p class="card-sub">
            System treasury movements and recharge purchases &mdash; fully auditable.
          </p>
        </div>
        <div class="tab-row">
          <button
            :class="['tab-btn', purchaseTab === 'system' ? 'tab-active' : '']"
            @click="purchaseTab = 'system'"
          >
            System Transactions
          </button>
          <button
            :class="['tab-btn', purchaseTab === 'purchases' ? 'tab-active' : '']"
            @click="purchaseTab = 'purchases'"
          >
            Recharge Purchases
          </button>
        </div>
      </div>

      <!-- System transactions table -->
      <div v-if="purchaseTab === 'system'" class="tx-section">
        <div class="tx-header-inner">
          <div class="tx-filters">
            <select v-model="txType" @change="txPag.page = 1; fetchTxs()" class="sel">
              <option value="">All Types</option>
              <option value="MINT">Mint</option>
              <option value="CREDIT_USER">Credit User</option>
              <option value="DEDUCT_USER">Deduct User</option>
              <option value="TRANSFER">Transfer</option>
              <option value="REVERSAL">Reversal</option>
            </select>
            <select v-model="txStatus" @change="txPag.page = 1; fetchTxs()" class="sel">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>
        </div>
        <div v-if="txLoading" class="card-loading">Loading transactions...</div>
        <div v-else class="tx-table-wrap">
          <table class="tx-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>From → To</th>
                <th>Balance After</th>
                <th>User</th>
                <th>Reason</th>
                <th>By</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="txs.length === 0"><td colspan="10" class="card-empty">No transactions yet</td></tr>
              <tr v-for="tx in txs" :key="tx.id" :class="tx.status === 'reversed' ? 'row-faded' : ''">
                <td><span :class="['pill-tx', txBadgeClass(tx.txType)]">{{ tx.txType.replace(/_/g, ' ') }}</span></td>
                <td class="td-amount">{{ fmtCoins(tx.amount) }}</td>
                <td class="td-flow">
                  <span class="flow-from">{{ tx.fromWallet ?? '—' }}</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-to">{{ tx.toWallet ?? '—' }}</span>
                </td>
                <td class="td-bal">
                  <div v-if="tx.fromBalanceAfter" class="bal-from">{{ fmtCoins(tx.fromBalanceAfter) }}</div>
                  <div v-if="tx.toBalanceAfter" class="bal-to">{{ fmtCoins(tx.toBalanceAfter) }}</div>
                  <span v-if="!tx.fromBalanceAfter && !tx.toBalanceAfter" class="muted">—</span>
                </td>
                <td class="td-user">{{ tx.targetUserId ? tx.targetUserId.slice(0, 8) + '...' : '—' }}</td>
                <td class="td-reason">{{ tx.reason || '—' }}</td>
                <td class="td-admin">{{ tx.performedBy ? tx.performedBy.slice(0, 8) + '...' : 'system' }}</td>
                <td><span :class="['pill-status', statusBadge(tx.status)]">{{ tx.status }}</span></td>
                <td class="td-date">{{ new Date(tx.createdAt).toLocaleString() }}</td>
                <td>
                  <button v-if="canReverse(tx)" class="btn-icon" @click="openReverse(tx)" title="Reverse">&#x21A9;</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination :page="txPag.page" :total-pages="txPag.totalPages" :total="txPag.total"
          @update:page="(p: number) => { txPag.page = p; fetchTxs() }" />
      </div>

      <!-- Purchases table -->
      <div v-else class="tx-section">
        <div class="tx-header-inner">
          <p class="tx-subcopy">
            End-user coin purchases (Stripe / in-app) linked to user wallets.
          </p>
          <div class="tx-filters">
            <select v-model="purchaseStatus" @change="purchasePag.page = 1; fetchPurchases()" class="sel">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div v-if="purchaseLoading" class="card-loading">Loading purchases...</div>
        <div v-else class="tx-table-wrap">
          <table class="tx-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Coins</th>
                <th>Amount (GBP)</th>
                <th>Method</th>
                <th>Status</th>
                <th>Credited</th>
                <th>Payment Intent</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="purchases.length === 0"><td colspan="8" class="card-empty">No purchases yet</td></tr>
              <tr v-for="p in purchases" :key="p.id">
                <td class="td-user">
                  <div>{{ p.user?.displayName || '—' }}</div>
                  <div class="muted mono small">{{ p.user?.hakaId || '—' }}</div>
                </td>
                <td class="td-amount">
                  {{ p.package?.coins?.toLocaleString() ?? '—' }}
                  <span v-if="p.package?.bonusCoins">(+{{ p.package.bonusCoins }})</span>
                </td>
                <td class="td-amount">£{{ Number(p.amountGbp).toFixed(2) }}</td>
                <td><span class="mono small">{{ p.method }}</span></td>
                <td><span class="pill-status" :class="p.status === 'succeeded' ? 'sb-success' : p.status === 'failed' ? 'sb-muted' : 'sb-review'">{{ p.status }}</span></td>
                <td>
                  <span :class="['pill-status', p.coinsCredited ? 'sb-success' : 'sb-review']">
                    {{ p.coinsCredited ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="mono small ellipsis">{{ p.stripePaymentIntentId }}</td>
                <td class="td-date">{{ new Date(p.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination :page="purchasePag.page" :total-pages="purchasePag.totalPages" :total="purchasePag.total"
          @update:page="(p: number) => { purchasePag.page = p; fetchPurchases() }" />
      </div>
    </div>

    <!-- ── Admin Controls ───────────────────────────────────────────────────── -->
    <div class="card controls-card">
      <div>
        <h2 class="card-title">Admin Controls</h2>
        <p class="card-sub">Execute treasury operations with role-based control</p>
      </div>
      <div class="controls-grid">
        <button v-if="isSuperAdmin" class="ctrl-btn ctrl-mint" @click="mintModal = true">
          <span class="ctrl-icon">&#x1FA99;</span>
          Mint Coins
          <span v-if="pendingMints > 0" class="ctrl-badge">{{ pendingMints }}</span>
        </button>
        <button v-if="isSuperAdmin" class="ctrl-btn ctrl-transfer" @click="transferModal = true">
          <span class="ctrl-icon">&#x21C4;</span>
          Transfer
        </button>
        <button class="ctrl-btn ctrl-credit" @click="creditModal = true">
          <span class="ctrl-icon">&#x2795;</span>
          Credit User
        </button>
        <button class="ctrl-btn ctrl-deduct" @click="deductModal = true">
          <span class="ctrl-icon">&#x2796;</span>
          Deduct User
        </button>
      </div>
    </div>
  </div>

  <!-- ── Modals ───────────────────────────────────────────────────────────── -->
  <Teleport to="body">

    <!-- Request Mint -->
    <div v-if="mintModal" class="modal-overlay" @click.self="mintModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h3>Request Coin Mint</h3>
          <button class="modal-close" @click="mintModal = false">&#x2715;</button>
        </div>
        <div class="approval-notice">
          This creates a <strong>pending request</strong>. A <strong>different</strong> super_admin must approve before any coins are created.
        </div>
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input v-model="mintAmount" type="number" class="form-input" placeholder="e.g. 100000" min="1" />
        </div>
        <div class="form-group">
          <label class="form-label">Reason (required)</label>
          <input v-model="mintReason" type="text" class="form-input" placeholder="e.g. Initial pool, event rewards..." />
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="mintModal = false">Cancel</button>
          <button class="btn-primary" :disabled="mintLoading" @click="submitMintRequest">
            {{ mintLoading ? 'Submitting...' : 'Submit Request' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Transfer -->
    <div v-if="transferModal" class="modal-overlay" @click.self="transferModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h3>Transfer Between Wallets</h3>
          <button class="modal-close" @click="transferModal = false">&#x2715;</button>
        </div>
        <p class="modal-desc">Move coins between system wallets. Fully recorded in ledger.</p>
        <div class="form-row">
          <div class="form-group"><label class="form-label">From</label>
            <select v-model="transferFrom" class="form-input">
              <option value="MASTER">Master</option><option value="RECOVERY">Recovery</option>
              <option value="BONUS">Bonus</option><option value="REVENUE">Revenue</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">To</label>
            <select v-model="transferTo" class="form-input">
              <option value="MASTER">Master</option><option value="RECOVERY">Recovery</option>
              <option value="BONUS">Bonus</option><option value="REVENUE">Revenue</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Amount</label>
          <input v-model="transferAmount" type="number" class="form-input" placeholder="e.g. 5000" min="1" /></div>
        <div class="form-group"><label class="form-label">Reason</label>
          <input v-model="transferReason" type="text" class="form-input" placeholder="e.g. Allocate event bonuses..." /></div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="transferModal = false">Cancel</button>
          <button class="btn-primary btn-blue" :disabled="transferLoading" @click="submitTransfer">{{ transferLoading ? 'Transferring...' : 'Transfer' }}</button>
        </div>
      </div>
    </div>

    <!-- Credit User -->
    <div v-if="creditModal" class="modal-overlay" @click.self="creditModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h3>Credit User from Master Wallet</h3>
          <button class="modal-close" @click="creditModal = false">&#x2715;</button>
        </div>
        <p class="modal-desc">Coins debited from <strong>Master Wallet</strong> and credited to user. Double-entry recorded.</p>
        <div class="form-group"><label class="form-label">User UUID</label>
          <input v-model="creditUserId" type="text" class="form-input" placeholder="Account UUID..." /></div>
        <div class="form-group"><label class="form-label">Amount (coins)</label>
          <input v-model="creditAmount" type="number" class="form-input" placeholder="e.g. 500" min="1" /></div>
        <div class="form-group"><label class="form-label">Reason</label>
          <input v-model="creditReason" type="text" class="form-input" placeholder="e.g. Compensation, event reward..." /></div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="creditModal = false">Cancel</button>
          <button class="btn-primary btn-green" :disabled="creditLoading" @click="submitCredit">{{ creditLoading ? 'Crediting...' : 'Credit User' }}</button>
        </div>
      </div>
    </div>

    <!-- Deduct User -->
    <div v-if="deductModal" class="modal-overlay" @click.self="deductModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h3>Deduct User Coins to Recovery</h3>
          <button class="modal-close" @click="deductModal = false">&#x2715;</button>
        </div>
        <p class="modal-desc">Coins moved from user to <strong>Recovery Wallet</strong> — never deleted, always traceable.</p>
        <div class="form-group"><label class="form-label">User UUID</label>
          <input v-model="deductUserId" type="text" class="form-input" placeholder="Account UUID..." /></div>
        <div class="form-group"><label class="form-label">Amount (coins)</label>
          <input v-model="deductAmount" type="number" class="form-input" placeholder="e.g. 200" min="1" /></div>
        <div class="form-group"><label class="form-label">Reason</label>
          <input v-model="deductReason" type="text" class="form-input" placeholder="e.g. Fraud penalty..." /></div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="deductModal = false">Cancel</button>
          <button class="btn-primary btn-red" :disabled="deductLoading" @click="submitDeduct">{{ deductLoading ? 'Deducting...' : 'Deduct to Recovery' }}</button>
        </div>
      </div>
    </div>

    <!-- Reversal -->
    <div v-if="reverseModal" class="modal-overlay" @click.self="reverseModal = false">
      <div class="modal-box">
        <div class="modal-head">
          <h3>Reverse Transaction</h3>
          <button class="modal-close" @click="reverseModal = false">&#x2715;</button>
        </div>
        <div v-if="reverseTx" class="rev-summary">
          <div class="rev-row"><span class="rev-label">Type</span><span :class="['pill-tx', txBadgeClass(reverseTx.txType)]">{{ reverseTx.txType }}</span></div>
          <div class="rev-row"><span class="rev-label">Amount</span><span class="rev-val">{{ fmtCoins(reverseTx.amount) }} coins</span></div>
          <div class="rev-row"><span class="rev-label">Flow</span><span class="rev-val">{{ reverseTx.fromWallet ?? '—' }} → {{ reverseTx.toWallet ?? '—' }}</span></div>
          <div class="rev-row" v-if="reverseTx.targetUserId"><span class="rev-label">User</span><span class="rev-val mono">{{ reverseTx.targetUserId.slice(0,8) }}...</span></div>
        </div>
        <div class="reversal-notice">A counter-entry will be created. The original transaction is marked as <strong>reversed</strong>.</div>
        <div class="form-group"><label class="form-label">Reason for reversal</label>
          <input v-model="reverseReason" type="text" class="form-input" placeholder="e.g. Fraud confirmed, user dispute..." /></div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="reverseModal = false">Cancel</button>
          <button class="btn-primary btn-red" :disabled="reverseLoading" @click="submitReverse">{{ reverseLoading ? 'Reversing...' : 'Confirm Reversal' }}</button>
        </div>
      </div>
    </div>

  </Teleport>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────────── */
.page { display: flex; flex-direction: column; gap: 24px; }

/* ── KPI Row ────────────────────────────────────────────────────────────────── */
.kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px)  { .kpi-row { grid-template-columns: 1fr 1fr; } }

.kpi-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px; }
.kpi-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.kpi-icon { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.kpi-violet  { background: #ede9fe; }
.kpi-blue    { background: #dbeafe; }
.kpi-emerald { background: #dcfce7; }
.kpi-amber   { background: #fef3c7; }
.kpi-sky     { background: #e0f2fe; }
.kpi-label { font-size: 13px; color: var(--text-muted); margin: 0 0 4px; }
.kpi-value { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.5px; }

/* ── Cards ──────────────────────────────────────────────────────────────────── */
.card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; overflow: hidden; }
.card-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px; }
.card-title { font-size: 17px; font-weight: 600; color: var(--text-primary); margin: 0 0 2px; }
.card-sub { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.5; }
.card-loading { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }
.card-empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* ── Main Grid (Wallets + Circulation) ──────────────────────────────────────── */
.main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
@media (max-width: 960px) { .main-grid { grid-template-columns: 1fr; } }

.wallet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 0 24px 24px; }
@media (max-width: 640px) { .wallet-grid { grid-template-columns: 1fr; } }

.wallet-tile { border-radius: 16px; padding: 20px; border: 1px solid; }
.wc-violet  { background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-color: #c4b5fd; }
.wc-amber   { background: linear-gradient(135deg, #fffbeb, #fef3c7); border-color: #fcd34d; }
.wc-emerald { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-color: #86efac; }
.wc-sky     { background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-color: #7dd3fc; }

.wt-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.wt-name { font-size: 13px; font-weight: 600; color: #475569; margin: 0; }
.wt-status { background: #dcfce7; color: #166534; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 20px; }
.wt-balance { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; letter-spacing: -0.5px; word-break: break-all; }
.wt-sub { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; }
.wt-in { color: #16a34a; }
.wt-out { color: #dc2626; }

/* ── Right Stack ────────────────────────────────────────────────────────────── */
.right-stack { display: flex; flex-direction: column; gap: 16px; }

.circ-card { padding: 20px 24px; }
.circ-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.circ-item { background: var(--content-bg); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.circ-value { font-size: 18px; font-weight: 700; }
.circ-label { font-size: 11px; color: var(--text-muted); }
.cv-minted   { color: #7B4FFF; }
.cv-issued   { color: #0ea5e9; }
.cv-active   { color: #22C97A; }
.cv-recovery { color: #E8A020; }
.cv-bonus    { color: #4ade80; }
.cv-revenue  { color: #60a5fa; }

/* ── Alert Card ──────────────────────────────────────────────────────────────── */
.alert-card { display: flex; align-items: center; gap: 14px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 16px; padding: 16px 20px; }
.alert-icon { font-size: 24px; flex-shrink: 0; }
.alert-title { font-size: 14px; font-weight: 600; color: #991b1b; margin: 0; }
.alert-sub { font-size: 12px; color: #b91c1c; margin: 2px 0 0; }
.btn-alert { margin-left: auto; }

/* ── Mint Panel ──────────────────────────────────────────────────────────────── */
.mint-panel { border: 2px solid #f59e0b; }
.mint-panel-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 24px; background: #fffbeb; border-bottom: 1px solid #fde68a; flex-wrap: wrap; gap: 12px; }
.tab-row { display: flex; gap: 6px; }
.tab-btn { padding: 6px 14px; border: 1px solid #fcd34d; border-radius: 8px; font-size: 12px; font-weight: 600; background: transparent; color: #78350f; cursor: pointer; }
.tab-active { background: #f59e0b; color: #fff; border-color: #f59e0b; }
.mint-list { display: flex; flex-direction: column; }
.mint-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; border-bottom: 1px solid var(--card-border); flex-wrap: wrap; }
.mint-left { display: flex; flex-direction: column; gap: 3px; }
.mint-amount { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.mint-reason { font-size: 13px; color: var(--text-muted); }
.mint-meta { font-size: 11px; color: var(--text-muted); }
.mint-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.reject-text { font-size: 11px; color: #991b1b; }

/* ── Transactions Card ──────────────────────────────────────────────────────── */
.tx-card { padding: 0; }
.tx-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--card-border); flex-wrap: wrap; gap: 12px; }
.tx-filters { display: flex; gap: 8px; }
.sel { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 10px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; cursor: pointer; }
.tx-table-wrap { overflow-x: auto; }
.tx-table { width: 100%; min-width: 900px; border-collapse: collapse; }
.tx-table thead { background: #F8FAFC; }
.tx-table th { padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
.tx-table td { padding: 10px 14px; font-size: 12px; border-top: 1px solid #F1F5F9; }
.row-faded td { opacity: 0.5; }

.td-amount { font-weight: 700; color: var(--text-primary); white-space: nowrap; }
.td-flow { display: flex; align-items: center; gap: 4px; }
.flow-from { color: #ef4444; font-weight: 600; font-size: 11px; }
.flow-arrow { color: var(--text-muted); font-size: 10px; }
.flow-to { color: #22c97a; font-weight: 600; font-size: 11px; }
.td-bal { font-size: 11px; font-family: monospace; }
.bal-from { color: #ef4444; }
.bal-to { color: #22c97a; }
.td-user { font-family: monospace; font-size: 11px; color: var(--primary); }
.td-reason { color: var(--text-muted); max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-admin { font-family: monospace; font-size: 11px; color: var(--text-muted); }
.td-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.mono { font-family: monospace; font-size: 11px; }
.muted { color: var(--text-muted); }

/* ── Badges / Pills ──────────────────────────────────────────────────────────── */
.pill { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.pill-pending  { background: #fef3c7; color: #92400e; }
.pill-approved { background: #dcfce7; color: #166534; }
.pill-rejected { background: #fee2e2; color: #991b1b; }

.pill-tx { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; white-space: nowrap; text-transform: capitalize; }
.tbadge-mint     { background: #ede9fe; color: #5B2FD4; }
.tbadge-credit   { background: #dcfce7; color: #166534; }
.tbadge-deduct   { background: #fee2e2; color: #991b1b; }
.tbadge-transfer { background: #dbeafe; color: #1e40af; }
.tbadge-reversal { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.tbadge-revenue  { background: #cffafe; color: #164e63; }
.tbadge-bonus    { background: #fef9c3; color: #713f12; }

.pill-status { padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.sb-success { background: #dcfce7; color: #166534; }
.sb-muted   { background: #f3f4f6; color: #6b7280; }
.sb-review  { background: #fef3c7; color: #92400e; }

/* ── Admin Controls ──────────────────────────────────────────────────────────── */
.controls-card { padding: 24px; }
.controls-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
@media (max-width: 768px) { .controls-grid { grid-template-columns: 1fr 1fr; } }

.ctrl-btn { height: 52px; border-radius: 14px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; transition: opacity 0.15s; }
.ctrl-btn:hover { opacity: 0.9; }
.ctrl-icon { font-size: 16px; }
.ctrl-mint     { background: #7B4FFF; color: #fff; }
.ctrl-transfer { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; }
.ctrl-transfer:hover { background: #f8fafc; }
.ctrl-credit   { background: #22c97a; color: #fff; }
.ctrl-deduct   { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.ctrl-deduct:hover { background: #fee2e2; }
.ctrl-badge { position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border-radius: 10px; font-size: 10px; font-weight: 700; padding: 1px 6px; }

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.btn-outline { padding: 8px 16px; border: 1px solid var(--card-border); border-radius: 10px; background: var(--card-bg); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-primary); }
.btn-outline:hover { background: var(--content-bg); }

.btn-sm { padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; }
.btn-approve { background: #22c97a; color: #fff; }
.btn-reject  { background: #ef4444; color: #fff; }

.btn-icon { background: none; border: 1px solid var(--card-border); border-radius: 8px; padding: 4px 8px; font-size: 14px; cursor: pointer; color: var(--text-muted); }
.btn-icon:hover { border-color: var(--primary); color: var(--primary); }

/* ── Modals ─────────────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(6px); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: #fff; border-radius: 16px; width: 500px; max-width: 100%; box-shadow: 0 25px 80px rgba(0,0,0,.25); overflow: hidden; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--card-border); }
.modal-head h3 { margin: 0; font-size: 17px; font-weight: 700; color: var(--text-primary); }
.modal-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 8px; width: 30px; height: 30px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-close:hover { color: #ef4444; border-color: #ef4444; }
.modal-desc { font-size: 13px; color: var(--text-muted); margin: 0; padding: 16px 24px 0; line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px 20px; }

.form-group { display: flex; flex-direction: column; gap: 5px; padding: 0 24px; margin-bottom: 10px; }
.form-group:first-of-type { margin-top: 16px; }
.form-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 40px; padding: 0 14px; border: 1px solid var(--card-border); border-radius: 10px; font-size: 13px; outline: none; background: var(--content-bg); color: var(--text-primary); width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: var(--primary); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 24px; margin-bottom: 10px; }
.form-row .form-group { padding: 0; }

.btn-cancel { padding: 10px 18px; border: 1px solid var(--card-border); border-radius: 10px; background: var(--card-bg); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-primary); }
.btn-primary { padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; color: #fff; background: #7B4FFF; }
.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-blue  { background: #0ea5e9; }
.btn-green { background: #22c97a; }
.btn-red   { background: #ef4444; }

.approval-notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #92400e; margin: 16px 24px 8px; line-height: 1.5; }
.rev-summary { background: #f8fafc; border: 1px solid var(--card-border); border-radius: 10px; padding: 14px 16px; margin: 16px 24px 12px; display: flex; flex-direction: column; gap: 8px; }
.rev-row { display: flex; gap: 12px; align-items: center; font-size: 13px; }
.rev-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; min-width: 64px; }
.rev-val { color: var(--text-primary); }
.reversal-notice { background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; font-size: 12px; color: #92400e; margin: 0 24px 8px; }
</style>
