<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as rolesApi from '@/api/roles'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const roles = ref<any[]>([])
const loading = ref(true)

// Permission groups for the checkbox UI
const PERMISSION_GROUPS = [
  {
    label: 'Dashboard',
    perms: [{ key: 'dashboard.view', label: 'View Dashboard' }],
  },
  {
    label: 'Users',
    perms: [
      { key: 'user.view', label: 'View Users' },
      { key: 'user.edit', label: 'Edit Users' },
      { key: 'user.ban', label: 'Permanent Ban' },
      { key: 'user.ban_temp', label: 'Temporary Ban' },
      { key: 'user.delete', label: 'Delete Users' },
      { key: 'user.adjust_balance', label: 'Adjust Balance' },
      { key: 'user.mute', label: 'Mute Users' },
      { key: 'user.verify', label: 'Verify Users' },
    ],
  },
  {
    label: 'Admin / Staff',
    perms: [
      { key: 'admin.view', label: 'View Staff' },
      { key: 'admin.create', label: 'Create Staff' },
      { key: 'admin.edit_role', label: 'Edit Staff Role' },
      { key: 'admin.deactivate', label: 'Deactivate Staff' },
      { key: 'admin.custom_roles', label: 'Manage Custom Roles' },
    ],
  },
  {
    label: 'Rooms',
    perms: [
      { key: 'room.view', label: 'View Rooms' },
      { key: 'room.close', label: 'Force Close Room' },
      { key: 'room.monitor', label: 'Monitor Rooms' },
    ],
  },
  {
    label: 'Gifts',
    perms: [
      { key: 'gift.view', label: 'View Gifts' },
      { key: 'gift.manage', label: 'Manage Gifts' },
    ],
  },
  {
    label: 'Payments',
    perms: [
      { key: 'payment.view', label: 'View Payments' },
      { key: 'payment.manage', label: 'Manage Payments' },
      { key: 'payment.withdrawal', label: 'Approve Withdrawals' },
    ],
  },
  {
    label: 'Reports & Moderation',
    perms: [
      { key: 'report.view', label: 'View Reports' },
      { key: 'report.handle', label: 'Handle Reports' },
    ],
  },
  {
    label: 'Settings',
    perms: [
      { key: 'settings.view', label: 'View Settings' },
      { key: 'settings.edit', label: 'Edit Settings' },
    ],
  },
  {
    label: 'Audit',
    perms: [{ key: 'audit.view', label: 'View Audit Log' }],
  },
  {
    label: 'Analytics',
    perms: [
      { key: 'analytics.view', label: 'View Analytics' },
      { key: 'analytics.full', label: 'Full Analytics' },
    ],
  },
  {
    label: 'Agencies',
    perms: [
      { key: 'agency.view', label: 'View Agencies' },
      { key: 'agency.manage', label: 'Manage Agencies' },
    ],
  },
  {
    label: 'Events',
    perms: [
      { key: 'event.view', label: 'View Events' },
      { key: 'event.manage', label: 'Manage Events' },
    ],
  },
  {
    label: 'Banners',
    perms: [
      { key: 'banner.view', label: 'View Banners' },
      { key: 'banner.manage', label: 'Manage Banners' },
    ],
  },
  {
    label: 'Host Applications',
    perms: [
      { key: 'host_app.view', label: 'View Applications' },
      { key: 'host_app.manage', label: 'Manage Applications' },
    ],
  },
  {
    label: 'Games',
    perms: [
      { key: 'game.view', label: 'View Games' },
      { key: 'game.manage', label: 'Manage Games' },
    ],
  },
]

// Create modal
const createModal = ref(false)
const createForm = ref({ name: '', displayName: '', color: '#7B4FFF', permissions: [] as string[] })
const createLoading = ref(false)
const createError = ref('')

// Edit modal
const editModal = ref<any>(null)
const editForm = ref({ displayName: '', color: '#7B4FFF', permissions: [] as string[] })
const editLoading = ref(false)
const editError = ref('')

// Delete confirm
const deleteConfirm = ref<any>(null)
const deleteLoading = ref(false)

async function fetchRoles() {
  loading.value = true
  try {
    roles.value = await rolesApi.listCustomRoles()
  } catch {}
  loading.value = false
}

async function submitCreate() {
  createError.value = ''
  createLoading.value = true
  try {
    await rolesApi.createCustomRole(createForm.value)
    toast.success('Role Created', `"${createForm.value.displayName}" is ready to assign.`)
    createModal.value = false
    createForm.value = { name: '', displayName: '', color: '#7B4FFF', permissions: [] }
    await fetchRoles()
  } catch (e: any) { createError.value = e?.message || 'Failed' }
  createLoading.value = false
}

function openEdit(role: any) {
  editModal.value = role
  editForm.value = { displayName: role.displayName, color: role.color, permissions: [...role.permissions] }
}

