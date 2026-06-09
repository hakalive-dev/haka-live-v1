<script setup lang="ts">
import { ref } from 'vue'
import * as storeApi from '@/api/store'
import { listAgencies } from '@/api/agencies'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
  items: any[]
  selectedIds: string[]
}>()

const emit = defineEmits<{
  refresh: []
  'update:selectedIds': [ids: string[]]
}>()

const toast = useToastStore()

// Send item
const sendModal = ref(false)
const sendItem = ref<any>(null)
const sendForm = ref({ hakaId: '', userId: '', displayName: '', quantity: 1, reason: '', durationDays: null as number | null })
const sendLoading = ref(false)
const sendError = ref('')
const lookupLoading = ref(false)

function openSend(item: any) {
  sendItem.value = item
  sendForm.value = { hakaId: '', userId: '', displayName: '', quantity: 1, reason: '', durationDays: null }
  sendError.value = ''
  sendModal.value = true
}

async function lookupUser() {
  if (!sendForm.value.hakaId.trim()) return
  lookupLoading.value = true
  sendError.value = ''
  try {
    const u = await storeApi.lookupStoreUser(sendForm.value.hakaId.trim())
    sendForm.value.userId = u.id
    sendForm.value.displayName = u.displayName || u.username || u.hakaId || u.id
  } catch (e: any) {
    sendForm.value.userId = ''
    sendForm.value.displayName = ''
    sendError.value = e?.message || 'User not found'
  }
  lookupLoading.value = false
}

async function submitSend() {
  if (!sendItem.value || !sendForm.value.userId) {
    sendError.value = 'Look up a valid user first'
    return
  }
  if (!sendForm.value.reason.trim()) {
    sendError.value = 'Reason is required'
    return
  }
  sendLoading.value = true
  try {
    await storeApi.sendStoreItem(sendItem.value.id, {
      userId: sendForm.value.userId,
      quantity: sendForm.value.quantity,
      reason: sendForm.value.reason.trim(),
      durationDays: sendForm.value.durationDays,
    })
    toast.success('Item Sent', `Sent to ${sendForm.value.displayName}`)
    sendModal.value = false
    emit('refresh')
  } catch (e: any) {
    sendError.value = e?.message || 'Send failed'
  }
  sendLoading.value = false
}

// Bulk sale status
const bulkSaleModal = ref(false)
const bulkSaleForSale = ref(true)
const bulkSaleReason = ref('')
const bulkSaleLoading = ref(false)

function openBulkSale() {
  if (props.selectedIds.length === 0) {
    toast.error('Select items', 'Choose at least one item')
    return
  }
  bulkSaleForSale.value = true
  bulkSaleReason.value = ''
  bulkSaleModal.value = true
}

async function submitBulkSale() {
  bulkSaleLoading.value = true
  try {
    await storeApi.bulkPatchSaleStatus({
      itemIds: props.selectedIds,
      isForSale: bulkSaleForSale.value,
      reason: bulkSaleReason.value || undefined,
    })
    toast.success('Sale Status Updated')
    bulkSaleModal.value = false
    emit('update:selectedIds', [])
    emit('refresh')
  } catch (e: any) {
    toast.error('Update Failed', e?.message)
  }
  bulkSaleLoading.value = false
}

