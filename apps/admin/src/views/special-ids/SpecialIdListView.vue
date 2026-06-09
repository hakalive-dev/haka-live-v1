<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '@/api/specialIds'
import type { SpecialIdRow, AvailabilityResult } from '@/api/specialIds'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const toast = useToastStore()

const rows = ref<SpecialIdRow[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search = ref('')
const levelFilter = ref<'' | 'SSS' | 'SS' | 'S' | 'A' | 'B'>('')
const statusFilter = ref<'' | 'available' | 'owned'>('')
const loading = ref(true)

// ── Modal state ───────────────────────────────────────────────────────────────
type Mode = 'create' | 'edit'
const modal = ref<{ mode: Mode; row?: SpecialIdRow } | null>(null)
const saving = ref(false)

interface FormState {
  number: string
  autoGenerate: boolean
  price: number | ''
  durationDays: number | ''
  level: string
}

const emptyForm = (): FormState => ({
  number: '',
  autoGenerate: true,
  price: '',
  durationDays: '',
  level: '',
})

const form = ref<FormState>(emptyForm())

// Availability check — debounced
const availability = ref<AvailabilityResult | null>(null)
const checking = ref(false)
let availTimer: ReturnType<typeof setTimeout> | null = null

const SPECIAL_ID_RE = /^\d{6}$/

const formatError = computed(() => {
  const v = form.value.number
  if (!v || form.value.autoGenerate) return ''
  if (!SPECIAL_ID_RE.test(v)) return 'Must be exactly 6 digits'
  return ''
})

const canSave = computed(() => {
  const f = form.value
  if (!f.level) return false
  if (!f.price || f.price <= 0) return false
  if (!f.durationDays || f.durationDays <= 0) return false
  if (modal.value?.mode === 'create') {
    if (!f.autoGenerate) {
      if (!SPECIAL_ID_RE.test(f.number)) return false
      if (!availability.value?.available) return false
    }
  }
  return true
})

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchRows() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    }
    if (search.value) params.search = search.value
    if (levelFilter.value) params.level = levelFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    const result = await api.listSpecialIds(params)
    rows.value = result.rows
    pagination.value = result.pagination
  } catch (e: any) {
    toast.error('Load failed', e?.message)
  }
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchRows() }

// ── Modal actions ─────────────────────────────────────────────────────────────
function openCreate() {
  form.value = emptyForm()
  availability.value = null
  modal.value = { mode: 'create' }
}

function openEdit(row: SpecialIdRow) {
  form.value = {
    number: row.number,
    autoGenerate: false,
    price: row.price,
    durationDays: row.durationDays,
    level: row.level,
  }
  availability.value = null
  modal.value = { mode: 'edit', row }
}

function closeModal() {
  modal.value = null
  saving.value = false
}

// ── Availability check ──────────────────────────────────────────────���─────────
function queueAvailabilityCheck() {
  if (availTimer) clearTimeout(availTimer)
  availability.value = null
  if (form.value.autoGenerate) return
  const v = form.value.number
  if (!SPECIAL_ID_RE.test(v)) return
  checking.value = true
  availTimer = setTimeout(async () => {
    try {
      availability.value = await api.checkAvailability(v)
    } catch {}
    checking.value = false
  }, 300)
}

function onNumberInput() {
  form.value.number = form.value.number.replace(/\D/g, '').slice(0, 6)
  queueAvailabilityCheck()
}

// ── Submit / remove ───────────────────────────────────────────────────────────
async function submit() {
  if (!modal.value || !canSave.value) return
  saving.value = true
  try {
    if (modal.value.mode === 'create') {
      const payload: any = {
        price: Number(form.value.price),
        durationDays: Number(form.value.durationDays),
        level: form.value.level,
      }
      if (!form.value.autoGenerate) payload.number = form.value.number
      await api.createSpecialId(payload)
      toast.success('Special ID created')
    } else {
      await api.updateSpecialId(modal.value.row!.id, {
        price: Number(form.value.price),
        durationDays: Number(form.value.durationDays),
        level: form.value.level,
      })
      toast.success('Special ID updated')
    }
    closeModal()
    await fetchRows()
  } catch (e: any) {
    toast.error('Save failed', e?.message)
    saving.value = false
  }
}

async function remove(row: SpecialIdRow) {
  if (!confirm(`Remove Special ID "${row.number}" (${row.level})?\n\nThis cannot be undone.`)) return
  try {
    await api.removeSpecialId(row.id)
    toast.success('Special ID removed')
    await fetchRows()
  } catch (e: any) {
    toast.error('Remove failed', e?.message)
  }
}

