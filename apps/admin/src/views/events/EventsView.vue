<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as eventsApi from '@/api/events'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const events = ref<any[]>([])
const loading = ref(true)

// Filters
const statusFilter = ref('')
const typeFilter = ref('')

// Create/Edit modal
const formModal = ref(false)
const isEdit = ref(false)
const editTarget = ref<any>(null)
const formLoading = ref(false)
const formError = ref('')

function emptyForm() {
  return {
    name: '',
    type: 'competition',
    startDate: '',
    endDate: '',
    bannerUrl: '',
    description: '',
    entryRequirement: 'free',
    entryCost: 0,
    participationType: 'solo',
    scoringSystem: 'gifts_received',
    rankingPeriod: 'global',
    visibility: { homePage: true, bannerSlider: false, pushNotification: false },
    rewards: [] as any[],
  }
}

const form = ref(emptyForm())
const bannerFile = ref<File | null>(null)
const bannerPreview = ref<string>('')

function onBannerSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  bannerFile.value = file
  if (file) {
    const reader = new FileReader()
    reader.onload = () => { bannerPreview.value = reader.result as string }
    reader.readAsDataURL(file)
  } else {
    bannerPreview.value = form.value.bannerUrl || ''
  }
}

// Delete confirm
const deleteConfirm = ref<any>(null)
const deleteLoading = ref(false)

async function fetchEvents() {
  loading.value = true
  try {
    const params: Record<string, any> = {}
    if (statusFilter.value) params.status = statusFilter.value
    if (typeFilter.value) params.type = typeFilter.value
    const res = await eventsApi.listEvents(params)
    events.value = res.data ?? res
  } catch {}
  loading.value = false
}

function openCreate() {
  isEdit.value = false
  editTarget.value = null
  form.value = emptyForm()
  bannerFile.value = null
  bannerPreview.value = ''
  formModal.value = true
}

function openEdit(event: any) {
  isEdit.value = true
  editTarget.value = event
  form.value = {
    name: event.name,
    type: event.type,
    startDate: event.startDate?.slice(0, 16) ?? '',
    endDate: event.endDate?.slice(0, 16) ?? '',
    bannerUrl: event.bannerUrl ?? '',
    description: event.description ?? '',
    entryRequirement: event.entryRequirement ?? 'free',
    entryCost: event.entryCost ?? 0,
    participationType: event.participationType ?? 'solo',
    scoringSystem: event.scoringSystem ?? 'gifts_received',
    rankingPeriod: event.rankingPeriod ?? 'global',
    visibility: event.visibility ?? { homePage: true, bannerSlider: false, pushNotification: false },
    rewards: event.rewards ? event.rewards.map((r: any) => ({ ...r })) : [],
  }
  bannerFile.value = null
  bannerPreview.value = event.bannerUrl ?? ''
  formModal.value = true
}

function buildPayload() {
  if (bannerFile.value) {
    const fd = new FormData()
    fd.append('bannerFile', bannerFile.value)
    for (const [k, v] of Object.entries(form.value)) {
      if (v === null || v === undefined) continue
      if (k === 'bannerUrl' && !v) continue
      if (k === 'visibility' || k === 'rewards') {
        fd.append(k, JSON.stringify(v))
      } else {
        fd.append(k, String(v))
      }
    }
    return fd
  }
  return form.value
}

