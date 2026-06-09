<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listRegions, createRegion, updateRegion, deleteRegion } from '@/api/regions'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const regions = ref<any[]>([])
const code = ref('')
const name = ref('')
const saving = ref(false)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await listRegions()
    regions.value = res.items
  } catch {
    toast.error('Failed to load regions')
  } finally {
    loading.value = false
  }
}

async function add() {
  if (!code.value || !name.value) return
  saving.value = true
  try {
    await createRegion(code.value.toUpperCase(), name.value)
    toast.success('Region created')
    code.value = ''
    name.value = ''
    await load()
  } catch {
    toast.error('Failed to create region')
  } finally {
    saving.value = false
  }
}

async function toggle(r: any) {
  try {
    await updateRegion(r.code, { isActive: !r.isActive })
    await load()
  } catch {
    toast.error('Failed to update region')
  }
}

async function remove(r: any) {
  if (!confirm(`Delete region ${r.code}?`)) return
  try {
    await deleteRegion(r.code)
    toast.success('Region deleted')
    await load()
  } catch {
    toast.error('Failed to delete region')
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Manage Regions</h2>
        <div class="page-sub">Region codes used for staff and agency scoping</div>
      </div>
    </div>

    <div class="section-card">
      <h3 class="section-title">Add Region</h3>
      <div class="add-form">
        <div class="form-group">
          <label>Code</label>
          <input
            v-model="code"
            class="form-input code-input"
            placeholder="e.g. SEA"
            maxlength="16"
            @keyup.enter="add"
          />
        </div>
        <div class="form-group flex-1">
          <label>Name</label>
          <input v-model="name" class="form-input" placeholder="Region name" @keyup.enter="add" />
        </div>
        <button class="btn btn-primary" :disabled="saving || !code || !name" @click="add">
          {{ saving ? 'Adding…' : 'Add Region' }}
        </button>
      </div>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading regions…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in regions" :key="r.code">
            <td class="mono fw">{{ r.code }}</td>
            <td>{{ r.name }}</td>
            <td>
              <span :class="r.isActive ? 'status-active' : 'status-inactive'">
                {{ r.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem
                  :variant="r.isActive ? 'warning' : 'success'"
                  @click="toggle(r)"
                >
                  {{ r.isActive ? 'Deactivate' : 'Activate' }}
                </RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="remove(r)">Delete</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="regions.length === 0">
            <td colspan="4" class="empty">No regions defined.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.page-sub { margin-top: 3px; font-size: 12px; color: var(--text-muted); }

.section-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section-title { margin: 0; font-size: 15px; font-weight: 600; }

.add-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group.flex-1 { flex: 1; min-width: 200px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.code-input { width: 120px; text-transform: uppercase; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; height: 38px; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.mono { font-family: monospace; }
.fw { font-weight: 500; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }

.status-active { color: #22C97A; font-weight: 700; font-size: 12px; }
.status-inactive { color: var(--text-muted); font-weight: 600; font-size: 12px; }
</style>
