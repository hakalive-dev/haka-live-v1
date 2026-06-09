<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import * as staffApi from '@/api/staff'
import * as rolesApi from '@/api/roles'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const admins = ref<any[]>([])
const loading = ref(true)

// All roles list
const allRoles = ref<{ value: string; label: string; permissions: string[] }[]>([])
const BD_CREATE_ROLES = new Set(['bd', 'senior_bd', 'bdm'])
const staffCreateRoles = computed(() =>
  allRoles.value.filter(r => !BD_CREATE_ROLES.has(r.value)),
)

// Built-in permissions grouped for checkbox matrix
const PERMISSION_GROUPS = [
  { label: 'Dashboard',     perms: ['dashboard.view'] },
  { label: 'Users',         perms: ['user.view','user.edit','user.ban','user.ban_temp','user.adjust_balance','user.mute','user.verify','user.delete'] },
  { label: 'Staff',         perms: ['admin.view','admin.create','admin.edit_role','admin.deactivate','admin.custom_roles'] },
  { label: 'Rooms',         perms: ['room.view','room.close','room.monitor'] },
  { label: 'Gifts',         perms: ['gift.view','gift.manage'] },
  { label: 'Payments',      perms: ['payment.view','payment.manage','payment.withdrawal'] },
  { label: 'Moderation',    perms: ['report.view','report.handle'] },
  { label: 'Analytics',     perms: ['analytics.view','analytics.full'] },
  { label: 'Agencies',      perms: ['agency.view','agency.manage'] },
  { label: 'Events',        perms: ['event.view','event.manage'] },
  { label: 'Banners',       perms: ['banner.view','banner.manage'] },
  { label: 'Host Apps',     perms: ['host_app.view','host_app.manage'] },
  { label: 'Games',         perms: ['game.view','game.manage'] },
  { label: 'Settings',      perms: ['settings.view','settings.edit'] },
  { label: 'Audit Log',     perms: ['audit.view'] },
]

const PERM_LABEL: Record<string, string> = {
  'dashboard.view':     'View Dashboard',
  'user.view':          'View Users',
  'user.edit':          'Edit Users',
  'user.ban':           'Permanent Ban',
  'user.ban_temp':      'Temp Ban',
  'user.adjust_balance':'Adjust Balance',
  'user.mute':          'Mute Users',
  'user.verify':        'KYC Verify',
  'user.delete':        'Delete Users',
  'admin.view':         'View Staff',
  'admin.create':       'Create Staff',
  'admin.edit_role':    'Edit Staff Role',
  'admin.deactivate':   'Deactivate Staff',
  'admin.custom_roles': 'Custom Roles',
  'room.view':          'View Rooms',
  'room.close':         'Force Close',
  'room.monitor':       'Monitor Rooms',
  'gift.view':          'View Gifts',
  'gift.manage':        'Manage Gifts',
  'payment.view':       'View Payments',
  'payment.manage':     'Manage Payments',
  'payment.withdrawal': 'Approve Withdrawals',
  'report.view':        'View Reports',
  'report.handle':      'Handle Reports',
  'analytics.view':     'View Analytics',
  'analytics.full':     'Full Analytics',
  'agency.view':        'View Agencies',
  'agency.manage':      'Manage Agencies',
  'event.view':         'View Events',
  'event.manage':       'Manage Events',
  'banner.view':        'View Banners',
  'banner.manage':      'Manage Banners',
  'host_app.view':      'View Host Apps',
  'host_app.manage':    'Manage Host Apps',
  'game.view':          'View Games',
  'game.manage':        'Manage Games',
  'settings.view':      'View Settings',
  'settings.edit':      'Edit Settings',
  'audit.view':         'View Audit Log',
}

// ── Create modal ────────────────────────────────────────────────────────────

const createModal = ref(false)
const createForm = ref({
  email: '', password: '', displayName: '', role: 'moderator',
  region: '', username: '', phone: '', country: '', hakaId: '',
})
const createPerms = ref<string[]>([])
const createLoading = ref(false)
const createError = ref('')

