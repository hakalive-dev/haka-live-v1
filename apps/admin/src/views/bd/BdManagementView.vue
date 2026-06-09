<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAdminRealtime } from '@/composables/useAdminRealtime'
import { useRouter } from 'vue-router'
import * as bdApi from '@/api/bd'
import { listAdminsForManagement, listAgencies } from '@/api/agencies'
import { listRegions } from '@/api/regions'
import { exportToCsv } from '@/lib/exportCsv'
import { formatFieldErrors, fieldErrorsOf } from '@/lib/formErrors'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const BD_FIELD_LABELS: Record<string, string> = {
  email: 'Email', password: 'Password', displayName: 'Display name', appUser: 'App user',
  region: 'Region', managerId: 'Manager', username: 'Username', phone: 'Phone', country: 'Country',
}

const router = useRouter()
const toast = useToastStore()
const bds = ref<any[]>([])
const regions = ref<any[]>([])
const regionFilter = ref('')
const loading = ref(false)

const createModal = ref(false)
const createLoading = ref(false)
const createForm = ref({
  email: '',
  password: '',
  displayName: '',
  role: 'senior_bd' as 'senior_bd' | 'bd',
  region: '',
  managerId: '',
  username: '',
  phone: '',
  country: '',
  appUserMode: 'link' as 'link' | 'create',
  appUserHakaId: '',
  newAppDisplayName: '',
  newAppPhone: '',
  agencyIds: [] as string[],
})
const managers = ref<{ id: string; displayName: string }[]>([])
const unassignedAgencies = ref<any[]>([])
const createErrors = ref<Record<string, string>>({})

async function loadUnassignedAgencies() {
  try {
    const res = await listAgencies({ unassigned: true, limit: 100 })
    unassignedAgencies.value = res.items ?? res.data ?? []
  } catch {
    unassignedAgencies.value = []
  }
}

// Client-side mirror of the backend Zod schema so the user gets specific, inline
// feedback instead of a generic "Validation failed".
function validateCreate(f: typeof createForm.value): boolean {
  const errs: Record<string, string> = {}
  if (!f.displayName.trim()) errs.displayName = 'Display name is required'
  if (!f.email.trim()) errs.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errs.email = 'Enter a valid email'
  if (!f.password || f.password.length < 8) errs.password = 'Password must be at least 8 characters'
  if (f.phone.trim() && (f.phone.trim().length < 3 || f.phone.trim().length > 30)) {
    errs.phone = 'Phone must be 3–30 characters'
  }
  if (f.appUserMode === 'link') {
    if (!f.appUserHakaId.trim()) errs.appUserHakaId = 'App user Haka ID is required to link an existing account'
  } else {
    if (!f.newAppDisplayName.trim() && !f.displayName.trim()) {
      errs.newAppDisplayName = 'App display name is required'
    }
    if (f.newAppPhone.trim() && (f.newAppPhone.trim().length < 3 || f.newAppPhone.trim().length > 30)) {
      errs.newAppPhone = 'Phone must be 3–30 characters'
    }
  }
  createErrors.value = errs
  return Object.keys(errs).length === 0
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    senior_bd: 'Senior BD',
    bd: 'Junior BD',
    bdm: 'BDM',
  }
  return map[role] ?? role
}

async function loadManagers() {
  const f = createForm.value
  try {
    if (f.role === 'senior_bd') {
      const res = await listAdminsForManagement()
      const items = res.items ?? res ?? []
      managers.value = items.map((a: any) => ({
        id: a.id,
        displayName: a.displayName ?? a.email,
      }))
    } else {
      const res = await bdApi.listBds({})
      managers.value = (res.items ?? [])
        .filter((b: any) => {
          const rs: string[] = b.roles?.length ? b.roles : [b.role]
          return rs.includes('senior_bd') || rs.includes('bdm')
        })
        .map((b: any) => ({ id: b.id, displayName: b.displayName }))
    }
  } catch {
    managers.value = []
  }
}

watch(() => createForm.value.role, () => {
  createForm.value.managerId = ''
  if (createModal.value) loadManagers()
})

function openCreate() {
  createForm.value = {
    email: '',
    password: '',
    displayName: '',
    role: 'senior_bd',
    region: '',
    managerId: '',
    username: '',
    phone: '',
    country: '',
    appUserMode: 'link',
    appUserHakaId: '',
    newAppDisplayName: '',
    newAppPhone: '',
    agencyIds: [],
  }
  createErrors.value = {}
  createModal.value = true
  loadManagers()
  loadUnassignedAgencies()
}

