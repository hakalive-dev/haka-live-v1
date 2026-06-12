<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import * as api from '@/api/luckyGifts'
import GiftsSubnav from '@/components/gifts/GiftsSubnav.vue'
import Pagination from '@/components/common/Pagination.vue'

const loading = ref(true)
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

const setting = ref<api.LuckySettingDTO | null>(null)
const stats = ref<api.LuckyStatsDTO | null>(null)

const enabled = ref(true)
const winProbabilityPct = ref('20')
const winMultiplierTiers = ref<Array<{ multiplier: string; weight: string }>>([
  { multiplier: '2', weight: '50' },
  { multiplier: '3', weight: '25' },
  { multiplier: '5', weight: '15' },
  { multiplier: '10', weight: '7' },
  { multiplier: '50', weight: '2' },
  { multiplier: '100', weight: '1' },
])
const receiverBenefitPercent = ref('1.5')
const dailyUserWinCapCoins = ref('0')

const previewWinProb = computed(() => parseFloat(winProbabilityPct.value) / 100)
const previewTiers = computed(() =>
  winMultiplierTiers.value
    .map((tier) => ({
      multiplier: parseFloat(tier.multiplier),
      weight: parseFloat(tier.weight),
    }))
    .filter((tier) => Number.isFinite(tier.multiplier) && tier.multiplier > 0 && Number.isFinite(tier.weight) && tier.weight > 0),
)
const previewMultiplier = computed(() => {
  const tiers = previewTiers.value
  if (tiers.length === 0) return NaN
  const totalWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0)
  return tiers.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) / totalWeight
})
const previewReceiverPct = computed(() => parseFloat(receiverBenefitPercent.value))

const previewTrp = computed(() => {
  const p = previewWinProb.value
  const m = previewMultiplier.value
  if (!Number.isFinite(p) || !Number.isFinite(m)) return null
  return p * m
})

const previewTotalPayout = computed(() => {
  const trp = previewTrp.value
  const r = previewReceiverPct.value
  if (trp == null || !Number.isFinite(r)) return null
  return trp + r / 100
})

const trpTooHigh = computed(() => previewTrp.value != null && previewTrp.value >= 1)

const exampleStake = 100
const exampleWinPayout = computed(() => {
  const m = previewMultiplier.value
  if (!Number.isFinite(m)) return '—'
  return Math.round(exampleStake * m).toLocaleString()
})

const exampleHostBeans = computed(() => {
  const r = previewReceiverPct.value
  if (!Number.isFinite(r)) return '—'
  return Math.round((exampleStake * r) / 100).toLocaleString()
})

const draws = ref<api.LuckyDrawDTO[]>([])
const drawsTotal = ref(0)
const drawsPage = ref(1)
const drawsLimit = 25
const drawsLoading = ref(false)
const winFilter = ref<'all' | 'wins' | 'losses'>('all')

const drawsTotalPages = computed(() =>
  Math.max(1, Math.ceil(drawsTotal.value / drawsLimit)),
)

function fmtPct(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—'
  return (n * 100).toFixed(digits) + '%'
}