async function submitEdit() {
  if (!editModal.value) return
  editError.value = ''
  editLoading.value = true
  try {
    await rolesApi.updateCustomRole(editModal.value.name, editForm.value)
    toast.success('Role Updated')
    editModal.value = null
    await fetchRoles()
  } catch (e: any) { editError.value = e?.message || 'Failed' }
  editLoading.value = false
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  deleteLoading.value = true
  try {
    await rolesApi.deleteCustomRole(deleteConfirm.value.name)
    toast.success('Role Deleted')
    deleteConfirm.value = null
    await fetchRoles()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

function togglePermission(perms: string[], key: string) {
  const idx = perms.indexOf(key)
  if (idx === -1) perms.push(key)
  else perms.splice(idx, 1)
}

onMounted(fetchRoles)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Custom Roles</h2>
        <p class="page-sub">Create roles with tailored permission sets for staff members.</p>
      </div>
      <button class="btn btn-primary" @click="createModal = true">+ New Custom Role</button>
    </div>

    <div v-if="loading" class="loading">Loading roles...</div>

    <div v-else-if="roles.length === 0" class="empty">
      <div class="empty-icon">🔑</div>
      <div class="empty-title">No custom roles yet</div>
      <div class="empty-sub">Create a custom role to assign unique permission sets to staff.</div>
    </div>

    <div v-else class="roles-grid">
      <div v-for="role in roles" :key="role.id" class="role-card">
        <div class="role-card-header">
          <div class="role-dot" :style="{ background: role.color }"></div>
          <div class="role-info">
            <div class="role-display-name">{{ role.displayName }}</div>
            <div class="role-name-slug">{{ role.name }}</div>
          </div>
          <div class="role-actions">
            <button class="btn-row" @click="openEdit(role)">Edit</button>
            <button class="btn-row danger" @click="deleteConfirm = role">Delete</button>
          </div>
        </div>
        <div class="role-perms">
          <span v-for="p in role.permissions" :key="p" class="perm-chip">{{ p }}</span>
          <span v-if="role.permissions.length === 0" class="no-perms">No permissions</span>
        </div>
        <div class="role-meta">Created by {{ role.createdBy }} · {{ new Date(role.createdAt).toLocaleDateString() }}</div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Create modal -->
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Create Custom Role</h3>
          <button class="btn-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Role Name (slug)</label>
              <input v-model="createForm.name" class="form-input" placeholder="e.g. content_manager" />
              <span class="form-hint">Lowercase letters, numbers, underscores only</span>
            </div>
            <div class="form-group">
              <label>Display Name</label>
              <input v-model="createForm.displayName" class="form-input" placeholder="e.g. Content Manager" />
            </div>
            <div class="form-group form-group-sm">
              <label>Color</label>
              <input v-model="createForm.color" type="color" class="form-input form-color" />
            </div>
          </div>
          <div class="perms-section">
            <div class="perms-title">Permissions</div>
            <div class="perms-groups">
              <div v-for="group in PERMISSION_GROUPS" :key="group.label" class="perm-group">
                <div class="perm-group-label">{{ group.label }}</div>
                <label v-for="perm in group.perms" :key="perm.key" class="perm-check">
                  <input
                    type="checkbox"
                    :checked="createForm.permissions.includes(perm.key)"
                    @change="togglePermission(createForm.permissions, perm.key)"
                  />
                  {{ perm.label }}
                </label>
              </div>
            </div>
          </div>
          <div v-if="createError" class="form-error">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="createModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Creating...' : 'Create Role' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <div v-if="editModal" class="modal-overlay" @click.self="editModal = null">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Edit Role: {{ editModal.name }}</h3>
          <button class="btn-close" @click="editModal = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Display Name</label>
              <input v-model="editForm.displayName" class="form-input" />
            </div>
            <div class="form-group form-group-sm">
              <label>Color</label>
              <input v-model="editForm.color" type="color" class="form-input form-color" />
            </div>
          </div>
          <div class="perms-section">
            <div class="perms-title">Permissions</div>
            <div class="perms-groups">
              <div v-for="group in PERMISSION_GROUPS" :key="group.label" class="perm-group">
                <div class="perm-group-label">{{ group.label }}</div>
                <label v-for="perm in group.perms" :key="perm.key" class="perm-check">
                  <input
                    type="checkbox"
                    :checked="editForm.permissions.includes(perm.key)"
                    @change="togglePermission(editForm.permissions, perm.key)"
                  />
                  {{ perm.label }}
                </label>
              </div>
            </div>
          </div>
          <div v-if="editError" class="form-error">{{ editError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="editModal = null">Cancel</button>
          <button class="btn btn-primary" :disabled="editLoading" @click="submitEdit">
            {{ editLoading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Delete Custom Role</h3>
          <button class="btn-close" @click="deleteConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Delete <strong>{{ deleteConfirm.displayName }}</strong>? Any staff on this role will be
            reassigned to <strong>Moderator</strong>.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Deleting...' : 'Delete Role' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
.page-sub { margin: 0; font-size: 13px; color: var(--text-muted); }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger { background: #FF4D4D; color: #fff; }
.loading { text-align: center; padding: 40px; color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: var(--text-muted); }

.roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.role-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; }
.role-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.role-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.role-info { flex: 1; }
.role-display-name { font-size: 15px; font-weight: 600; }
.role-name-slug { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.role-actions { display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; }
.btn-row.danger { color: #FF4D4D; border-color: #FF4D4D; }
.btn-row:hover { background: var(--row-hover); }
.role-perms { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.perm-chip { padding: 2px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 4px; font-size: 11px; font-family: monospace; }
.no-perms { font-size: 12px; color: var(--text-muted); font-style: italic; }
.role-meta { font-size: 11px; color: var(--text-muted); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.modal-wide { width: min(800px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); }
.form-row { display: flex; gap: 12px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.form-group-sm { flex: 0 0 80px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-hint { font-size: 11px; color: var(--text-muted); }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-color { padding: 2px 4px; height: 38px; cursor: pointer; }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }

.perms-section { border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; }
.perms-title { padding: 10px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: var(--content-bg); border-bottom: 1px solid var(--card-border); }
.perms-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0; padding: 12px 14px; gap: 10px; }
.perm-group { display: flex; flex-direction: column; gap: 4px; }
.perm-group-label { font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.perm-check { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; user-select: none; }
.perm-check input { accent-color: var(--primary); cursor: pointer; }
</style>