async function submitCreate() {
  const f = createForm.value
  if (!validateCreate(f)) {
    toast.error('Please fix the highlighted fields')
    return
  }
  const appUser =
    f.appUserMode === 'link'
      ? { mode: 'link' as const, hakaId: f.appUserHakaId.trim() }
      : {
          mode: 'create' as const,
          displayName: f.newAppDisplayName.trim() || f.displayName.trim(),
          phone: f.newAppPhone.trim() || undefined,
        }
  createLoading.value = true
  try {
    const res: any = await bdApi.createBd({
      email: f.email,
      password: f.password,
      displayName: f.displayName,
      role: f.role,
      region: f.region || undefined,
      managerId: f.managerId || undefined,
      username: f.username || undefined,
      phone: f.phone || undefined,
      country: f.country || undefined,
      appUser,
      agencyIds: f.agencyIds.length ? f.agencyIds : undefined,
    })
    toast.success(res?.merged ? 'BD role added to existing account' : 'BD created')
    createModal.value = false
    createErrors.value = {}
    await load()
  } catch (e: any) {
    const fe = fieldErrorsOf(e)
    if (fe) toast.error('Validation failed', formatFieldErrors(fe, BD_FIELD_LABELS))
    else toast.error(e?.message || 'Failed to create BD')
  } finally {
    createLoading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = {}
    if (regionFilter.value) params.region = regionFilter.value
    const res = await bdApi.listBds(params)
    bds.value = res.items
  } catch {
    toast.error('Failed to load BD list')
  } finally {
    loading.value = false
  }
}

async function toggleActive(b: any) {
  try {
    if (b.isActive) await bdApi.suspendBd(b.id)
    else await bdApi.reactivateBd(b.id)
    toast.success(`BD ${b.isActive ? 'suspended' : 'reactivated'}`)
    await load()
  } catch {
    toast.error('Action failed')
  }
}

function exportCsv() {
  exportToCsv(bds.value, [
    { header: 'Name', value: r => r.displayName },
    { header: 'Email', value: r => r.email },
    { header: 'Region', value: r => r.region },
    { header: 'Agencies', value: r => r.agencyCount },
    { header: 'Active', value: r => r.isActive ? 'Yes' : 'No' },
  ], 'bd-list')
}

useAdminRealtime('bd_management', load)

