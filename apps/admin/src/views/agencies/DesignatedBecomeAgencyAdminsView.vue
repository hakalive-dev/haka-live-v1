<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as api from '@/api/designatedBecomeAgencyAdmins'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const rows = ref<api.DesignatedBecomeAgencyAdmin[]>([])
const loading = ref(true)

const addModal = ref(false)
const addHakaId = ref('')
const addSortOrder = ref(0)
const addLoading = ref(false)
const addError = ref('')

const deleteConfirm = ref<api.DesignatedBecomeAgencyAdmin | null>(null)
const deleteLoading = ref(false)

const canManage = computed(() => auth.hasPermission('agency.manage'))
const visibleCount = computed(() => rows.value.filter(r => r.isActive).length)

async function fetchRows() {
  loading.value = true
  try {
    rows.value = await api.listDesignatedBecomeAgencyAdmins()
  } catch (e: any) {
    rows.value = []
    toast.error('Failed to load', e?.message ?? 'Request failed')
  }
  loading.value = false
}

onMounted(fetchRows)

function openAdd() {
  addHakaId.value = ''
  addSortOrder.value = rows.value.length
  addError.value = ''
  addModal.value = true
}

async function submitAdd() {
  addError.value = ''
  addLoading.value = true
  try {
    await api.createDesignatedBecomeAgencyAdmin({
      hakaId: addHakaId.value.trim(),
      sortOrder: addSortOrder.value,
    })
    toast.success('Admin added', 'Visible in mobile Become Agency')
    addModal.value = false
    await fetchRows()
  } catch (e: any) {
    addError.value = e?.message ?? 'Failed to add admin'
  }
  addLoading.value = false
}

async function toggleActive(row: api.DesignatedBecomeAgencyAdmin) {
  if (!canManage.value) return
  try {
    await api.updateDesignatedBecomeAgencyAdmin(row.id, { isActive: !row.isActive })
    toast.success(row.isActive ? 'Hidden from Become Agency' : 'Visible in Become Agency')
    await fetchRows()
  } catch (e: any) {
    toast.error('Update failed', e?.message)
  }
}