async function submitForm() {
  formError.value = ''
  formLoading.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value && editTarget.value) {
      await eventsApi.updateEvent(editTarget.value.id, payload)
      toast.success('Event Updated')
    } else {
      await eventsApi.createEvent(payload)
      toast.success('Event Created', form.value.name)
    }
    formModal.value = false
    await fetchEvents()
  } catch (e: any) { formError.value = e?.message || 'Failed' }
  formLoading.value = false
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  deleteLoading.value = true
  try {
    await eventsApi.deleteEvent(deleteConfirm.value.id)
    toast.success('Event Deleted')
    deleteConfirm.value = null
    await fetchEvents()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

function addReward() {
  form.value.rewards.push({ rank: form.value.rewards.length + 1, rewardType: 'coins', rewardLabel: '', rewardAmount: 0 })
}

function removeReward(idx: number) {
  form.value.rewards.splice(idx, 1)
}

function statusBadgeClass(status: string) {
  return {
    draft: 'badge-draft',
    upcoming: 'badge-upcoming',
    active: 'badge-active',
    expired: 'badge-expired',
  }[status] || 'badge-draft'
}

function typeLabel(type: string) {
  return { competition: 'Competition', festival: 'Festival', lucky_draw: 'Lucky Draw', game_event: 'Game Event' }[type] || type
}

onMounted(fetchEvents)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">Event Management</h2>
      <button v-if="auth.hasPermission('event.manage')" class="btn btn-primary" @click="openCreate">+ New Event</button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <select v-model="statusFilter" class="filter-select" @change="fetchEvents">
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="upcoming">Upcoming</option>
        <option value="active">Active</option>
        <option value="expired">Expired</option>
      </select>
      <select v-model="typeFilter" class="filter-select" @change="fetchEvents">
        <option value="">All Types</option>
        <option value="competition">Competition</option>
        <option value="festival">Festival</option>
        <option value="lucky_draw">Lucky Draw</option>
        <option value="game_event">Game Event</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading events...</div>

    <div v-else-if="events.length === 0" class="empty">
      <div class="empty-icon">🏆</div>
      <div class="empty-title">No events found</div>
    </div>

    <div v-else class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Type</th>
            <th>Status</th>
            <th>Period</th>
            <th>Entry</th>
            <th>Dates</th>
            <th v-if="auth.hasPermission('event.manage')" class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td>
              <div class="event-name">{{ event.name }}</div>
              <div class="event-sub">{{ event.rewards?.length ?? 0 }} rewards · {{ event.participationType }}</div>
            </td>
            <td><span class="type-label">{{ typeLabel(event.type) }}</span></td>
            <td><span :class="['status-badge', statusBadgeClass(event.status)]">{{ event.status }}</span></td>
            <td class="dim">{{ event.rankingPeriod }}</td>
            <td class="dim">{{ event.entryRequirement === 'free' ? 'Free' : `${event.entryCost} coins` }}</td>
            <td class="dim">
              <div>{{ new Date(event.startDate).toLocaleDateString() }}</div>
              <div>{{ new Date(event.endDate).toLocaleDateString() }}</div>
            </td>
            <td v-if="auth.hasPermission('event.manage')" class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openEdit(event)">Edit</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="deleteConfirm = event">Delete</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <!-- Create/Edit modal -->
    <div v-if="formModal" class="modal-overlay" @click.self="formModal = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>{{ isEdit ? 'Edit Event' : 'Create Event' }}</h3>
          <button class="btn-close" @click="formModal = false">✕</button>
        </div>
        <div class="modal-body">
          <!-- Basic Info -->
          <div class="section-label">Basic Info</div>
          <div class="form-row">
            <div class="form-group flex-2">
              <label>Event Name</label>
              <input v-model="form.name" class="form-input" placeholder="Event name" />
            </div>
            <div class="form-group">
              <label>Type</label>
              <select v-model="form.type" class="form-input">
                <option value="competition">Competition</option>
                <option value="festival">Festival</option>
                <option value="lucky_draw">Lucky Draw</option>
                <option value="game_event">Game Event</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="form.description" class="form-input form-textarea" placeholder="Event description"></textarea>
          </div>
          <div class="form-group">
            <label>Event Banner</label>
            <input type="file" accept="image/*" class="form-input" @change="onBannerSelected" />
            <div v-if="bannerPreview" class="image-preview">
              <img :src="bannerPreview" alt="Banner preview" />
            </div>
            <label class="hint-label">Or paste an image URL:</label>
            <input v-model="form.bannerUrl" class="form-input" placeholder="https://cdn.example.com/event-banner.jpg" />
          </div>

          <!-- Schedule -->
          <div class="section-label">Schedule</div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Date</label>
              <input v-model="form.startDate" type="datetime-local" class="form-input" />
            </div>
            <div class="form-group">
              <label>End Date</label>
              <input v-model="form.endDate" type="datetime-local" class="form-input" />
            </div>
          </div>

          <!-- Rules -->
          <div class="section-label">Rules</div>
          <div class="form-row">
            <div class="form-group">
              <label>Entry Requirement</label>
              <select v-model="form.entryRequirement" class="form-input">
                <option value="free">Free</option>
                <option value="coins">Coins</option>
              </select>
            </div>
            <div class="form-group">
              <label>Entry Cost (coins)</label>
              <input v-model.number="form.entryCost" type="number" class="form-input" :disabled="form.entryRequirement === 'free'" />
            </div>
            <div class="form-group">
              <label>Participation</label>
              <select v-model="form.participationType" class="form-input">
                <option value="solo">Solo</option>
                <option value="team">Team</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Scoring System</label>
              <select v-model="form.scoringSystem" class="form-input">
                <option value="gifts_received">Gifts Received</option>
                <option value="coins_spent">Coins Spent</option>
                <option value="game_wins">Game Wins</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ranking Period</label>
              <select v-model="form.rankingPeriod" class="form-input">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="global">Global</option>
              </select>
            </div>
          </div>

          <!-- Visibility -->
          <div class="section-label">Visibility</div>
          <div class="check-row">
            <label class="check-label">
              <input type="checkbox" v-model="form.visibility.homePage" /> Show on Home Page
            </label>
            <label class="check-label">
              <input type="checkbox" v-model="form.visibility.bannerSlider" /> Show in Banner Slider
            </label>
            <label class="check-label">
              <input type="checkbox" v-model="form.visibility.pushNotification" /> Push Notification
            </label>
          </div>
          <p v-if="form.visibility.bannerSlider" class="visibility-hint">
            A home-top slider banner will be created automatically using this event's banner image and dates.
          </p>

          <!-- Rewards -->
          <div class="section-label">
            Rank Rewards
            <button class="btn-add-reward" @click="addReward">+ Add Reward</button>
          </div>
          <div v-if="form.rewards.length === 0" class="no-rewards">No rewards configured.</div>
          <div v-for="(reward, idx) in form.rewards" :key="idx" class="reward-row">
            <div class="reward-rank">#{{ reward.rank }}</div>
            <div class="form-group">
              <select v-model="reward.rewardType" class="form-input">
                <option value="coins">Coins</option>
                <option value="cash">Cash</option>
                <option value="badge">Badge</option>
                <option value="item">Item</option>
              </select>
            </div>
            <div class="form-group flex-2">
              <input v-model="reward.rewardLabel" class="form-input" placeholder="Label (e.g. Gold Trophy)" />
            </div>
            <div class="form-group">
              <input v-model.number="reward.rewardAmount" type="number" class="form-input" placeholder="Amount" />
            </div>
            <button class="btn-remove" @click="removeReward(idx)">✕</button>
          </div>

          <div v-if="formError" class="form-error">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="formModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="formLoading" @click="submitForm">
            {{ formLoading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Event') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Delete Event</h3>
          <button class="btn-close" @click="deleteConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">Delete event <strong>{{ deleteConfirm.name }}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Deleting...' : 'Delete' }}
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
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger { background: #FF4D4D; color: #fff; }
.filters { display: flex; gap: 10px; }
.filter-select { padding: 6px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.event-name { font-weight: 600; }
.event-sub { font-size: 11px; color: var(--text-muted); }
.type-label { font-size: 12px; color: var(--text-muted); }
.status-badge { padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-draft    { background: #f1f5f9; color: #475569; }
.badge-upcoming { background: #dbeafe; color: #1e40af; }
.badge-active   { background: #d1fae5; color: #065f46; }
.badge-expired  { background: #fee2e2; color: #991b1b; }
.dim { color: var(--text-muted); font-size: 12px; }
/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.modal-wide { width: min(760px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); }
.section-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px; display: flex; align-items: center; justify-content: space-between; }
.form-row { display: flex; gap: 12px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.form-group.flex-2 { flex: 2; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-input:disabled { opacity: 0.5; cursor: not-allowed; }
.form-textarea { height: 80px; padding: 10px 12px; resize: vertical; }
.hint-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.image-preview { margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border); max-height: 160px; }
.image-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.check-row { display: flex; gap: 20px; }
.check-label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; user-select: none; }
.check-label input { accent-color: var(--primary); }
.visibility-hint { margin: 0; font-size: 12px; color: var(--text-muted); }
.btn-add-reward { padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--primary); color: var(--primary); background: transparent; cursor: pointer; }
.no-rewards { font-size: 13px; color: var(--text-muted); font-style: italic; }
.reward-row { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--content-bg); border-radius: 8px; border: 1px solid var(--card-border); }
.reward-rank { font-size: 13px; font-weight: 700; color: var(--primary); min-width: 24px; }
.btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 4px; }
.btn-remove:hover { color: #FF4D4D; }
</style>