onMounted(async () => {
  const res = await listRegions().catch(() => ({ items: [] }))
  regions.value = res.items
  await load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">BD Management</h2>
        <div class="page-sub">Business development staff and agency assignments</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-primary" @click="openCreate">+ Add BD</button>
        <button class="btn btn-secondary" @click="exportCsv">Export CSV</button>
      </div>
    </div>

    <div class="filter-bar">
      <select v-model="regionFilter" class="form-input filter-select" @change="load">
        <option value="">All Regions</option>
        <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name ?? r.code }}</option>
      </select>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading BDs…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Region</th>
            <th>Role</th>
            <th>Agencies</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bds" :key="b.id">
            <td class="fw">{{ b.displayName }}</td>
            <td class="dim">{{ b.email }}</td>
            <td>{{ b.region ?? '—' }}</td>
            <td>
              <span v-for="r in (b.roles && b.roles.length ? b.roles : [b.role])" :key="r" class="role-pill">
                {{ roleLabel(r) }}
              </span>
            </td>
            <td class="fw">{{ b.agencyCount }}</td>
            <td>
              <span :class="b.isActive ? 'status-active' : 'status-inactive'">
                {{ b.isActive ? 'Active' : 'Suspended' }}
              </span>
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="router.push(`/bd/${b.id}`)">View</RowActionMenuItem>
                <RowActionMenuItem
                  :variant="b.isActive ? 'warning' : 'success'"
                  @click="toggleActive(b)"
                >
                  {{ b.isActive ? 'Suspend' : 'Reactivate' }}
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="bds.length === 0">
            <td colspan="7" class="empty">No BDs found.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Add BD</h3>
          <button class="btn-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Display Name *</label>
              <input v-model="createForm.displayName" class="form-input" :class="{ invalid: createErrors.displayName }" />
              <span v-if="createErrors.displayName" class="field-error">{{ createErrors.displayName }}</span>
            </div>
            <div class="form-group">
              <label>Email *</label>
              <input v-model="createForm.email" type="email" class="form-input" :class="{ invalid: createErrors.email }" />
              <span v-if="createErrors.email" class="field-error">{{ createErrors.email }}</span>
            </div>
          </div>
          <div class="form-group">
            <label>Password * <span class="form-hint">(min 8 characters)</span></label>
            <input v-model="createForm.password" type="password" class="form-input" :class="{ invalid: createErrors.password }" />
            <span v-if="createErrors.password" class="field-error">{{ createErrors.password }}</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Role</label>
              <select v-model="createForm.role" class="form-input">
                <option value="senior_bd">Senior BD</option>
                <option value="bd">Junior BD</option>
              </select>
            </div>
            <div class="form-group">
              <label>Manager</label>
              <select v-model="createForm.managerId" class="form-input">
                <option value="">— Select —</option>
                <option v-for="m in managers" :key="m.id" :value="m.id">{{ m.displayName }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Region</label>
            <input v-model="createForm.region" class="form-input" placeholder="e.g. SEA" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username</label>
              <input v-model="createForm.username" class="form-input" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input v-model="createForm.phone" class="form-input" :class="{ invalid: createErrors.phone }" />
              <span v-if="createErrors.phone" class="field-error">{{ createErrors.phone }}</span>
            </div>
          </div>
          <div class="form-group">
            <label>Country</label>
            <input v-model="createForm.country" class="form-input" />
          </div>
          <div class="form-group">
            <label>App user (BD Haka ID) *</label>
            <span class="form-hint">If this Haka ID already has a staff account, the BD role is added to it.</span>
            <div class="radio-row">
              <label class="radio-label">
                <input v-model="createForm.appUserMode" type="radio" value="link" />
                Link Haka ID
              </label>
              <label class="radio-label">
                <input v-model="createForm.appUserMode" type="radio" value="create" />
                New app account
              </label>
            </div>
            <template v-if="createForm.appUserMode === 'link'">
              <input
                v-model="createForm.appUserHakaId"
                class="form-input"
                :class="{ invalid: createErrors.appUserHakaId }"
                placeholder="Haka ID"
              />
              <span v-if="createErrors.appUserHakaId" class="field-error">{{ createErrors.appUserHakaId }}</span>
            </template>
            <template v-else>
              <input
                v-model="createForm.newAppDisplayName"
                class="form-input"
                :class="{ invalid: createErrors.newAppDisplayName }"
                placeholder="App display name"
              />
              <span v-if="createErrors.newAppDisplayName" class="field-error">{{ createErrors.newAppDisplayName }}</span>
              <input
                v-model="createForm.newAppPhone"
                class="form-input"
                :class="{ invalid: createErrors.newAppPhone }"
                placeholder="Phone (optional)"
              />
              <span v-if="createErrors.newAppPhone" class="field-error">{{ createErrors.newAppPhone }}</span>
            </template>
          </div>
          <div class="form-group">
            <label>Assign agencies <span class="form-hint">(optional — unassigned agencies only)</span></label>
            <select v-model="createForm.agencyIds" multiple class="form-input agency-multi">
              <option v-for="a in unassignedAgencies" :key="a.id" :value="a.id">
                {{ a.name }}{{ a.owner?.displayName ? ' — ' + a.owner.displayName : (a.owner?.hakaId ? ' — ' + a.owner.hakaId : '') }}
              </option>
            </select>
            <span v-if="!unassignedAgencies.length" class="form-hint">No unassigned agencies available.</span>
            <span v-else class="form-hint">Hold Ctrl/Cmd to select multiple.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="createModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Creating…' : 'Create BD' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.page-sub { margin-top: 3px; font-size: 12px; color: var(--text-muted); }
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-select { width: auto; min-width: 180px; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-secondary:hover { background: var(--row-hover); }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }

.role-pill { display: inline-block; background: var(--primary-soft); color: var(--primary); padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; margin: 0 4px 4px 0; }
.status-active { color: #22C97A; font-weight: 700; font-size: 12px; }
.status-inactive { color: #FF4D4D; font-weight: 700; font-size: 12px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-wide { width: min(640px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-input.invalid { border-color: var(--danger, #e5484d); }
select.form-input { cursor: pointer; }
.field-error { display: block; margin-top: 4px; font-size: 12px; color: var(--danger, #e5484d); }
.form-hint { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.agency-multi { height: auto; min-height: 96px; padding: 6px 8px; }

.radio-row { display: flex; gap: 16px; margin-bottom: 4px; }
.radio-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-primary); text-transform: none; letter-spacing: 0; font-weight: 400; cursor: pointer; }
.radio-label input { accent-color: var(--primary); }

@media (max-width: 768px) {
  .form-row { grid-template-columns: 1fr; }
}
</style>
