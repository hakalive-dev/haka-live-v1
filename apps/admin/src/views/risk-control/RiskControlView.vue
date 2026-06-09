<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as riskApi from '@/api/riskControl'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const router  = useRouter()
const auth    = useAuthStore()
const toast   = useToastStore()

const risks   = ref<any[]>([])
const stats   = ref<any>({ total: 0, critical: 0, high: 0, medium: 0, low: 0 })
const loading = ref(true)
const total   = ref(0)
const page    = ref(1)
const limit   = 20

const filterStatus   = ref<'active' | 'released' | 'all'>('active')
const filterSeverity = ref('')
const searchQ        = ref('')

// Release confirm
const releaseConfirm  = ref<any>(null)
const releaseLoading  = ref(false)

async function fetchStats() {
  try { stats.value = await riskApi.getRiskStats() } catch {}
}

async function fetchRisks() {
  loading.value = true
  try {
    const res = await riskApi.listRisks({
      page: page.value,
      limit,
      status:   filterStatus.value,
      severity: filterSeverity.value || undefined,
      search:   searchQ.value || undefined,
    })
    risks.value = res.risks
    total.value = res.total
  } catch {}
  loading.value = false
}

function applyFilters() {
  page.value = 1
  fetchRisks()
}

async function confirmRelease() {
  if (!releaseConfirm.value) return
  releaseLoading.value = true
  try {
    await riskApi.releaseRisk(releaseConfirm.value.userId)
    toast.success('Risk Control Released', `${releaseConfirm.value.user?.displayName} can now transact normally.`)
    releaseConfirm.value = null
    await Promise.all([fetchStats(), fetchRisks()])
  } catch (e: any) { toast.error('Release Failed', e?.message) }
  releaseLoading.value = false
}

function severityClass(s: string) {
  const m: Record<string, string> = { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }
  return m[s] || 'sev-low'
}

function reasonLabel(r: string) {
  const m: Record<string, string> = {
    fraud_activity: 'Fraud Activity',
    suspicious_transactions: 'Suspicious Txns',
    multiple_accounts: 'Multiple Accounts',
    chargeback: 'Chargeback',
    manual_review: 'Manual Review',
  }
  return m[r] || r
}

function fmtExpiry(d: string | null) {
  if (!d) return 'Permanent'
  const dt = new Date(d)
  if (dt < new Date()) return 'Expired'
  return dt.toLocaleDateString()
}

function frozenIcons(risk: any) {
  const icons: string[] = []
  if (risk.freezeCoins)  icons.push('🪙 Coins')
  if (risk.freezeBeans)  icons.push('🫘 Beans')
  if (risk.disableGames) icons.push('🎮 Games')
  if (risk.disableGifts) icons.push('🎁 Gifts')
  if (risk.blockChat)    icons.push('💬 Chat')
  return icons
}

const pages = () => Math.ceil(total.value / limit)