async function updateSortOrder(row: api.DesignatedBecomeAgencyAdmin, sortOrder: number) {
  if (!canManage.value || Number.isNaN(sortOrder) || sortOrder < 0) return
  try {
    await api.updateDesignatedBecomeAgencyAdmin(row.id, { sortOrder })
    await fetchRows()
  } catch {
    toast.error('Failed to update sort order')
  }
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  deleteLoading.value = true
  try {
    await api.deleteDesignatedBecomeAgencyAdmin(deleteConfirm.value.id)
    toast.success('Admin removed')
    deleteConfirm.value = null
    await fetchRows()
  } catch (e: any) {
    toast.error('Delete failed', e?.message)
  }
  deleteLoading.value = false
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ')
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Become Agency Admins</h1>
        <p class="page-sub">
          Staff Haka IDs shown in the mobile Become Agency picker. Root applications under these admins are auto-approved.
        </p>
      </div>
      <button v-if="canManage" class="btn btn-primary" @click="openAdd">+ Add Admin</button>
    </div>

    <p class="page-hint">
      Staff must already exist in Admin Management with a <strong>Haka ID</strong> set. Adding them here only controls mobile visibility — it does not create a staff account.
    </p>

    <div class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Designated admins</h2>
          <p class="card-sub">
            {{ rows.length }} configured · {{ visibleCount }} visible in app
          </p>
        </div>
        <button class="btn btn-outline btn-sm" @click="fetchRows">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading designated admins…</div>

      <div v-else-if="rows.length === 0" class="empty">
        <div class="empty-icon">🛡️</div>
        <div class="empty-title">No designated admins yet</div>
        <div class="empty-sub">
          Add staff by Haka ID to show them in the mobile Become Agency section.
        </div>
        <button v-if="canManage" class="btn btn-primary empty-action" @click="openAdd">
          + Add Admin
        </button>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Staff</th>
            <th>Haka ID</th>
            <th>Role</th>
            <th>Region</th>
            <th>Sort</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <div class="user-cell">
                <span class="fw">{{ row.admin.displayName }}</span>
                <span class="dim">Staff account</span>
              </div>
            </td>
            <td class="mono fw">{{ row.admin.hakaId ?? '—' }}</td>
            <td>
              <span class="badge badge-blue">{{ roleLabel(row.admin.role) }}</span>
            </td>
            <td class="dim">{{ row.admin.region ?? '—' }}</td>
            <td>
              <input
                v-if="canManage"
                type="number"
                class="sort-input"
                :value="row.sortOrder"
                min="0"
                @change="updateSortOrder(row, Number(($event.target as HTMLInputElement).value))"
              />
              <span v-else class="dim">{{ row.sortOrder }}</span>
            </td>
            <td>
              <span
                class="badge"
                :class="row.isActive && row.admin.isActive ? 'badge-green' : 'badge-yellow'"
              >
                {{ row.isActive && row.admin.isActive ? 'Visible' : 'Hidden' }}
              </span>
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu v-if="canManage">
                <RowActionMenuItem @click="toggleActive(row)">
                  {{ row.isActive ? 'Hide from app' : 'Show in app' }}
                </RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="deleteConfirm = row">
                  Remove
                </RowActionMenuItem>
              </RowActionMenu>
              <span v-else class="dim">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="addModal" class="modal-overlay" @click.self="addModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Add Become Agency Admin</h3>
          <button class="btn-close" @click="addModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Enter the staff member&apos;s Haka ID. They must already have a Haka ID on their admin account in Admin Management or Staff.
          </p>
          <div class="form-group">
            <label>Staff Haka ID</label>
            <input
              v-model="addHakaId"
              class="form-input"
              placeholder="e.g. HK123456"
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label>Sort order</label>
            <input v-model.number="addSortOrder" type="number" min="0" class="form-input" />
            <span class="hint-label">Lower numbers appear first in the mobile list.</span>
          </div>
          <div v-if="addError" class="form-error">{{ addError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="addModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="addLoading || !addHakaId.trim()"
            @click="submitAdd"
          >
            {{ addLoading ? 'Adding…' : 'Add Admin' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Remove from list</h3>
          <button class="btn-close" @click="deleteConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Remove <strong>{{ deleteConfirm.admin.displayName }}</strong>
            (<span class="mono">{{ deleteConfirm.admin.hakaId }}</span>) from the mobile Become Agency picker?
            Their staff account is not deleted.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Removing…' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}
.page-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
.page-sub { font-size: 13px; color: var(--text-muted); margin: 0; max-width: 640px; line-height: 1.5; }
.page-hint {
  margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.5;
  padding: 12px 16px; background: var(--content-bg); border: 1px solid var(--border);
  border-radius: 10px;
}

.table-card {
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border); gap: 16px; flex-wrap: wrap;
}
.card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
.card-sub { font-size: 12px; color: var(--text-muted); margin: 0; }

.loading { padding: 32px; text-align: center; color: var(--text-muted); font-size: 14px; }

.empty {
  text-align: center; padding: 56px 24px;
}
.empty-icon { font-size: 44px; margin-bottom: 12px; }
.empty-title { font-size: 17px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
.empty-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }
.empty-action { margin-top: 4px; }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 10px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); border-bottom: 1px solid var(--border); text-align: left;
}
.data-table th.actions-th { text-align: right; width: 80px; }
.data-table td {
  padding: 12px 16px; font-size: 13px; border-bottom: 1px solid var(--border-subtle, var(--border));
  vertical-align: middle;
}
.data-table td.actions-td { text-align: right; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: var(--row-hover, rgba(255,255,255,0.03)); }

.user-cell { display: flex; flex-direction: column; gap: 2px; }
.fw { font-weight: 600; color: var(--text-primary); }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: ui-monospace, monospace; }

.sort-input {
  width: 72px; height: 32px; padding: 0 8px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--input-bg, var(--content-bg)); color: var(--text-primary); font-size: 13px;
}

.badge {
  display: inline-block; padding: 2px 8px; border-radius: 20px;
  font-size: 11px; font-weight: 600; text-transform: capitalize;
}
.badge-blue { background: #3b82f622; color: #3b82f6; }
.badge-green { background: #10b98122; color: #10b981; }
.badge-yellow { background: #f59e0b22; color: #f59e0b; }

.btn {
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
  border: none; cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border, var(--border)); }
.btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
.btn-outline:hover:not(:disabled) { background: var(--row-hover, rgba(255,255,255,0.05)); }
.btn-danger { background: #FF4D4D; color: #fff; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9000;
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal-box {
  background: var(--card-bg); border-radius: 16px; width: min(480px, 100%);
  box-shadow: 0 20px 60px rgba(0,0,0,0.25); overflow: hidden;
  display: flex; flex-direction: column; max-height: 90vh;
  border: 1px solid var(--border);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--border);
}
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-primary); }
.btn-close {
  background: var(--content-bg); border: 1px solid var(--border); border-radius: 6px;
  width: 28px; height: 28px; cursor: pointer; color: var(--text-muted);
}
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.modal-footer {
  padding: 16px 24px; border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end; gap: 8px;
}
.modal-sub { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.5; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.form-input {
  height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; background: var(--content-bg); color: var(--text-primary);
}
.form-error {
  background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px;
}
.hint-label { font-size: 11px; font-weight: 500; color: var(--text-muted); }
</style>