function fmtCoins(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

function applySettingToForm(s: api.LuckySettingDTO) {
  enabled.value = s.enabled
  winProbabilityPct.value = (s.winProbability * 100).toFixed(2).replace(/\.?0+$/, '')
  winMultiplierTiers.value = (s.winMultiplierTiers.length > 0 ? s.winMultiplierTiers : [{ multiplier: s.winMultiplier, weight: 1 }]).map(
    (tier) => ({
      multiplier: String(tier.multiplier),
      weight: String(tier.weight),
    }),
  )
  receiverBenefitPercent.value = String(s.receiverBenefitPercent)
  dailyUserWinCapCoins.value = s.dailyUserWinCapCoins
}

function addMultiplierTier() {
  winMultiplierTiers.value.push({ multiplier: '2', weight: '1' })
}

function removeMultiplierTier(index: number) {
  if (winMultiplierTiers.value.length <= 1) return
  winMultiplierTiers.value.splice(index, 1)
}

async function fetchSetting() {
  setting.value = await api.getLuckySetting()
  applySettingToForm(setting.value)
}

async function fetchStats() {
  stats.value = await api.getLuckyStats()
}

async function fetchDraws() {
  drawsLoading.value = true
  try {
    const params: { page: number; limit: number; isWin?: boolean } = {
      page: drawsPage.value,
      limit: drawsLimit,
    }
    if (winFilter.value === 'wins') params.isWin = true
    if (winFilter.value === 'losses') params.isWin = false
    const page = await api.listLuckyDraws(params)
    draws.value = page.items
    drawsTotal.value = page.total
  } catch {
    draws.value = []
    drawsTotal.value = 0
  }
  drawsLoading.value = false
}

async function refreshAll() {
  loading.value = true
  saveError.value = ''
  try {
    await Promise.all([fetchSetting(), fetchStats(), fetchDraws()])
  } catch {
    saveError.value = 'Failed to load lucky gift settings.'
  }
  loading.value = false
}

async function saveSetting() {
  saveError.value = ''
  saved.value = false

  const winProbability = parseFloat(winProbabilityPct.value) / 100
  const tiers = previewTiers.value
  const receiverPct = parseFloat(receiverBenefitPercent.value)
  const averageMultiplier = previewMultiplier.value

  if (!Number.isFinite(winProbability) || winProbability < 0 || winProbability > 1) {
    saveError.value = 'Win probability must be between 0% and 100%.'
    return
  }
  if (tiers.length === 0 || !Number.isFinite(averageMultiplier) || averageMultiplier <= 0) {
    saveError.value = 'Add at least one payout tier with multiplier and weight > 0.'
    return
  }
  if (!Number.isFinite(receiverPct) || receiverPct < 0 || receiverPct > 1.5) {
    saveError.value = 'Host benefit must be between 0% and 1.5%.'
    return
  }
  if (!/^\d+$/.test(dailyUserWinCapCoins.value.trim())) {
    saveError.value = 'Daily win cap must be a whole number (0 = no cap).'
    return
  }
  if (winProbability * averageMultiplier >= 1) {
    saveError.value = 'TRP (win % × average multiplier) must stay below 100% for a house edge.'
    return
  }

  saving.value = true
  try {
    setting.value = await api.updateLuckySetting({
      enabled: enabled.value,
      winProbability,
      winMultiplierTiers: tiers,
      receiverBenefitPercent: receiverPct,
      dailyUserWinCapCoins: dailyUserWinCapCoins.value.trim(),
    })
    applySettingToForm(setting.value)
    saved.value = true
    await fetchStats()
    setTimeout(() => { saved.value = false }, 2500)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Save failed.'
    saveError.value = msg === 'expected_return_too_high'
      ? 'TRP (win % × multiplier) must stay below 100%.'
      : msg
  }
  saving.value = false
}

watch(drawsPage, () => void fetchDraws())
watch(winFilter, () => {
  drawsPage.value = 1
  void fetchDraws()
})

onMounted(() => void refreshAll())
</script>

<template>
  <div class="page">
    <GiftsSubnav />

    <div class="page-header">
      <div>
        <h1 class="page-title">Lucky Gifts</h1>
        <p class="page-sub">
          Configure the lucky-gift game (win chance, payout multiplier, host bean cut).
          Applies to all gifts with category <strong>lucky</strong>. One draw per send;
          combo qty is batched into a single stake.
        </p>
      </div>
      <button type="button" class="btn btn-outline btn-sm" @click="refreshAll">
        Refresh
      </button>
    </div>

    <div v-if="loading" class="loading">Loading…</div>

    <template v-else>
      <!-- ── Game config ─────────────────────────────────────────────────── -->
      <div class="settings-card master-card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Game configuration</h2>
            <p class="card-sub">
              Changes take effect on the next lucky gift send. Cached for ~60s on the API.
            </p>
          </div>
        </div>

        <div class="settings-body">
          <label class="toggle-row">
            <input v-model="enabled" type="checkbox" class="toggle-input" />
            <span class="toggle-text">Lucky draws enabled</span>
          </label>
          <p v-if="!enabled" class="status-note">
            Lucky gifts still send normally but <strong>no win/lose draw</strong> runs until re-enabled.
          </p>

          <div class="form-grid">
            <div class="form-field">
              <label class="form-label">Win probability (%)</label>
              <input
                v-model="winProbabilityPct"
                class="form-input"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 20"
              />
              <span class="field-hint">Chance per send that the sender wins coins back.</span>
            </div>
            <div class="form-field form-field-wide">
              <label class="form-label">Win multiplier tiers (random per win)</label>
              <div class="tier-table">
                <div class="tier-head">
                  <span>Multiplier (× stake)</span>
                  <span>Weight</span>
                  <span />
                </div>
                <div
                  v-for="(tier, index) in winMultiplierTiers"
                  :key="index"
                  class="tier-row"
                >
                  <input
                    v-model="tier.multiplier"
                    class="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 5"
                  />
                  <input
                    v-model="tier.weight"
                    class="form-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 10"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    :disabled="winMultiplierTiers.length <= 1"
                    @click="removeMultiplierTier(index)"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div class="tier-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="addMultiplierTier">
                  Add tier
                </button>
                <span class="field-hint">
                  On win, one tier is picked by weight. Avg multiplier:
                  {{ Number.isFinite(previewMultiplier) ? previewMultiplier.toFixed(2) : '—' }}×
                </span>
              </div>
            </div>
            <div class="form-field">
              <label class="form-label">Host bean benefit (% of stake)</label>
              <input
                v-model="receiverBenefitPercent"
                class="form-input"
                type="number"
                min="0"
                max="1.5"
                step="0.01"
                placeholder="e.g. 1.5"
              />
              <span class="field-hint">Replaces normal gift bean value for lucky sends (0–1.5%).</span>
            </div>
            <div class="form-field">
              <label class="form-label">Daily user win cap (coins)</label>
              <input
                v-model="dailyUserWinCapCoins"
                class="form-input"
                inputmode="numeric"
                placeholder="0 = no cap"
              />
              <span class="field-hint">Enforcement deferred — stored for future use.</span>
            </div>
          </div>

          <div class="metrics-row" :class="{ 'metrics-warn': trpTooHigh }">
            <div class="metric">
              <span class="metric-label">TRP (sender expected return)</span>
              <span class="metric-value">{{ fmtPct(previewTrp) }}</span>
              <span class="metric-formula">win % × avg multiplier</span>
            </div>
            <div class="metric">
              <span class="metric-label">Total payout ratio</span>
              <span class="metric-value">{{ fmtPct(previewTotalPayout) }}</span>
              <span class="metric-formula">TRP + host benefit %</span>
            </div>
            <div class="metric">
              <span class="metric-label">Example ({{ exampleStake }} coin stake)</span>
              <span class="metric-value dim-sm">
                Win → 🪙 {{ exampleWinPayout }} · Host → 🫘 {{ exampleHostBeans }}
              </span>
            </div>
          </div>
          <p v-if="trpTooHigh" class="form-error">
            TRP must stay below 100% so the house retains an edge.
          </p>

          <div class="save-row">
            <button
              class="btn btn-primary"
              :disabled="saving || trpTooHigh"
              @click="saveSetting"
            >
              {{ saving ? 'Saving…' : 'Save configuration' }}
            </button>
            <span v-if="saved" class="saved-badge">Saved ✓</span>
          </div>
          <p v-if="saveError" class="form-error">{{ saveError }}</p>
          <p v-if="setting" class="meta dim">
            Last updated {{ new Date(setting.updatedAt).toLocaleString() }}
            <span v-if="setting.updatedBy"> · by {{ setting.updatedBy }}</span>
          </p>
        </div>
      </div>

      <!-- ── Stats ───────────────────────────────────────────────────────── -->
      <div v-if="stats" class="kpi-row">
        <div class="kpi-card">
          <p class="kpi-label">Total draws</p>
          <h3 class="kpi-value">{{ fmtCoins(stats.totalDraws) }}</h3>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Observed win rate</p>
          <h3 class="kpi-value">{{ fmtPct(stats.observedWinRate) }}</h3>
          <p class="kpi-sub">Configured: {{ fmtPct(stats.configuredWinRate) }}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Total staked (coins)</p>
          <h3 class="kpi-value">{{ fmtCoins(stats.totalStakedCoins) }}</h3>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Total paid to senders (coins)</p>
          <h3 class="kpi-value">{{ fmtCoins(stats.totalPaidOutCoins) }}</h3>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Realized house edge (coins)</p>
          <h3 class="kpi-value">
            {{ stats.realizedHouseEdge != null ? fmtPct(stats.realizedHouseEdge) : '—' }}
          </h3>
        </div>
      </div>

      <!-- ── Draw log ────────────────────────────────────────────────────── -->
      <div class="table-card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Recent draws</h2>
            <p class="card-sub">Immutable log — one row per lucky gift transaction</p>
          </div>
          <select v-model="winFilter" class="filter-select">
            <option value="all">All outcomes</option>
            <option value="wins">Wins only</option>
            <option value="losses">Losses only</option>
          </select>
        </div>

        <div v-if="drawsLoading" class="loading">Loading draws…</div>
        <div v-else-if="draws.length === 0" class="loading">No draws yet.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Gift</th>
              <th class="num">Stake</th>
              <th>Outcome</th>
              <th class="num">Multiplier</th>
              <th class="num">Reward</th>
              <th class="num">Host beans</th>
              <th class="mono">User</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in draws" :key="d.id">
              <td class="dim">{{ new Date(d.createdAt).toLocaleString() }}</td>
              <td class="fw">{{ d.gift?.icon }} {{ d.gift?.name }}</td>
              <td class="num">🪙 {{ fmtCoins(d.coinCost) }}</td>
              <td>
                <span :class="d.isWin ? 'badge-win' : 'badge-lose'">
                  {{ d.isWin ? 'Win' : 'Lose' }}
                </span>
              </td>
              <td class="num">{{ d.isWin ? `${d.winMultiplier}×` : '—' }}</td>
              <td class="num coins">{{ d.isWin ? `🪙 ${fmtCoins(d.rewardCoins)}` : '—' }}</td>
              <td class="num">🫘 {{ fmtCoins(d.receiverBeans) }}</td>
              <td class="mono dim">{{ d.userId.slice(0, 8) }}…</td>
            </tr>
          </tbody>
        </table>
        <Pagination
          :page="drawsPage"
          :total-pages="drawsTotalPages"
          :total="drawsTotal"
          @update:page="(p) => (drawsPage = p)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.page-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  max-width: 720px;
  line-height: 1.5;
}
.loading {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.settings-card,
.table-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.master-card {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 35%, transparent);
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  gap: 16px;
  flex-wrap: wrap;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.card-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
.settings-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.toggle-input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}
.toggle-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.status-note {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.form-field-wide {
  grid-column: 1 / -1;
}
.tier-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tier-head,
.tier-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.tier-head {
  font-size: 12px;
  color: var(--text-muted);
}
.tier-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}
.form-input {
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}
.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--row-hover, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
}
.metrics-warn {
  border-color: #ef4444;
  background: #ef444410;
}
.metric-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 4px;
}
.metric-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.metric-formula {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.dim-sm {
  font-size: 13px !important;
  font-weight: 600 !important;
}
.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.saved-badge {
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
}
.form-error {
  font-size: 12px;
  color: #ef4444;
  margin: 0;
}
.meta {
  font-size: 12px;
  margin: 0;
}
.dim {
  color: var(--text-muted);
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.kpi-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
}
.kpi-label {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 6px;
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.kpi-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0 0;
}
.filter-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.data-table th.num {
  text-align: right;
}
.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-subtle, var(--border));
}
.data-table td.num {
  text-align: right;
}
.data-table tbody tr:last-child td {
  border-bottom: none;
}
.fw {
  font-weight: 600;
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
.coins {
  color: #e8a020;
  font-weight: 600;
}
.badge-win,
.badge-lose {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.badge-win {
  background: #10b98122;
  color: #10b981;
}
.badge-lose {
  background: #6b728022;
  color: var(--text-muted);
}
.btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
}
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
</style>