async function toggleItemSale(item: any) {
  try {
    await storeApi.patchSaleStatus(item.id, {
      isForSale: !item.isForSale,
    })
    toast.success(item.isForSale ? 'Marked Not For Sale' : 'Marked For Sale')
    emit('refresh')
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
}

// Schedule
const scheduleModal = ref(false)
const scheduleForm = ref({
  targetForSale: true,
  effectiveAt: '',
  reason: '',
})
const scheduleLoading = ref(false)

function openSchedule() {
  if (props.selectedIds.length === 0) {
    toast.error('Select items', 'Choose at least one item')
    return
  }
  scheduleForm.value = { targetForSale: true, effectiveAt: '', reason: '' }
  scheduleModal.value = true
}

async function submitSchedule() {
  if (!scheduleForm.value.effectiveAt) {
    toast.error('Date required', 'Pick an effective date/time')
    return
  }
  scheduleLoading.value = true
  try {
    await storeApi.createSaleSchedule({
      itemIds: props.selectedIds,
      targetForSale: scheduleForm.value.targetForSale,
      effectiveAt: new Date(scheduleForm.value.effectiveAt).toISOString(),
      reason: scheduleForm.value.reason || undefined,
    })
    toast.success('Schedule Created')
    scheduleModal.value = false
    emit('update:selectedIds', [])
  } catch (e: any) {
    toast.error('Schedule Failed', e?.message)
  }
  scheduleLoading.value = false
}

// History
const historyModal = ref(false)
const historyItem = ref<any>(null)
const historyLogs = ref<any[]>([])
const historyLoading = ref(false)

async function openHistory(item: any) {
  historyItem.value = item
  historyModal.value = true
  historyLoading.value = true
  try {
    const res = await storeApi.getSaleStatusHistory(item.id, { limit: 50 })
    historyLogs.value = res.logs ?? []
  } catch (e: any) {
    toast.error('History Failed', e?.message)
  }
  historyLoading.value = false
}

// Bulk distribute
const distModal = ref(false)
const distItem = ref<any>(null)
const distTab = ref<'user_ids' | 'agency' | 'host_level' | 'country' | 'all'>('user_ids')
const distForm = ref({
  userIdsText: '',
  agencyId: '',
  country: '',
  levelType: 'rich' as 'rich' | 'charm',
  minLevel: 1,
  maxLevel: null as number | null,
  quantity: 1,
  reason: '',
  durationDays: null as number | null,
})
const distLoading = ref(false)
const distError = ref('')
const agencies = ref<any[]>([])

async function loadAgencies() {
  try {
    const res = await listAgencies({ limit: 200 })
    agencies.value = res.agencies ?? res.items ?? []
  } catch { /* ignore */ }
}

function openDistribute(item: any, emergency = false) {
  distItem.value = item
  distTab.value = emergency ? 'all' : 'user_ids'
  distForm.value = {
    userIdsText: '',
    agencyId: '',
    country: '',
    levelType: 'rich',
    minLevel: 1,
    maxLevel: null,
    quantity: 1,
    reason: emergency ? 'Emergency compensation' : '',
    durationDays: null,
  }
  distError.value = ''
  distModal.value = true
  void loadAgencies()
}

function buildAudienceFilters(): Record<string, unknown> {
  switch (distTab.value) {
    case 'user_ids':
      return { userIds: distForm.value.userIdsText.split(/[\s,]+/).filter(Boolean) }
    case 'agency':
      return { agencyId: distForm.value.agencyId }
    case 'host_level':
      return {
        levelType: distForm.value.levelType,
        minLevel: distForm.value.minLevel,
        maxLevel: distForm.value.maxLevel,
      }
    case 'country':
      return { country: distForm.value.country }
    case 'all':
      return {}
    default:
      return {}
  }
}

async function submitDistribute() {
  if (!distItem.value) return
  if (!distForm.value.reason.trim()) {
    distError.value = 'Reason is required'
    return
  }
  distLoading.value = true
  distError.value = ''
  try {
    const result = await storeApi.bulkDistributeStoreItem(distItem.value.id, {
      audienceType: distTab.value,
      audienceFilters: buildAudienceFilters(),
      quantity: distForm.value.quantity,
      reason: distForm.value.reason.trim(),
      durationDays: distForm.value.durationDays,
      channel: distTab.value === 'all' ? 'emergency' : 'bulk',
    })
    if (result.mode === 'async') {
      toast.success('Queued', `Job ${result.jobId} — ~${result.estimatedRecipients} recipients`)
    } else {
      toast.success('Distributed', `Sent to ${result.distributedCount} user(s)`)
    }
    distModal.value = false
    emit('refresh')
  } catch (e: any) {
    distError.value = e?.message || 'Distribution failed'
  }
  distLoading.value = false
}

// Analytics
const showAnalytics = ref(false)
const analytics = ref<any>(null)
const analyticsLoading = ref(false)

async function loadAnalytics() {
  showAnalytics.value = true
  analyticsLoading.value = true
  try {
    analytics.value = await storeApi.getStoreDistributionAnalytics()
  } catch (e: any) {
    toast.error('Analytics Failed', e?.message)
  }
  analyticsLoading.value = false
}

defineExpose({
  openSend,
  openDistribute,
  openBulkSale,
  openSchedule,
  openHistory,
  toggleItemSale,
  loadAnalytics,
  showAnalytics,
})
</script>

<template>
  <!-- Send Item -->
  <Teleport to="body">
    <div v-if="sendModal" class="modal-overlay" @click.self="sendModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Send Item — {{ sendItem?.name }}</h3>
          <button class="modal-close" @click="sendModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>User ID (Haka ID)</label>
            <div class="lookup-row">
              <input v-model="sendForm.hakaId" class="form-input" placeholder="Haka ID or UUID" @keyup.enter="lookupUser" />
              <button type="button" class="btn-sm" :disabled="lookupLoading" @click="lookupUser">Look up</button>
            </div>
          </div>
          <div v-if="sendForm.displayName" class="lookup-result">User: <b>{{ sendForm.displayName }}</b></div>
          <div class="form-row">
            <div class="form-group">
              <label>Quantity</label>
              <input v-model.number="sendForm.quantity" type="number" min="1" max="100" class="form-input" />
            </div>
            <div class="form-group">
              <label>Duration (days, empty = item default)</label>
              <input v-model.number="sendForm.durationDays" type="number" min="0" class="form-input" placeholder="Default" />
            </div>
          </div>
          <div class="form-group">
            <label>Reason / Note *</label>
            <textarea v-model="sendForm.reason" class="form-input" rows="2" placeholder="Event reward, compensation…" />
          </div>
          <div v-if="sendError" class="error-msg">{{ sendError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="sendModal = false">Cancel</button>
          <button class="btn-primary" :disabled="sendLoading" @click="submitSend">{{ sendLoading ? 'Sending…' : 'Confirm' }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Bulk sale status -->
  <Teleport to="body">
    <div v-if="bulkSaleModal" class="modal-overlay" @click.self="bulkSaleModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Bulk Sale Status ({{ selectedIds.length }} items)</h3>
          <button class="modal-close" @click="bulkSaleModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Target status</label>
            <select v-model="bulkSaleForSale" class="form-input">
              <option :value="true">For Sale</option>
              <option :value="false">Not For Sale</option>
            </select>
          </div>
          <div class="form-group">
            <label>Reason (optional)</label>
            <input v-model="bulkSaleReason" class="form-input" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="bulkSaleModal = false">Cancel</button>
          <button class="btn-primary" :disabled="bulkSaleLoading" @click="submitBulkSale">Apply</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Schedule -->
  <Teleport to="body">
    <div v-if="scheduleModal" class="modal-overlay" @click.self="scheduleModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Schedule Sale Change ({{ selectedIds.length }} items)</h3>
          <button class="modal-close" @click="scheduleModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Target status</label>
            <select v-model="scheduleForm.targetForSale" class="form-input">
              <option :value="true">For Sale</option>
              <option :value="false">Not For Sale</option>
            </select>
          </div>
          <div class="form-group">
            <label>Effective at *</label>
            <input v-model="scheduleForm.effectiveAt" type="datetime-local" class="form-input" />
          </div>
          <div class="form-group">
            <label>Reason</label>
            <input v-model="scheduleForm.reason" class="form-input" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="scheduleModal = false">Cancel</button>
          <button class="btn-primary" :disabled="scheduleLoading" @click="submitSchedule">Schedule</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- History -->
  <Teleport to="body">
    <div v-if="historyModal" class="modal-overlay" @click.self="historyModal = false">
      <div class="modal modal-box modal-wide">
        <div class="modal-header">
          <h3>Sale History — {{ historyItem?.name }}</h3>
          <button class="modal-close" @click="historyModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="historyLoading" class="loading-inline">Loading…</div>
          <table v-else-if="historyLogs.length" class="mini-table">
            <thead><tr><th>When</th><th>From</th><th>To</th><th>Source</th><th>Reason</th></tr></thead>
            <tbody>
              <tr v-for="log in historyLogs" :key="log.id">
                <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
                <td>{{ log.previousForSale ? 'For Sale' : 'Not For Sale' }}</td>
                <td>{{ log.newForSale ? 'For Sale' : 'Not For Sale' }}</td>
                <td>{{ log.source }}</td>
                <td>{{ log.reason || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="field-hint">No history yet.</p>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Bulk distribute -->
  <Teleport to="body">
    <div v-if="distModal" class="modal-overlay" @click.self="distModal = false">
      <div class="modal modal-box modal-wide">
        <div class="modal-header">
          <h3>Bulk Distribute — {{ distItem?.name }}</h3>
          <button class="modal-close" @click="distModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="tab-row">
            <button v-for="t in ['user_ids','agency','host_level','country','all']" :key="t" type="button" class="tab-btn" :class="{ active: distTab === t }" @click="distTab = t as any">{{ t.replace('_',' ') }}</button>
          </div>
          <div v-if="distTab === 'user_ids'" class="form-group">
            <label>User IDs (Haka ID or UUID, one per line)</label>
            <textarea v-model="distForm.userIdsText" class="form-input" rows="4" />
          </div>
          <div v-if="distTab === 'agency'" class="form-group">
            <label>Agency</label>
            <select v-model="distForm.agencyId" class="form-input">
              <option value="">Select agency</option>
              <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div v-if="distTab === 'host_level'" class="form-row">
            <div class="form-group">
              <label>Level type</label>
              <select v-model="distForm.levelType" class="form-input">
                <option value="rich">Rich Level</option>
                <option value="charm">Charm Level</option>
              </select>
            </div>
            <div class="form-group">
              <label>Min level</label>
              <input v-model.number="distForm.minLevel" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label>Max level (optional)</label>
              <input v-model.number="distForm.maxLevel" type="number" min="1" class="form-input" placeholder="Any" />
            </div>
          </div>
          <div v-if="distTab === 'country'" class="form-group">
            <label>Country</label>
            <input v-model="distForm.country" class="form-input" placeholder="e.g. India, IN" />
          </div>
          <div v-if="distTab === 'all'" class="warn-box">
            This will queue distribution to all active users. Large audiences run in the background.
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Quantity per user</label>
              <input v-model.number="distForm.quantity" type="number" min="1" max="100" class="form-input" />
            </div>
            <div class="form-group">
              <label>Duration override (days)</label>
              <input v-model.number="distForm.durationDays" type="number" min="0" class="form-input" placeholder="Item default" />
            </div>
          </div>
          <div class="form-group">
            <label>Reason *</label>
            <textarea v-model="distForm.reason" class="form-input" rows="2" />
          </div>
          <div v-if="distError" class="error-msg">{{ distError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="distModal = false">Cancel</button>
          <button class="btn-primary" :disabled="distLoading" @click="submitDistribute">{{ distLoading ? 'Working…' : 'Confirm' }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Analytics drawer -->
  <Teleport to="body">
    <div v-if="showAnalytics" class="modal-overlay" @click.self="showAnalytics = false">
      <div class="modal modal-box modal-wide">
        <div class="modal-header">
          <h3>Distribution Analytics</h3>
          <button class="modal-close" @click="showAnalytics = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="analyticsLoading" class="loading-inline">Loading…</div>
          <template v-else-if="analytics">
            <div class="stats-row">
              <div class="stat-card"><div class="stat-label">Total distributions</div><div class="stat-val">{{ analytics.totalDistributions }}</div></div>
              <div class="stat-card"><div class="stat-label">Total quantity</div><div class="stat-val">{{ analytics.totalQuantity }}</div></div>
              <div class="stat-card"><div class="stat-label">Coin value (snapshot)</div><div class="stat-val">🪙 {{ Number(analytics.totalCoinValue).toLocaleString() }}</div></div>
            </div>
            <h4 class="section-title">Top items</h4>
            <table class="mini-table">
              <thead><tr><th>Item</th><th>Count</th><th>Qty</th><th>Value</th></tr></thead>
              <tbody>
                <tr v-for="row in analytics.topItems" :key="row.itemId">
                  <td>{{ row.itemName }}</td>
                  <td>{{ row.count }}</td>
                  <td>{{ row.quantity }}</td>
                  <td>🪙 {{ row.coinValue?.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); }
.modal { background: #fff; border-radius: 14px; width: 580px; max-width: 95vw; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
.modal-wide { width: 720px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-header h3 { font-size: 15px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; cursor: pointer; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
.form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.form-input { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
.form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.lookup-row { display: flex; gap: 8px; }
.lookup-result { font-size: 13px; margin-bottom: 8px; color: var(--text-muted); }
.error-msg { color: #ff4d4d; font-size: 13px; }
.btn-primary, .btn-ghost, .btn-sm { padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 1px solid var(--border); }
.btn-primary { background: var(--primary); color: #fff; border: none; }
.tab-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.tab-btn { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: #f8fafc; font-size: 12px; cursor: pointer; text-transform: capitalize; }
.tab-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.warn-box { background: #fff7ed; border: 1px solid #fed7aa; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.mini-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.mini-table th, .mini-table td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border); }
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.stat-label { font-size: 11px; color: var(--text-muted); }
.stat-val { font-size: 18px; font-weight: 700; margin-top: 4px; }
.section-title { font-size: 13px; margin: 12px 0 8px; }
.loading-inline { padding: 20px; text-align: center; color: var(--text-muted); }
.field-hint { font-size: 12px; color: var(--text-muted); }
</style>