onMounted(() => { fetchStats(); fetchRisks() })
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">⚠️ Risk Control</h2>
    </div>

    <!-- Stats cards -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-val">{{ stats.total }}</div>
        <div class="stat-label">Total Flagged</div>
      </div>
      <div class="stat-card critical">
        <div class="stat-val">{{ stats.critical }}</div>
        <div class="stat-label">🚨 Critical</div>
      </div>
      <div class="stat-card high">
        <div class="stat-val">{{ stats.high }}</div>
        <div class="stat-label">🔴 High</div>
      </div>
      <div class="stat-card medium">
        <div class="stat-val">{{ stats.medium }}</div>
        <div class="stat-label">🟡 Medium</div>
      </div>
      <div class="stat-card low">
        <div class="stat-val">{{ stats.low }}</div>
        <div class="stat-label">🟢 Low</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <input v-model="searchQ" class="filter-input" placeholder="Search by name, Haka ID…" @keydown.enter="applyFilters" />
      <select v-model="filterStatus" class="filter-select" @change="applyFilters">
        <option value="active">Active</option>
        <option value="released">Released</option>
        <option value="all">All</option>
      </select>
      <select v-model="filterSeverity" class="filter-select" @change="applyFilters">
        <option value="">All Severities</option>
        <option value="critical">🚨 Critical</option>
        <option value="high">🔴 High</option>
        <option value="medium">🟡 Medium</option>
        <option value="low">🟢 Low</option>
      </select>
      <button class="btn btn-primary" @click="applyFilters">Search</button>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Severity</th>
            <th>Reason</th>
            <th>Frozen Controls</th>
            <th>Applied</th>
            <th>Expires</th>
            <th>Status</th>
            <th v-if="auth.hasPermission('risk.manage')" class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="risks.length === 0">
            <td colspan="8" class="empty-cell">No flagged accounts found</td>
          </tr>
          <tr v-for="risk in risks" :key="risk.id">
            <td>
              <div class="user-cell" @click="router.push(`/users/${risk.userId}`)" style="cursor:pointer">
                <div class="user-avatar">{{ risk.user?.displayName?.charAt(0) || '?' }}</div>
                <div>
                  <div class="fw">{{ risk.user?.displayName }}</div>
                  <div class="dim">{{ risk.user?.hakaId || risk.user?.username || '—' }}</div>
                </div>
              </div>
            </td>
            <td><span :class="['sev-badge', severityClass(risk.severity)]">{{ risk.severity.toUpperCase() }}</span></td>
            <td class="dim">{{ reasonLabel(risk.reason) }}</td>
            <td>
              <div class="frozen-chips">
                <span v-for="icon in frozenIcons(risk)" :key="icon" class="frozen-chip">{{ icon }}</span>
                <span v-if="frozenIcons(risk).length === 0" class="dim">None</span>
              </div>
            </td>
            <td class="dim">{{ new Date(risk.createdAt).toLocaleDateString() }}</td>
            <td :class="{ 'text-danger': risk.expiresAt && new Date(risk.expiresAt) < new Date() }">
              {{ fmtExpiry(risk.expiresAt) }}
            </td>
            <td>
              <span :class="risk.isActive ? 'chip-active' : 'chip-released'">
                {{ risk.isActive ? 'Active' : 'Released' }}
              </span>
            </td>
            <td v-if="auth.hasPermission('risk.manage')" class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="router.push(`/users/${risk.userId}`)">View</RowActionMenuItem>
                <RowActionMenuItem
                  v-if="risk.isActive"
                  variant="success"
                  @click="releaseConfirm = risk"
                >
                  Release
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="pages() > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="page--; fetchRisks()">‹ Prev</button>
        <span class="page-info">Page {{ page }} of {{ pages() }} · {{ total }} total</span>
        <button class="page-btn" :disabled="page >= pages()" @click="page++; fetchRisks()">Next ›</button>
      </div>
    </div>
  </div>

  <!-- Release confirm modal -->
  <Teleport to="body">
    <div v-if="releaseConfirm" class="modal-overlay" @click.self="releaseConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Release Risk Control</h3>
          <button class="btn-close" @click="releaseConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Remove all restrictions from <strong>{{ releaseConfirm.user?.displayName }}</strong>?<br />
            They will immediately regain full access to coins, beans, gifts, and games.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="releaseConfirm = null">Cancel</button>
          <button class="btn btn-success" :disabled="releaseLoading" @click="confirmRelease">
            {{ releaseLoading ? 'Releasing…' : 'Release Account' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }

.stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.stat-card {
  background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px;
  padding: 16px; text-align: center;
}
.stat-card.critical { border-color: #fca5a5; background: #fff5f5; }
.stat-card.high     { border-color: #fcd34d; background: #fffbeb; }
.stat-card.medium   { border-color: #fde68a; background: #fffbeb; }
.stat-card.low      { border-color: #a7f3d0; background: #f0fdf4; }
.stat-val   { font-size: 28px; font-weight: 700; color: var(--text-primary); }
.stat-label { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

.filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-input  { flex: 1; min-width: 200px; height: 36px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; }
.filter-input:focus { border-color: var(--primary); }
.filter-select { height: 36px; padding: 0 10px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); cursor: pointer; outline: none; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-success  { background: var(--success); color: #fff; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading    { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 14px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.empty-cell { text-align: center; color: var(--text-muted); padding: 40px; }

.user-cell { display: flex; align-items: center; gap: 10px; }
.user-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.fw  { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.text-danger { color: #FF4D4D; font-size: 12px; font-weight: 600; }

.sev-badge { padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; }
.sev-critical { background: #fee2e2; color: #991b1b; }
.sev-high     { background: #fef3c7; color: #92400e; }
.sev-medium   { background: #fef9c3; color: #713f12; }
.sev-low      { background: #dcfce7; color: #14532d; }

.frozen-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.frozen-chip  { padding: 2px 6px; background: #f1f5f9; border-radius: 6px; font-size: 11px; color: var(--text-muted); }

.chip-active   { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; background: #fee2e2; color: #991b1b; }
.chip-released { padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; background: #dcfce7; color: #166534; }

.row-actions { display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; color: var(--text-primary); }
.btn-row.success { color: var(--success); border-color: var(--success); }
.btn-row:hover { background: var(--row-hover); }

.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px; border-top: 1px solid var(--card-border); }
.page-btn  { padding: 6px 12px; border: 1px solid var(--card-border); border-radius: 6px; font-size: 13px; cursor: pointer; background: var(--card-bg); }
.page-btn:disabled { opacity: 0.4; cursor: default; }
.page-info { font-size: 13px; color: var(--text-muted); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.modal-body   { padding: 20px 24px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); line-height: 1.6; }
</style>