async function revoke(row: SpecialIdRow) {
  if (!confirm(`Revoke Special ID "${row.number}" (${row.level}) from ${row.owner?.user.displayName}?\n\nThe ID will become available again. No refund will be issued.`)) return
  try {
    await api.revokeSpecialId(row.id)
    toast.success('Special ID revoked')
    await fetchRows()
  } catch (e: any) {
    toast.error('Revoke failed', e?.message)
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function tierBadgeClass(level: string): string {
  switch (level) {
    case 'SSS': return 'badge-purple'
    case 'SS':  return 'badge-blue'
    case 'S':   return 'badge-green'
    case 'A':   return 'badge-gray'
    case 'B':   return 'badge-gray'
    default:    return 'badge-gray'
  }
}

const availableCount = computed(() => rows.value.filter(r => r.status === 'available').length)
const ownedCount = computed(() => rows.value.filter(r => r.status === 'owned').length)

onMounted(() => fetchRows())
watch(() => pagination.value.page, fetchRows)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Special ID Management</h2>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
      <span class="stat-pill stat-pill-active">Available: {{ availableCount }}</span>
      <span class="stat-pill stat-pill-owned">Owned: {{ ownedCount }}</span>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        @keyup.enter="handleSearch"
        class="search-input"
        placeholder="Search by number…"
      />
      <select v-model="levelFilter" class="select-input" @change="handleSearch">
        <option value="">All tiers</option>
        <option value="SSS">SSS</option>
        <option value="SS">SS</option>
        <option value="S">S</option>
        <option value="A">A</option>
        <option value="B">B</option>
      </select>
      <select v-model="statusFilter" class="select-input" @change="handleSearch">
        <option value="">All statuses</option>
        <option value="available">Available</option>
        <option value="owned">Owned</option>
      </select>
      <button class="btn btn-primary" @click="handleSearch">Search</button>
      <button class="btn btn-primary btn-accent" @click="openCreate">+ Create Special ID</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="rows.length === 0" class="loading">No Special IDs created yet.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Tier</th>
            <th>Price</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Created</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><code class="custom-id">{{ r.number }}</code></td>
            <td><span :class="['badge', tierBadgeClass(r.level)]">{{ r.level }}</span></td>
            <td>{{ r.price.toLocaleString() }} coins</td>
            <td>{{ r.durationDays }} days</td>
            <td>
              <span v-if="r.status === 'available'" class="badge badge-green">Available</span>
              <span v-else class="badge badge-blue">Owned</span>
            </td>
            <td>
              <div v-if="r.owner" class="user-cell">
                <img v-if="r.owner.user.avatar" :src="r.owner.user.avatar" class="avatar" />
                <div v-else class="avatar avatar-placeholder">{{ r.owner.user.displayName.charAt(0) }}</div>
                <div>
                  <div>{{ r.owner.user.displayName }}</div>
                  <div class="dim mono">{{ r.owner.status }}</div>
                </div>
              </div>
              <span v-else class="dim">—</span>
            </td>
            <td class="dim">{{ formatDate(r.createdAt) }}</td>
            <td class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem v-if="r.status === 'available'" @click="openEdit(r)">Edit</RowActionMenuItem>
                <RowActionMenuItem v-if="r.status === 'available'" variant="danger" @click="remove(r)">Remove</RowActionMenuItem>
                <RowActionMenuItem v-if="r.status === 'owned' && r.owner" @click="router.push(`/users/${r.owner.userId}`)">View User</RowActionMenuItem>
                <RowActionMenuItem v-if="r.status === 'owned' && r.owner" variant="danger" @click="revoke(r)">Revoke</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="(p: number) => pagination.page = p"
    />

    <!-- Modal -->
    <div v-if="modal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modal.mode === 'create' ? 'Create Special ID' : 'Edit Special ID' }}</h3>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">

          <!-- Number -->
          <div v-if="modal.mode === 'create'" class="field">
            <label>Number (6 digits)</label>
            <label class="checkbox-label inline" style="margin-bottom: 8px">
              <input type="checkbox" v-model="form.autoGenerate" @change="availability = null" />
              <span>Auto-generate</span>
            </label>
            <input
              v-if="!form.autoGenerate"
              v-model="form.number"
              maxlength="6"
              placeholder="e.g. 888888"
              inputmode="numeric"
              :class="{ 'has-error': formatError || (availability && !availability.available) }"
              @input="onNumberInput"
            />
            <p v-if="!form.autoGenerate && formatError" class="field-error">{{ formatError }}</p>
            <p v-else-if="!form.autoGenerate && checking" class="field-hint">Checking availability…</p>
            <p v-else-if="!form.autoGenerate && availability?.available" class="field-ok">Available</p>
            <p v-else-if="!form.autoGenerate && availability && !availability.available" class="field-error">
              Already taken
            </p>
          </div>

          <!-- Number (read-only in edit) -->
          <div v-else class="field">
            <label>Number</label>
            <div class="read-only-row"><code class="custom-id">{{ form.number }}</code></div>
          </div>

          <!-- Level -->
          <div class="field">
            <label>Tier <span class="req">*</span></label>
            <select v-model="form.level" class="select-input">
              <option value="" disabled>Select tier</option>
              <option value="SSS">SSS</option>
              <option value="SS">SS</option>
              <option value="S">S</option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </div>

          <!-- Price -->
          <div class="field">
            <label>Price (coins) <span class="req">*</span></label>
            <input v-model.number="form.price" type="number" min="1" placeholder="e.g. 5000" />
          </div>

          <!-- Duration -->
          <div class="field">
            <label>Duration (days) <span class="req">*</span></label>
            <input v-model.number="form.durationDays" type="number" min="1" placeholder="e.g. 30" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">Cancel</button>
          <button class="btn btn-primary" :disabled="saving || !canSave" @click="submit">
            {{ saving ? 'Saving…' : (modal.mode === 'create' ? 'Create' : 'Update') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.page-header { display: flex; align-items: center; gap: 12px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.stat-pill-active { background: var(--success-soft, #dcfce7); color: #15803d; }
.stat-pill-owned { background: var(--info-soft, #dbeafe); color: #1E6FD9; }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.search-input {
  flex: 1; min-width: 220px; height: 38px; padding: 0 12px;
  border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px;
  background: var(--card-bg); outline: none;
}
.search-input:focus { border-color: var(--primary); }
.select-input {
  height: 38px; padding: 0 12px;
  border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px;
  background: #fff; outline: none;
}
.checkbox-label.inline { font-size: 13px; display: inline-flex; gap: 6px; align-items: center; margin: 0 4px; }

.btn { height: 38px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-secondary:hover { background: #e4e4e7; }
.btn-accent { margin-left: auto; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700;
  text-transform: uppercase; color: var(--text-muted); background: #F8FAFC;
  letter-spacing: 0.04em;
}
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.data-table tbody tr:hover { background: var(--row-hover, #F8FAFC); }

.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.avatar-placeholder {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
}
.custom-id { background: #FEF9C3; color: #854D0E; padding: 3px 8px; border-radius: 4px; font-weight: 700; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.badge { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; display: inline-block; }
.badge-purple { background: var(--primary-soft, #ede9fe); color: var(--primary-dark, #6d28d9); }
.badge-blue { background: var(--info-soft, #dbeafe); color: #1E6FD9; }
.badge-green { background: var(--success-soft, #dcfce7); color: #15803d; }
.badge-gray { background: var(--muted-soft, #f1f5f9); color: var(--text-muted); }

.actions-cell { display: flex; gap: 6px; }
.btn-sm {
  height: 28px; padding: 0 12px; font-size: 12px; border-radius: 6px;
  border: 1px solid var(--card-border); background: #fff; color: var(--text-primary); cursor: pointer; font-weight: 500;
}
.btn-sm:hover { background: #F8FAFC; border-color: #CBD5E1; }
.btn-sm.btn-danger { border-color: #FECACA; color: var(--danger); }
.btn-sm.btn-danger:hover { background: #FEF2F2; border-color: #FCA5A5; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: #fff; border-radius: 12px; width: 480px; max-width: 90vw;
  box-shadow: 0 25px 80px rgba(0,0,0,.25); overflow: hidden;
  border-top: 3px solid var(--primary);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--card-border);
}
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.modal-close {
  background: none; border: none; font-size: 22px; line-height: 1;
  color: var(--text-muted); cursor: pointer; padding: 0 4px;
}
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid var(--card-border); background: #FAFBFC;
}

.field { margin-bottom: 14px; position: relative; }
.field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
.field input, .field select {
  width: 100%; height: 38px; padding: 0 12px;
  border: 1px solid var(--card-border); border-radius: 6px;
  font-size: 14px; background: #fff; outline: none; box-sizing: border-box;
}
.field input:focus, .field select:focus { border-color: var(--primary); }
.field input.has-error { border-color: var(--danger); background: #FEF2F2; }
.field-error { margin: 4px 0 0; font-size: 11px; color: var(--danger); }
.field-ok { margin: 4px 0 0; font-size: 11px; color: #15803d; font-weight: 600; }
.field-hint { margin: 4px 0 0; font-size: 11px; color: var(--text-muted); }
.req { color: var(--danger); }
.checkbox-label { display: flex; align-items: flex-start; gap: 8px; font-weight: 400; cursor: pointer; font-size: 13px; }
.checkbox-label input { width: auto; height: auto; margin-top: 3px; }

.read-only-row {
  padding: 9px 12px; background: #F8FAFC; border-radius: 6px; font-size: 13px;
  border: 1px solid var(--card-border);
}
</style>