function getDefaultPermsForRole(roleName: string): string[] {
  const found = allRoles.value.find(r => r.value === roleName)
  return found ? [...found.permissions] : []
}

watch(() => createForm.value.role, (role) => {
  createPerms.value = getDefaultPermsForRole(role)
})

function openCreateModal() {
  createForm.value = {
    email: '', password: '', displayName: '', role: 'moderator',
    region: '', username: '', phone: '', country: '', hakaId: '',
  }
  createPerms.value = getDefaultPermsForRole('moderator')
  createError.value = ''
  createModal.value = true
}

function toggleCreatePerm(perm: string) {
  const idx = createPerms.value.indexOf(perm)
  if (idx >= 0) createPerms.value.splice(idx, 1)
  else createPerms.value.push(perm)
}

function selectAllGroup(group: { perms: string[] }, checked: boolean) {
  group.perms.forEach(p => {
    const idx = createPerms.value.indexOf(p)
    if (checked && idx < 0) createPerms.value.push(p)
    if (!checked && idx >= 0) createPerms.value.splice(idx, 1)
  })
}

function isGroupAllSelected(group: { perms: string[] }, selectedPerms: string[]) {
  return group.perms.every(p => selectedPerms.includes(p))
}

async function submitCreate() {
  createError.value = ''
  createLoading.value = true
  try {
    const f = createForm.value
    await staffApi.createAdmin({
      email: f.email,
      password: f.password,
      displayName: f.displayName,
      role: f.role,
      region: f.region || undefined,
      username: f.username || undefined,
      phone: f.phone || undefined,
      country: f.country || undefined,
      hakaId: f.hakaId.trim() || undefined,
      customPermissions: createPerms.value,
    })
    createModal.value = false
    toast.success('Staff Created', `${createForm.value.displayName} has been added.`)
    await fetchAdmins()
  } catch (e: any) { createError.value = e?.message || 'Failed to create staff' }
  createLoading.value = false
}

// ── Edit modal (role + permissions) ────────────────────────────────────────

const editModal = ref<any>(null)
const editRole = ref('')
const editPerms = ref<string[]>([])
const editUsername = ref('')
const editPhone = ref('')
const editCountry = ref('')
const editHakaId = ref('')
const editPassword = ref('')
const editLoading = ref(false)

function openEditModal(admin: any) {
  editModal.value = admin
  editRole.value = admin.role
  editUsername.value = admin.username ?? ''
  editPhone.value = admin.phone ?? ''
  editCountry.value = admin.country ?? ''
  editHakaId.value = admin.hakaId ?? ''
  editPassword.value = staffPasswordPlaintext(admin)
  // use customPermissions if set, else resolve role defaults
  editPerms.value = admin.customPermissions?.length > 0
    ? [...admin.customPermissions]
    : getDefaultPermsForRole(admin.role)
}

watch(editRole, (role) => {
  if (!editModal.value) return
  // when role changes, reset to that role's defaults
  editPerms.value = getDefaultPermsForRole(role)
})

function toggleEditPerm(perm: string) {
  const idx = editPerms.value.indexOf(perm)
  if (idx >= 0) editPerms.value.splice(idx, 1)
  else editPerms.value.push(perm)
}

function selectAllGroupEdit(group: { perms: string[] }, checked: boolean) {
  group.perms.forEach(p => {
    const idx = editPerms.value.indexOf(p)
    if (checked && idx < 0) editPerms.value.push(p)
    if (!checked && idx >= 0) editPerms.value.splice(idx, 1)
  })
}

function staffPasswordPlaintext(admin: any): string {
  if (!admin?.loginPasswordCopyable) return ''
  return admin.loginPasswordPlaintext || admin.loginPasswordDisplay || ''
}

