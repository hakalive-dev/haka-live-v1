<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBdDetail, transferAgency, listBds } from '@/api/bd'
import { getTarget, upsertTarget } from '@/api/targets'
import StatCard from '@/components/common/StatCard.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const id = route.params.id as string
const period = ref<'week' | 'month'>('month')
const detail = ref<any>(null)
const targetData = ref<any>(null)
const otherBds = ref<any[]>([])
const loading = ref(true)

const editRevTarget = ref('')
const editOnbTarget = ref(0)
const savingTarget = ref(false)

const transferModal = ref(false)
const transferAgencyId = ref('')
const transferToBdId = ref('')
const transferLoading = ref(false)

const monthStart = computed(() => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
})

function roleLabel(role: string) {
  const map: Record<string, string> = {
    senior_bd: 'Senior BD',
    bd: 'Junior BD',
    bdm: 'BDM',
  }
  return map[role] ?? role
}

function growthClass(pct: number | null) {
  if (pct === null) return ''
  return pct >= 0 ? 'growth-up' : 'growth-down'
}

async function load() {
  loading.value = true
  try {
    detail.value = await getBdDetail(id, period.value)
    targetData.value = await getTarget(id, 'month', monthStart.value)
    if (targetData.value?.target) {
      editRevTarget.value = targetData.value.target.revenueTarget ?? '0'
      editOnbTarget.value = targetData.value.target.onboardTarget ?? 0
    }
  } catch {
    toast.error('Failed to load BD detail')
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function saveTarget() {
  savingTarget.value = true
  try {
    await upsertTarget({
      staffId: id, period: 'month', periodStart: monthStart.value,
      revenueTarget: editRevTarget.value, onboardTarget: editOnbTarget.value,
    })
    toast.success('Target saved')
    await load()
  } catch {
    toast.error('Failed to save target')
  } finally {
    savingTarget.value = false
  }
}

async function openTransfer(agencyId: string) {
  transferAgencyId.value = agencyId
  transferToBdId.value = ''
  const res = await listBds().catch(() => ({ items: [] }))
  otherBds.value = res.items.filter((b: any) => b.id !== id)
  transferModal.value = true
}

async function doTransfer() {
  if (!transferToBdId.value) return
  transferLoading.value = true
  try {
    await transferAgency(transferAgencyId.value, transferToBdId.value)
    toast.success('Agency transferred')
    transferModal.value = false
    await load()
  } catch {
    toast.error('Transfer failed')
  } finally {
    transferLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-if="loading" class="page">
    <div class="loading">Loading BD details…</div>
  </div>

  <div v-else-if="!detail" class="page">
    <div class="empty-state">
      <p>BD not found.</p>
      <button class="btn btn-secondary" @click="router.push('/bd')">Back to BD list</button>
    </div>
  </div>

  <div v-else class="page">
    <div class="toolbar">
      <div class="header-left">
        <button class="btn-back" @click="router.push('/bd')">← Back</button>
        <div>
          <h2 class="page-title">{{ detail.displayName }}</h2>
          <div class="page-sub">{{ detail.email }}</div>
        </div>
        <span class="role-pill">{{ roleLabel(detail.role) }}</span>
      </div>
      <div class="period-tabs">
        <button
          :class="['ptab', period === 'month' ? 'ptab-active' : '']"
          @click="period = 'month'; load()"
        >This Month</button>
        <button
          :class="['ptab', period === 'week' ? 'ptab-active' : '']"
          @click="period = 'week'; load()"
        >This Week</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-wrap">
        <StatCard title="Revenue" :value="detail.metrics.revenue" icon="💰" color="var(--primary)" />
        <div
          v-if="detail.metrics.revenueGrowthPct !== null"
          :class="['growth-line', growthClass(detail.metrics.revenueGrowthPct)]"
        >
          {{ detail.metrics.revenueGrowthPct > 0 ? '+' : '' }}{{ detail.metrics.revenueGrowthPct }}% vs prior period
        </div>
      </div>
      <StatCard title="Turnover (coins)" :value="detail.metrics.turnover" icon="🪙" />
      <StatCard title="Receiving (beans)" :value="detail.metrics.receiving" icon="🫘" color="var(--success)" />
      <div class="stat-wrap">
        <StatCard title="Agencies" :value="detail.metrics.agencyCount" icon="🏢" />
        <div class="growth-line dim">+{{ detail.metrics.newAgencies }} new</div>
      </div>
    </div>

    <div v-if="targetData" class="section-card">
      <h3 class="section-title">Monthly Targets</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Revenue Target</label>
          <input v-model="editRevTarget" class="form-input" placeholder="0" />
          <div class="hint">
            Actual: {{ targetData.actual.revenue }}
            <span v-if="targetData.attainment.revenuePct !== null">({{ targetData.attainment.revenuePct }}%)</span>
          </div>
        </div>
        <div class="form-group">
          <label>Onboard Target</label>
          <input v-model.number="editOnbTarget" type="number" class="form-input" placeholder="0" />
          <div class="hint">
            Actual: {{ targetData.actual.onboard }}
            <span v-if="targetData.attainment.onboardPct !== null">({{ targetData.attainment.onboardPct }}%)</span>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" :disabled="savingTarget" @click="saveTarget">
        {{ savingTarget ? 'Saving…' : 'Save Target' }}
      </button>
    </div>

    <div v-if="detail.regionalExpansion && Object.keys(detail.regionalExpansion).length" class="section-card">
      <h3 class="section-title">Regional Expansion</h3>
      <div class="chip-row">
        <span
          v-for="(count, region) in detail.regionalExpansion"
          :key="region"
          class="region-chip"
        >{{ region }}: {{ count }}</span>
      </div>
    </div>

    <div class="table-card">
      <div class="card-header">
        <h3 class="section-title">Agencies</h3>
        <span class="card-sub">{{ detail.agencies?.length ?? 0 }} total</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Region</th>
            <th>Status</th>
            <th>Revenue</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in detail.agencies" :key="a.id">
            <td class="fw">{{ a.name }}</td>
            <td class="dim">{{ a.region ?? '—' }}</td>
            <td><span class="status-chip">{{ a.status }}</span></td>
            <td class="mono">{{ a.revenue }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openTransfer(a.id)">Transfer</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="!detail.agencies?.length">
            <td colspan="5" class="empty">No agencies assigned.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="transferModal" class="modal-overlay" @click.self="transferModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Transfer Agency to BD</h3>
          <button class="btn-close" @click="transferModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Select BD</label>
            <select v-model="transferToBdId" class="form-input">
              <option value="">Select BD…</option>
              <option v-for="b in otherBds" :key="b.id" :value="b.id">
                {{ b.displayName }} ({{ b.region ?? 'no region' }})
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="transferModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="!transferToBdId || transferLoading" @click="doTransfer">
            {{ transferLoading ? 'Transferring…' : 'Transfer' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.empty-state { padding: 40px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 12px; }

.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.page-sub { margin-top: 2px; font-size: 13px; color: var(--text-muted); }
.btn-back { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; padding: 0; }
.btn-back:hover { color: var(--primary); }

.role-pill { background: var(--primary-soft); color: var(--primary); padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }

.period-tabs { display: flex; gap: 4px; background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 3px; }
.ptab { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; border: none; background: transparent; color: var(--text-muted); cursor: pointer; }
.ptab-active { background: var(--card-bg); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,.08); }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-wrap { display: flex; flex-direction: column; gap: 4px; }
.growth-line { font-size: 11px; padding-left: 4px; }
.growth-up { color: var(--success); }
.growth-down { color: var(--danger); }
.dim { color: var(--text-muted); }

.section-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-title { margin: 0; font-size: 16px; font-weight: 600; }

.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.region-chip {
  background: var(--info-soft);
  color: var(--info);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.card-header { display: flex; align-items: baseline; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--card-border); }
.card-sub { font-size: 12px; color: var(--text-muted); }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }
.status-chip { background: #F1F5F9; color: var(--text-primary); padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; align-self: flex-start; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-secondary:hover { background: var(--row-hover); }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.hint { font-size: 12px; color: var(--text-muted); }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
select.form-input { cursor: pointer; }

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .form-row { grid-template-columns: 1fr; }
}
</style>
