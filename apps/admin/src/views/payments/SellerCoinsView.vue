<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as sellerCoinsApi from '@/api/sellerCoins'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// ── Tab state ─────────────────────────────────────────────────────────────────
const activeTab = ref<'sellers' | 'recharges'>('sellers')

// ── List state ────────────────────────────────────────────────────────────────
const sellers    = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search     = ref('')
const loading    = ref(true)

// Track senior tag status locally (keyed by userId) after assign/remove
const seniorOverride = ref<Record<string, boolean>>({})

async function fetchSellers() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page:  pagination.value.page,
      limit: pagination.value.limit,
    }
    if (search.value) params.search = search.value
    const result = await sellerCoinsApi.listSellers(params)
    sellers.value   = result.sellers ?? result.data ?? []
    pagination.value = result.pagination ?? pagination.value
    // Reset local overrides when list refreshes
    seniorOverride.value = {}
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchSellers() }

function isSenior(seller: any): boolean {
  if (seller.id in seniorOverride.value) return seniorOverride.value[seller.id]
  // Detect from tags array if present
  if (Array.isArray(seller.tags)) return seller.tags.includes('senior_seller')
  return false
}

// ── Senior tag actions ────────────────────────────────────────────────────────
const tagLoading = ref<string | null>(null)

async function toggleSeniorTag(seller: any) {
  if (tagLoading.value) return
  tagLoading.value = seller.id
  const currently = isSenior(seller)
  try {
    if (currently) {
      await sellerCoinsApi.removeSeniorTag(seller.id)
      seniorOverride.value[seller.id] = false
      toast.success('Senior tag removed')
    } else {
      await sellerCoinsApi.assignSeniorTag(seller.id)
      seniorOverride.value[seller.id] = true
      toast.success('Senior tag assigned')
    }
  } catch (e: any) {
    toast.error('Action failed', e?.message || 'Could not update senior tag')
  }
  tagLoading.value = null
}

// ── Drawer ────────────────────────────────────────────────────────────────────
const drawerOpen    = ref(false)
const drawerSeller  = ref<any>(null)
const drawerLoading = ref(false)

