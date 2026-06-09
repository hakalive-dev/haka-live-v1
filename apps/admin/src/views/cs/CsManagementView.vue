<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listCs } from '@/api/cs'
import { listRegions } from '@/api/regions'
import { createAdmin, deactivateAdmin, reactivateAdmin } from '@/api/staff'
import { exportToCsv } from '@/lib/exportCsv'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const cs = ref<any[]>([])
const regions = ref<any[]>([])
const regionFilter = ref('')
const loading = ref(false)

const addModal = ref(false)
const form = ref({ email: '', password: '', displayName: '', region: '', hakaId: '' })
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const params = regionFilter.value ? { region: regionFilter.value } : {}
    cs.value = (await listCs(params)).items
  } catch {
    toast.error('Failed to load CS list')
  } finally {
    loading.value = false
  }
}

async function addCs() {
  saving.value = true
  try {
    await createAdmin({ ...form.value, role: 'cs' })
    toast.success('CS member created')
    addModal.value = false
    form.value = { email: '', password: '', displayName: '', region: '', hakaId: '' }
    await load()
  } catch {
    toast.error('Failed to create CS member')
  } finally {
    saving.value = false
  }
}

async function toggle(row: any) {
  try {
    if (row.isActive) await deactivateAdmin(row.id)
    else await reactivateAdmin(row.id)
    toast.success(`CS member ${row.isActive ? 'suspended' : 'reactivated'}`)
    await load()
  } catch {
    toast.error('Action failed')
  }
}

function exportCsv() {
  exportToCsv(cs.value, [
    { header: 'Name', value: r => r.displayName },
    { header: 'Email', value: r => r.email },
    { header: 'Haka ID', value: r => r.hakaId },
    { header: 'Region', value: r => r.region },
    { header: 'Active', value: r => r.isActive ? 'Yes' : 'No' },
  ], 'cs-list')
}

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
        <h2 class="page-title">CS Management</h2>
        <div class="page-sub">Customer support staff accounts and region assignments</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-primary" @click="addModal = true">+ Add CS</button>
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
      <div v-if="loading" class="loading">Loading CS members…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Haka ID</th>
            <th>Region</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in cs" :key="row.id">
            <td class="fw">{{ row.displayName }}</td>
            <td class="dim">{{ row.email }}</td>
            <td class="dim mono">{{ row.hakaId ?? '—' }}</td>
            <td>{{ row.region ?? '—' }}</td>
            <td>
              <span :class="row.isActive ? 'status-active' : 'status-inactive'">
                {{ row.isActive ? 'Active' : 'Suspended' }}
              </span>
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem
                  :variant="row.isActive ? 'warning' : 'success'"
                  @click="toggle(row)"
                >
                  {{ row.isActive ? 'Suspend' : 'Reactivate' }}
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="cs.length === 0">
            <td colspan="6" class="empty">No CS members found.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="addModal" class="modal-overlay" @click.self="addModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Add CS Member</h3>
          <button class="btn-close" @click="addModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Email *</label>
            <input v-model="form.email" type="email" class="form-input" placeholder="Email" />
          </div>
          <div class="form-group">
            <label>Password *</label>
            <input v-model="form.password" type="password" class="form-input" placeholder="Password" />
          </div>
          <div class="form-group">
            <label>Display Name *</label>
            <input v-model="form.displayName" class="form-input" placeholder="Display Name" />
          </div>
          <div class="form-group">
            <label>Haka ID</label>
            <input v-model="form.hakaId" class="form-input" placeholder="Haka ID (optional)" />
          </div>
          <div class="form-group">
            <label>Region</label>
            <select v-model="form.region" class="form-input">
              <option value="">No Region</option>
              <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name ?? r.code }}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="addModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="saving" @click="addCs">
            {{ saving ? 'Creating…' : 'Create' }}
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
.mono { font-family: monospace; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }

.status-active { color: #22C97A; font-weight: 700; font-size: 12px; }
.status-inactive { color: #FF4D4D; font-weight: 700; font-size: 12px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
select.form-input { cursor: pointer; }
</style>