async function submitEdit() {
  if (!editModal.value) return
  const newPassword = editPassword.value.trim()
  const currentPassword = staffPasswordPlaintext(editModal.value)
  const passwordChanged = newPassword !== currentPassword
  if (passwordChanged && newPassword && newPassword.length < 8) {
    toast.error('Password must be at least 8 characters')
    return
  }
  editLoading.value = true
  try {
    await staffApi.updateAdmin(editModal.value.id, {
      role: editRole.value,
      customPermissions: editPerms.value,
      username: editUsername.value || null,
      phone: editPhone.value || null,
      country: editCountry.value || undefined,
      hakaId: editHakaId.value.trim() || null,
      ...(passwordChanged && newPassword ? { password: newPassword } : {}),
    })
    toast.success('Staff Updated', 'Role and permissions saved.')
    editModal.value = null
    await fetchAdmins()
  } catch (e: any) { toast.error('Update Failed', e?.message) }
  editLoading.value = false
}

// ── Deactivate / Activate confirm ──────────────────────────────────────────

const deactivateConfirm = ref<any>(null)
const deactivateLoading = ref(false)
const activateConfirm = ref<any>(null)
const activateLoading = ref(false)

// ── Password reset / OTP ───────────────────────────────────────────────────

const resetPasswordModal = ref<any>(null)
const resetPasswordValue = ref('')
const resetPasswordAuto = ref(false)
const resetPasswordLoading = ref(false)
const resetPasswordResult = ref<{ admin: any; tempPassword: string } | null>(null)

const otpModal = ref(false)
const otpResult = ref<{ otpCode: string; expiresAt: string } | null>(null)
const otpTarget = ref<any>(null)

function openResetPassword(admin: any) {
  resetPasswordModal.value = admin
  resetPasswordValue.value = ''
  resetPasswordAuto.value = false
}

async function submitResetPassword() {
  if (!resetPasswordModal.value) return
  const custom = resetPasswordAuto.value ? undefined : resetPasswordValue.value.trim()
  if (!resetPasswordAuto.value && custom && custom.length < 8) {
    toast.error('Password must be at least 8 characters')
    return
  }
  resetPasswordLoading.value = true
  try {
    const res = await staffApi.resetAdminPassword(resetPasswordModal.value.id, custom)
    resetPasswordResult.value = { admin: resetPasswordModal.value, tempPassword: res.tempPassword }
    resetPasswordModal.value = null
    await fetchAdmins()
    toast.success('Password reset', 'Share the new password with the staff member.')
  } catch (e: any) {
    toast.error('Reset failed', e?.message)
  }
  resetPasswordLoading.value = false
}

async function openGenerateOtp(admin: any) {
  otpTarget.value = admin
  try {
    otpResult.value = await staffApi.generateAdminOtp(admin.id)
    otpModal.value = true
  } catch (e: any) {
    toast.error('OTP generation failed', e?.message)
  }
}

async function copyStaffPassword(admin: any) {
  const text = admin.loginPasswordPlaintext || admin.loginPasswordDisplay
  if (!text || !admin.loginPasswordCopyable) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied', 'Password copied to clipboard')
  } catch {
    toast.error('Copy failed', 'Could not copy password')
  }
}

async function copyResetPassword() {
  if (!resetPasswordResult.value) return
  try {
    await navigator.clipboard.writeText(resetPasswordResult.value.tempPassword)
    toast.success('Copied', 'New password copied to clipboard')
  } catch {
    toast.error('Copy failed', 'Could not copy password')
  }
}

async function confirmDeactivate() {
  if (!deactivateConfirm.value) return
  deactivateLoading.value = true
  try {
    await staffApi.deactivateAdmin(deactivateConfirm.value.id)
    toast.warning('Staff Deactivated', `${deactivateConfirm.value.displayName} has been disabled.`)
    deactivateConfirm.value = null
    await fetchAdmins()
  } catch (e: any) { toast.error('Deactivate Failed', e?.message) }
  deactivateLoading.value = false
}

async function confirmActivate() {
  if (!activateConfirm.value) return
  activateLoading.value = true
  try {
    await staffApi.reactivateAdmin(activateConfirm.value.id)
    toast.success('Staff Activated', `${activateConfirm.value.displayName} has been re-enabled.`)
    activateConfirm.value = null
    await fetchAdmins()
  } catch (e: any) { toast.error('Activate Failed', e?.message) }
  activateLoading.value = false
}