async function openDrawer(seller: any) {
  drawerOpen.value    = true
  drawerLoading.value = true
  drawerSeller.value  = null
  try {
    drawerSeller.value = await sellerCoinsApi.getSellerDetail(seller.id)
  } catch {}
  drawerLoading.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

function levelLabel(level: string | undefined) {
  if (!level) return '—'
  return level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Stored profile rate (decimal 0.05 → 5.00%). */
function fmtProfileRate(v: unknown): string {
  if (v == null) return '0.00%'
  const n =
    typeof v === 'object' && v !== null && 'toNumber' in (v as object)
      ? (v as { toNumber(): number }).toNumber()
      : Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(2)}%`
}

function profileRatesAllZero(p: Record<string, unknown> | undefined): boolean {
  if (!p) return true
  const keys = [
    'totalCommissionRate',
    'giftCommissionRate',
    'incomeRewardRate',
    'giftBonusRate',
  ]
  return keys.every((k) => Number(p[k] ?? 0) === 0)
}

function txCounterpartyLabel(tx: any): string {
  if (!tx.counterparty) return '—'
  const c = tx.counterparty
  const name = c.displayName || c.username || '—'
  const hid = c.hakaId ? ` · ${c.hakaId}` : ''
  return `${name}${hid}`
}

function formatTargetType(t: string | undefined | null): string {
  if (!t) return '—'
  if (t === 'user') return 'User wallet'
  if (t === 'coin_seller') return 'Coin seller'
  return t
}

onMounted(fetchSellers)
watch(() => pagination.value.page, fetchSellers)

// ── Deduct coins ──────────────────────────────────────────────────────────────
const deductModal = ref(false)
const deductCoins = ref('')
const deductReason = ref('')
const deductSaving = ref(false)

async function openDeductModal() {
  deductCoins.value = ''
  deductReason.value = ''
  deductModal.value = true
}

async function submitDeduct() {
  if (!drawerSeller.value || deductSaving.value) return
  const coins = parseInt(deductCoins.value, 10)
  if (!Number.isFinite(coins) || coins <= 0) {
    toast.error('Invalid amount', 'Enter a positive number of coins')
    return
  }
  if (!deductReason.value.trim()) {
    toast.error('Reason required', 'Please enter a reason for this deduction')
    return
  }
  deductSaving.value = true
  try {
    const res = await sellerCoinsApi.deductSellerCoins(drawerSeller.value.id, coins, deductReason.value.trim())
    toast.success('Deducted', `${coins.toLocaleString()} coins removed. New balance: ${res.newAvailableBalance?.toLocaleString?.() ?? res.newAvailableBalance}`)
    deductModal.value = false
    drawerSeller.value = await sellerCoinsApi.getSellerDetail(drawerSeller.value.id)
    await fetchSellers()
  } catch (e: any) {
    toast.error('Deduction failed', e?.message || 'Could not deduct coins')
  } finally {
    deductSaving.value = false
  }
}

// ── Recharge Requests ─────────────────────────────────────────────────────────
const recharges         = ref<any[]>([])
const rechargeLoading   = ref(false)
const rechargeFilter    = ref('')
const rechargeActionId  = ref<string | null>(null)
const rejectModal       = ref<any>(null)
const rejectNotes       = ref('')

async function fetchRecharges() {
  rechargeLoading.value = true
  try {
    recharges.value = await sellerCoinsApi.listRechargeRequests(rechargeFilter.value || undefined)
  } catch (e: any) {
    toast.error('Failed to load recharge requests', e?.message)
  }
  rechargeLoading.value = false
}

async function approveRecharge(req: any) {
  rechargeActionId.value = req.id
  try {
    await sellerCoinsApi.approveRecharge(req.id)
    toast.success('Approved', `${req.coinsToCredit.toLocaleString()} coins credited to seller`)
    await fetchRecharges()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  rechargeActionId.value = null
}

function openRejectModal(req: any) {
  rejectModal.value = req
  rejectNotes.value = ''
}

async function confirmReject() {
  if (!rejectModal.value) return
  const id = rejectModal.value.id
  rejectModal.value = null
  rechargeActionId.value = id
  try {
    await sellerCoinsApi.rejectRecharge(id, rejectNotes.value)
    toast.success('Request rejected')
    await fetchRecharges()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  rechargeActionId.value = null
}

watch(activeTab, (tab) => { if (tab === 'recharges' && recharges.value.length === 0) fetchRecharges() })
</script>

<template>
  <div class="page">
    <!-- Tab switcher -->
    <div class="tabs">
      <button :class="['tab', activeTab === 'sellers' ? 'active' : '']" @click="activeTab = 'sellers'">Sellers</button>
      <button :class="['tab', activeTab === 'recharges' ? 'active' : '']" @click="activeTab = 'recharges'">
        Recharge Requests
        <span v-if="recharges.filter(r => r.status === 'pending').length" class="tab-count">
          {{ recharges.filter(r => r.status === 'pending').length }}
        </span>
      </button>
    </div>

    <!-- ── RECHARGE REQUESTS TAB ── -->
    <div v-if="activeTab === 'recharges'">
      <div class="toolbar">
        <select v-model="rechargeFilter" @change="fetchRecharges()" class="filter-select">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button class="btn-primary" @click="fetchRecharges()">Refresh</button>
      </div>

      <div class="table-card">
        <div v-if="rechargeLoading" class="loading">Loading recharge requests...</div>
        <div v-else-if="recharges.length === 0" class="loading">No recharge requests found.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Seller</th>
              <th>Amount (USD)</th>
              <th>Coins to Credit</th>
              <th>Method</th>
              <th>TX Hash</th>
              <th>Status</th>
              <th>Date</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="req in recharges" :key="req.id">
              <td>
                <div class="cell-name">{{ req.seller?.displayName || '—' }}</div>
                <div class="cell-sub">{{ req.seller?.hakaId || '' }}</div>
              </td>
              <td>${{ Number(req.amountUsd).toFixed(2) }}</td>
              <td class="text-green">{{ req.coinsToCredit.toLocaleString() }} 🪙</td>
              <td>{{ req.paymentMethod }}</td>
              <td class="mono small">{{ req.txHash || '—' }}</td>
              <td>
                <span class="badge" :class="req.status === 'approved' ? 'badge-active' : req.status === 'pending' ? 'badge-suspended' : 'badge-banned'">
                  {{ req.status }}
                </span>
              </td>
              <td class="mono small">{{ new Date(req.createdAt).toLocaleDateString() }}</td>
              <td>
                <RowActionMenu v-if="req.status === 'pending'">
                  <RowActionMenuItem
                    variant="success"
                    :disabled="rechargeActionId === req.id"
                    @click="approveRecharge(req)"
                  >
                    {{ rechargeActionId === req.id ? 'Approving…' : 'Approve' }}
                  </RowActionMenuItem>
                  <RowActionMenuItem
                    variant="danger"
                    :disabled="rechargeActionId === req.id"
                    @click="openRejectModal(req)"
                  >
                    Reject
                  </RowActionMenuItem>
                </RowActionMenu>
                <span v-else class="processed-label">{{ req.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Reject notes modal -->
    <div v-if="rejectModal" class="modal-overlay" @click.self="rejectModal = null">
      <div class="agency-modal" style="width:440px">
        <div class="modal-header">
          <h3>Reject Recharge Request</h3>
          <button class="modal-close" @click="rejectModal = null">✕</button>
        </div>
        <div class="agency-body">
          <p style="font-size:13px;color:var(--text-muted)">
            Rejecting recharge of <strong>{{ rejectModal.coinsToCredit?.toLocaleString() }} coins</strong> for <strong>{{ rejectModal.seller?.displayName }}</strong>.
          </p>
          <textarea v-model="rejectNotes" placeholder="Optional rejection notes..." rows="3"
            style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--card-border);background:var(--card-bg);color:var(--text-primary);font-size:13px;resize:vertical" />
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn-ghost" @click="rejectModal = null">Cancel</button>
            <button class="btn-sm btn-danger" @click="confirmReject()">Confirm Reject</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── SELLERS TAB ── -->
    <div v-if="activeTab === 'sellers'">

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="search"
          placeholder="Search by username or Haka ID..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <button class="btn-primary" @click="handleSearch">Search</button>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading sellers...</div>
      <div v-else-if="sellers.length === 0" class="loading">No sellers found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Seller</th>
            <th>Available Balance</th>
            <th>Total Sold</th>
            <th>Level</th>
            <th>Senior Tag</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="seller in sellers" :key="seller.id">
            <td>
              <div class="cell-name">{{ seller.displayName || seller.username || '—' }}</div>
              <div class="cell-sub">{{ seller.hakaId || '' }}</div>
            </td>
            <td>{{ (seller.coinBalance ?? 0).toLocaleString() }} 🪙</td>
            <td>{{ (seller.totalSold ?? 0).toLocaleString() }}</td>
            <td>{{ levelLabel(seller.level) }}</td>
            <td>
              <span v-if="isSenior(seller)" class="badge badge-senior">Senior</span>
              <span v-else class="badge badge-none">—</span>
            </td>
            <td class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem @click="openDrawer(seller)">View</RowActionMenuItem>
                <RowActionMenuItem
                  :variant="isSenior(seller) ? 'danger' : 'warning'"
                  :disabled="tagLoading === seller.id"
                  @click="toggleSeniorTag(seller)"
                >
                  {{ tagLoading === seller.id ? '…' : isSenior(seller) ? 'Remove Senior Tag' : 'Give Senior Tag' }}
                </RowActionMenuItem>
              </RowActionMenu>
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
      @update:page="(p: number) => { pagination.page = p; fetchSellers() }"
    />

    <!-- Detail Drawer -->
    <div v-if="drawerOpen" class="modal-overlay" @click.self="drawerOpen = false">
      <div class="agency-modal">
        <div class="modal-header">
          <h3>{{ drawerSeller?.displayName || drawerSeller?.username || 'Seller Detail' }}</h3>
          <button class="modal-close" @click="drawerOpen = false">✕</button>
        </div>

        <div v-if="drawerLoading" class="loading">Loading...</div>
        <template v-else-if="drawerSeller">
          <div class="agency-body">
            <!-- Seller heading -->
            <div class="owner-card">
              <div class="owner-name">{{ drawerSeller.displayName || drawerSeller.username || '—' }}</div>
              <div class="owner-meta">
                <span>{{ drawerSeller.hakaId || '' }}</span>
                <span v-if="drawerSeller.phone">{{ drawerSeller.phone }}</span>
              </div>
            </div>

            <!-- Profile stats -->
            <div class="section-title">Profile Stats</div>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-label">Available Balance</div>
                <div class="stat-value">{{ (drawerSeller.coinSellerProfile?.availableBalance ?? drawerSeller.coinBalance ?? 0).toLocaleString() }} 🪙</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Balance</div>
                <div class="stat-value">{{ (drawerSeller.coinSellerProfile?.totalBalance ?? drawerSeller.totalBalance ?? 0).toLocaleString() }} 🪙</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Security Deposit</div>
                <div class="stat-value">{{ (drawerSeller.coinSellerProfile?.securityDeposit ?? drawerSeller.securityDeposit ?? 0).toLocaleString() }} 🪙</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Sold</div>
                <div class="stat-value">{{ (drawerSeller.coinSellerProfile?.totalCoinsSold ?? drawerSeller.totalSold ?? 0).toLocaleString() }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Customers</div>
                <div class="stat-value">{{ (drawerSeller.coinSellerProfile?.totalCustomers ?? drawerSeller.totalCustomers ?? 0).toLocaleString() }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Level</div>
                <div class="stat-value">{{ levelLabel(drawerSeller.coinSellerProfile?.sellerLevel ?? drawerSeller.level) }}</div>
              </div>
            </div>

            <div class="section-title">Gift commission rates (profile)</div>
            <p class="rates-hint">
              Auto-synced from tier ladder when fields are 0. Non-zero values are admin overrides.
            </p>
            <div
              v-if="profileRatesAllZero(drawerSeller.coinSellerProfile)"
              class="rates-warn"
            >
              All rates are 0 — set tier rules or admin overrides for gift commissions.
            </div>
            <div class="stat-grid rates-grid">
              <div class="stat-card">
                <div class="stat-label">Total commission</div>
                <div class="stat-value">{{ fmtProfileRate(drawerSeller.coinSellerProfile?.totalCommissionRate) }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Gift commission</div>
                <div class="stat-value">{{ fmtProfileRate(drawerSeller.coinSellerProfile?.giftCommissionRate) }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Income reward</div>
                <div class="stat-value">{{ fmtProfileRate(drawerSeller.coinSellerProfile?.incomeRewardRate) }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Gift bonus</div>
                <div class="stat-value">{{ fmtProfileRate(drawerSeller.coinSellerProfile?.giftBonusRate) }}</div>
              </div>
            </div>

            <div class="drawer-actions">
              <button class="btn btn-danger" type="button" @click="openDeductModal">
                Deduct Coins
              </button>
            </div>

            <!-- Recharge Records -->
            <div class="section-title">Recharge Records</div>
            <div v-if="!drawerSeller.rechargeRequests?.length" class="empty-text">No recharge records.</div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>USD</th>
                  <th>Coins</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rec in drawerSeller.rechargeRequests" :key="rec.id">
                  <td>${{ Number(rec.amountUsd ?? 0).toFixed(2) }}</td>
                  <td>{{ (rec.coinsToCredit ?? 0).toLocaleString() }} 🪙</td>
                  <td>
                    <span class="badge" :class="rec.status === 'approved' ? 'badge-active' : rec.status === 'pending' ? 'badge-suspended' : 'badge-banned'">
                      {{ rec.status || '—' }}
                    </span>
                  </td>
                  <td>{{ formatDate(rec.createdAt) }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Seller Transactions -->
            <div class="section-title">Seller Transactions</div>
            <div v-if="!drawerSeller.sellerTransactions?.length" class="empty-text">No transactions.</div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>To / counterparty</th>
                  <th>Target</th>
                  <th>Notes</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tx in drawerSeller.sellerTransactions" :key="tx.id">
                  <td :class="tx.transactionType !== 'transfer' ? 'text-green' : 'text-red'">
                    {{ tx.transactionType !== 'transfer' ? '+' : '-' }}{{ (tx.coinsAmount ?? 0).toLocaleString() }}
                  </td>
                  <td>{{ tx.transactionType || tx.type || '—' }}</td>
                  <td class="small">{{ txCounterpartyLabel(tx) }}</td>
                  <td class="small">{{ formatTargetType(tx.targetType) }}</td>
                  <td class="small mono">{{ (tx.notes || tx.operatorName || '—') }}</td>
                  <td>{{ formatDate(tx.createdAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>

    </div> <!-- end sellers tab -->

    <!-- Deduct coins modal -->
    <div v-if="deductModal" class="modal-overlay" @click.self="deductModal = false">
      <div class="modal-box">
        <h3>Deduct Coins — {{ drawerSeller?.displayName }}</h3>
        <p class="modal-sub">Removes coins from seller offline balance (availableBalance only).</p>
        <label class="form-label">Coins to deduct</label>
        <input v-model="deductCoins" type="number" min="1" class="form-input" placeholder="Amount" />
        <label class="form-label">Reason (required)</label>
        <textarea v-model="deductReason" class="form-input" rows="3" placeholder="Reason for audit log" />
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" @click="deductModal = false">Cancel</button>
          <button class="btn btn-danger" type="button" :disabled="deductSaving" @click="submitDeduct">
            {{ deductSaving ? 'Deducting…' : 'Confirm Deduct' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toolbar-left  { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; min-width: 200px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-primary); font-size: 13px; }
.stat-pill { background: var(--card-bg); border: 1px solid var(--card-border); padding: 6px 12px; border-radius: 20px; font-size: 12px; color: var(--text-muted); }

/* Table */
.table-card { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--card-border); overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--card-border); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--card-border); color: var(--text-primary); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.cell-name { font-weight: 600; }
.cell-sub  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }

/* Badges */
.badge          { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-active   { background: #22c97a22; color: #22c97a; }
.badge-suspended { background: #e8a02022; color: #e8a020; }
.badge-banned   { background: #ff4d4d22; color: #ff4d4d; }
.badge-senior   { background: #7b4fff22; color: #9d7fff; }
.badge-none     { background: transparent; color: var(--text-muted); }

/* Buttons */
.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost   { padding: 8px 16px; background: none; color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-sm      { padding: 5px 10px; background: #F8FAFC; color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-sm:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-warn    { background: #e8a02022; color: #e8a020; border-color: #e8a02040; }
.btn-danger  { background: #ff4d4d22; color: #ff4d4d; border-color: #ff4d4d40; }
.action-row  { display: flex; gap: 6px; }

/* Agency Detail Modal */
.agency-modal { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 680px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.agency-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex: 1; }

/* Stat grid */
.stat-grid  { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.stat-card  { background: #F8FAFC; border-radius: 10px; padding: 16px; text-align: center; }
.stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
.stat-value { font-size: 18px; font-weight: 700; color: var(--text-primary); }

/* Owner card */
.owner-card { background: #F8FAFC; border-radius: 10px; padding: 14px; }
.owner-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.owner-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }

/* Section title */
.section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding-top: 4px; }
.rates-hint { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.rates-warn { font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 12px; }
.rates-grid { margin-bottom: 4px; }
.empty-text    { font-size: 13px; color: var(--text-muted); padding: 8px 0; }
.drawer-actions { display: flex; gap: 8px; margin: 8px 0 16px; }
.modal-box { background: var(--card-bg); border-radius: 12px; padding: 24px; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 10px; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.form-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.form-input { padding: 8px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 14px; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal-header  { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.modal-close   { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; }

/* Colors */
.text-green { color: #22c97a; }
.text-red   { color: #ff4d4d; }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--card-border); padding-bottom: 0; }
.tab { padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 6px; }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab-count { background: #ff4d4d; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 99px; }

/* Filter */
.filter-select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-primary); font-size: 13px; }

/* Success button */
.btn-success-sm { background: #22c97a22; color: #22c97a; border-color: #22c97a40; }
.processed-label { font-size: 12px; color: var(--text-muted); text-transform: capitalize; }
.mono  { font-family: monospace; }
.small { font-size: 11px; }
</style>