// ── Data loading ─────────────────────────────────────────────────────────

async function fetchAdmins() {
  loading.value = true
  try { admins.value = await staffApi.listAdmins() } catch {}
  loading.value = false
}

async function fetchRoles() {
  try {
    const data = await rolesApi.getAllRoles()
    const builtIn = (data.builtIn as any[]).map((r: any) => ({
      value: r.name,
      label: r.displayName,
      permissions: r.permissions ?? [],
    }))
    const custom = (data.custom as any[]).map((r: any) => ({
      value: r.name,
      label: `${r.displayName} (custom)`,
      permissions: r.permissions ?? [],
    }))
    allRoles.value = [...builtIn, ...custom]
  } catch {
    allRoles.value = [
      { value: 'admin',     label: 'Admin',     permissions: [] },
      { value: 'cs',        label: 'CS',        permissions: [] },
      { value: 'moderator', label: 'Moderator', permissions: [] },
      { value: 'assistant', label: 'Assistant', permissions: [] },
      { value: 'operator',  label: 'Operator',  permissions: [] },
      { value: 'bdm',       label: 'BDM',       permissions: [] },
    ]
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function roleBadgeClass(role: string) {
  const map: Record<string, string> = {
    super_admin: 'badge-superadmin',
    admin: 'badge-admin',
    cs: 'badge-cs',
    moderator: 'badge-mod',
    assistant: 'badge-assistant',
    operator: 'badge-operator',
    bdm: 'badge-bdm',
  }
  return map[role] || 'badge-custom'
}

function roleLabel(role: string) {
  const found = allRoles.value.find(r => r.value === role)
  if (found) return found.label
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    cs: 'CS',
    moderator: 'Moderator',
    assistant: 'Assistant',
    operator: 'Operator',
    bdm: 'BDM',
  }
  return map[role] || role
}

onMounted(async () => {
  await fetchRoles()
  await fetchAdmins()
  // after roles are loaded, set default perms for create form
  createPerms.value = getDefaultPermsForRole('moderator')
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">Staff Management</h2>
      <button v-if="auth.isSuperAdmin" class="btn btn-primary" @click="openCreateModal">+ Add Staff</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading staff...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th v-if="auth.isSuperAdmin">Password</th>
            <th>Role</th>
            <th>Region</th>
            <th>Haka ID</th>
            <th>Permissions</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
            <th v-if="auth.isSuperAdmin" class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.id">
            <td>
              <div class="staff-cell">
                <div class="staff-avatar">{{ admin.displayName?.charAt(0) || 'A' }}</div>
                <div class="fw">{{ admin.displayName }}</div>
              </div>
            </td>
            <td class="dim">{{ admin.email }}</td>
            <td v-if="auth.isSuperAdmin" class="password-cell">
              <span class="password-text">
                {{ admin.loginPasswordDisplay || '••••••' }}
              </span>
              <button
                v-if="admin.loginPasswordCopyable"
                type="button"
                class="copy-link"
                @click="copyStaffPassword(admin)"
              >
                Copy
              </button>
              <button
                v-else-if="admin.loginPasswordDisplay === '••••••'"
                type="button"
                class="copy-link"
                @click="openResetPassword(admin)"
              >
                Set password
              </button>
            </td>
            <td><span :class="['role-badge', roleBadgeClass(admin.role)]">{{ roleLabel(admin.role) }}</span></td>
            <td class="dim">{{ admin.region ?? '—' }}</td>
            <td class="dim">{{ admin.hakaId ?? '—' }}</td>
            <td>
              <span v-if="admin.customPermissions?.length > 0" class="perm-chip custom-chip">
                Custom ({{ admin.customPermissions.length }})
              </span>
              <span v-else class="perm-chip role-chip">Role default</span>
            </td>
            <td>
              <span :class="admin.isActive ? 'status-active' : 'status-inactive'">
                {{ admin.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="dim">{{ admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never' }}</td>
            <td class="dim">{{ new Date(admin.createdAt).toLocaleDateString() }}</td>
            <td v-if="auth.isSuperAdmin" class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openEditModal(admin)">Edit</RowActionMenuItem>
                <RowActionMenuItem @click="openResetPassword(admin)">Reset Password</RowActionMenuItem>
                <RowActionMenuItem @click="openGenerateOtp(admin)">Generate OTP</RowActionMenuItem>
                <RowActionMenuItem
                  v-if="admin.isActive && admin.id !== auth.admin?.id"
                  variant="danger"
                  @click="deactivateConfirm = admin"
                >
                  Deactivate
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-if="!admin.isActive"
                  variant="success"
                  @click="activateConfirm = admin"
                >
                  Activate
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <!-- ── Add Staff Modal ─────────────────────────────────────────────────── -->
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Add Staff Member</h3>
          <button class="btn-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Display Name</label>
              <input v-model="createForm.displayName" class="form-input" placeholder="Full name" />
            </div>
            <div class="form-group">
              <label>Role</label>
              <select v-model="createForm.role" class="form-input">
                <option v-for="r in staffCreateRoles" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Email</label>
              <input v-model="createForm.email" class="form-input" type="email" placeholder="admin@example.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input v-model="createForm.password" class="form-input" type="text" placeholder="Min 8 characters" autocomplete="off" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username <span class="dim">(optional)</span></label>
              <input v-model="createForm.username" class="form-input" placeholder="Staff username" />
            </div>
            <div class="form-group">
              <label>Phone <span class="dim">(optional)</span></label>
              <input v-model="createForm.phone" class="form-input" placeholder="+1..." />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Country <span class="dim">(optional)</span></label>
              <input v-model="createForm.country" class="form-input" placeholder="e.g. US" />
            </div>
            <div class="form-group">
              <label>Region <span class="dim">(optional)</span></label>
              <input v-model="createForm.region" class="form-input" placeholder="e.g. SEA, NA, EMEA" />
            </div>
          </div>
          <div class="form-group">
            <label>Haka ID <span class="dim">(optional — auto-generated if blank)</span></label>
            <input v-model="createForm.hakaId" class="form-input" placeholder="Leave blank to auto-assign" />
          </div>

          <!-- Permission Matrix -->
          <div class="perm-section">
            <div class="perm-section-header">
              <span class="perm-section-title">Access Permissions</span>
              <span class="perm-section-hint">Pre-filled from role — customize as needed</span>
            </div>
            <div class="perm-grid">
              <div v-for="group in PERMISSION_GROUPS" :key="group.label" class="perm-group">
                <div class="perm-group-header">
                  <label class="perm-group-label">
                    <input
                      type="checkbox"
                      :checked="isGroupAllSelected(group, createPerms)"
                      @change="(e) => selectAllGroup(group, (e.target as HTMLInputElement).checked)"
                    />
                    {{ group.label }}
                  </label>
                </div>
                <div class="perm-items">
                  <label v-for="perm in group.perms" :key="perm" class="perm-item">
                    <input
                      type="checkbox"
                      :checked="createPerms.includes(perm)"
                      @change="toggleCreatePerm(perm)"
                    />
                    {{ PERM_LABEL[perm] || perm }}
                  </label>
                </div>
              </div>
            </div>
            <div class="perm-count">{{ createPerms.length }} permission{{ createPerms.length !== 1 ? 's' : '' }} selected</div>
          </div>

          <div v-if="createError" class="form-error">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="createModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Creating...' : 'Create Staff' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Edit Staff Modal (role + permissions) ──────────────────────────── -->
    <div v-if="editModal" class="modal-overlay" @click.self="editModal = null">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Edit Staff — {{ editModal.displayName }}</h3>
          <button class="btn-close" @click="editModal = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Role</label>
              <select v-model="editRole" class="form-input">
                <option v-for="r in allRoles" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Login Password</label>
              <input
                v-model="editPassword"
                class="form-input"
                type="text"
                :placeholder="editModal.loginPasswordCopyable ? 'Current password' : 'Set new password (min 8 chars)'"
                autocomplete="off"
              />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username</label>
              <input v-model="editUsername" class="form-input" placeholder="Staff username" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input v-model="editPhone" class="form-input" placeholder="+1..." />
            </div>
          </div>
          <div class="form-group">
            <label>Country</label>
            <input v-model="editCountry" class="form-input" placeholder="e.g. US" />
          </div>
          <div class="form-group">
            <label>Haka ID</label>
            <input v-model="editHakaId" class="form-input" placeholder="Staff public ID" />
          </div>

          <!-- Permission Matrix -->
          <div class="perm-section">
            <div class="perm-section-header">
              <span class="perm-section-title">Access Permissions</span>
              <span class="perm-section-hint">Changing role resets permissions to role defaults</span>
            </div>
            <div class="perm-grid">
              <div v-for="group in PERMISSION_GROUPS" :key="group.label" class="perm-group">
                <div class="perm-group-header">
                  <label class="perm-group-label">
                    <input
                      type="checkbox"
                      :checked="isGroupAllSelected(group, editPerms)"
                      @change="(e) => selectAllGroupEdit(group, (e.target as HTMLInputElement).checked)"
                    />
                    {{ group.label }}
                  </label>
                </div>
                <div class="perm-items">
                  <label v-for="perm in group.perms" :key="perm" class="perm-item">
                    <input
                      type="checkbox"
                      :checked="editPerms.includes(perm)"
                      @change="toggleEditPerm(perm)"
                    />
                    {{ PERM_LABEL[perm] || perm }}
                  </label>
                </div>
              </div>
            </div>
            <div class="perm-count">{{ editPerms.length }} permission{{ editPerms.length !== 1 ? 's' : '' }} selected</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="editModal = null">Cancel</button>
          <button class="btn btn-primary" :disabled="editLoading" @click="submitEdit">
            {{ editLoading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Deactivate confirm ─────────────────────────────────────────────── -->
    <div v-if="deactivateConfirm" class="modal-overlay" @click.self="deactivateConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Deactivate Staff</h3>
          <button class="btn-close" @click="deactivateConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Deactivate <strong>{{ deactivateConfirm.displayName }}</strong>?<br />
            They will lose all admin access immediately and cannot log in until re-enabled.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deactivateConfirm = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deactivateLoading" @click="confirmDeactivate">
            {{ deactivateLoading ? 'Deactivating...' : 'Deactivate' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Reset password ─────────────────────────────────────────────────── -->
    <div v-if="resetPasswordModal" class="modal-overlay" @click.self="resetPasswordModal = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Reset Password — {{ resetPasswordModal.displayName }}</h3>
          <button class="btn-close" @click="resetPasswordModal = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Set a new login password for this staff member. All their active sessions will be signed out.
          </p>
          <label class="check-row">
            <input v-model="resetPasswordAuto" type="checkbox" />
            Generate a random password automatically
          </label>
          <div v-if="!resetPasswordAuto" class="form-group">
            <label>New Password</label>
            <input
              v-model="resetPasswordValue"
              type="text"
              class="form-input"
              placeholder="Min 8 characters"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="resetPasswordModal = null">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="resetPasswordLoading || (!resetPasswordAuto && resetPasswordValue.length < 8)"
            @click="submitResetPassword"
          >
            {{ resetPasswordLoading ? 'Resetting...' : 'Reset Password' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Reset password result ──────────────────────────────────────────── -->
    <div v-if="resetPasswordResult" class="modal-overlay" @click.self="resetPasswordResult = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>New Password</h3>
          <button class="btn-close" @click="resetPasswordResult = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Password for <strong>{{ resetPasswordResult.admin.displayName }}</strong>.
            Copy it now — it won't be shown again in plain text unless stored in the snapshot.
          </p>
          <p class="otp-code">{{ resetPasswordResult.tempPassword }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="copyResetPassword">Copy</button>
          <button class="btn btn-primary" @click="resetPasswordResult = null">Done</button>
        </div>
      </div>
    </div>

    <!-- ── Emergency OTP ──────────────────────────────────────────────────── -->
    <div v-if="otpModal && otpResult" class="modal-overlay" @click.self="otpModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Emergency OTP — {{ otpTarget?.displayName }}</h3>
          <button class="btn-close" @click="otpModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">Single-use login code (valid 10 minutes):</p>
          <p class="otp-code">{{ otpResult.otpCode }}</p>
          <p class="dim">Expires: {{ new Date(otpResult.expiresAt).toLocaleString() }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="otpModal = false">Done</button>
        </div>
      </div>
    </div>

    <!-- ── Activate confirm ───────────────────────────────────────────────── -->
    <div v-if="activateConfirm" class="modal-overlay" @click.self="activateConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Activate Staff</h3>
          <button class="btn-close" @click="activateConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Re-enable <strong>{{ activateConfirm.displayName }}</strong>?<br />
            They will regain access immediately with their previously assigned permissions.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="activateConfirm = null">Cancel</button>
          <button class="btn btn-success" :disabled="activateLoading" @click="confirmActivate">
            {{ activateLoading ? 'Activating...' : 'Activate' }}
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
.btn-primary  { background: var(--primary); color: #fff; }
.btn-primary:hover  { background: var(--primary-dark); }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger  { background: #FF4D4D; color: #fff; }
.btn-success { background: var(--success); color: #fff; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }

.staff-cell { display: flex; align-items: center; gap: 10px; }
.staff-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }

.role-badge { padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-superadmin { background: #fef3c7; color: #92400e; }
.badge-admin      { background: var(--primary-soft); color: var(--primary); }
.badge-cs         { background: #f3e8ff; color: #6b21a8; }
.badge-mod        { background: #dbeafe; color: #1e40af; }
.badge-assistant  { background: #f1f5f9; color: #475569; }
.badge-operator   { background: #d1fae5; color: #065f46; }
.badge-bdm        { background: #dcfce7; color: #14532d; }
.badge-custom     { background: #fce7f3; color: #9d174d; }

.perm-chip { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.custom-chip { background: rgba(123,79,255,0.12); color: var(--primary); }
.role-chip   { background: #f1f5f9; color: #64748b; }

.status-active   { color: #22C97A; font-weight: 600; font-size: 12px; }
.status-inactive { color: #FF4D4D; font-weight: 600; font-size: 12px; }

.password-cell { display: flex; align-items: center; gap: 8px; }
.password-text { font-family: monospace; font-size: 12px; color: var(--text-muted); }
.copy-link { background: none; border: none; padding: 0; font-size: 11px; font-weight: 600; color: var(--primary); cursor: pointer; }
.check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.otp-code { font-size: 22px; font-weight: 700; letter-spacing: 2px; font-family: monospace; text-align: center; margin: 8px 0; }

.row-actions { display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; color: var(--text-primary); }
.btn-row.danger  { color: #FF4D4D; border-color: #FF4D4D; }
.btn-row.success { color: var(--success); border-color: var(--success); }
.btn-row:hover { background: var(--row-hover); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-wide { width: min(860px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); line-height: 1.6; }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }

/* Permission matrix */
.perm-section { display: flex; flex-direction: column; gap: 10px; }
.perm-section-header { display: flex; align-items: baseline; gap: 10px; }
.perm-section-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.perm-section-hint  { font-size: 11px; color: var(--text-muted); }

.perm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #F8FAFC; border: 1px solid var(--card-border); border-radius: 10px; padding: 14px; }

.perm-group { display: flex; flex-direction: column; gap: 4px; }
.perm-group-header { margin-bottom: 2px; }
.perm-group-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-primary); cursor: pointer; }
.perm-group-label input { accent-color: var(--primary); }

.perm-items { display: flex; flex-direction: column; gap: 3px; padding-left: 4px; }
.perm-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); cursor: pointer; }
.perm-item input { accent-color: var(--primary); }

.perm-count { font-size: 12px; color: var(--primary); font-weight: 600; text-align: right; }
</style>
