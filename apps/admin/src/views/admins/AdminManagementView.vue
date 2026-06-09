<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminRealtime } from '@/composables/useAdminRealtime'
import { useRouter, useRoute } from 'vue-router'
import {
  listAdminsForManagement,
  transferBd,
  getAdminWithdrawalFreeze,
  setAdminWithdrawalFreeze,
  transferAgenciesBetweenAdmins,
} from '@/api/agencies'
import { listBds } from '@/api/bd'
import * as staffApi from '@/api/staff'
import { exportToCsv } from '@/lib/exportCsv'
import { formatFieldErrors, fieldErrorsOf } from '@/lib/formErrors'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const ADMIN_FIELD_LABELS: Record<string, string> = {
  email: 'Email', password: 'Password', displayName: 'Display name',
  region: 'Region', username: 'Username', phone: 'Phone', country: 'Country', hakaId: 'Haka ID',
}

const router = useRouter()
const route = useRoute()
const toast = useToastStore()
const auth = useAuthStore()

const activeTab = ref<'overview' | 'accounts'>(
  route.query.tab === 'accounts' ? 'accounts' : 'overview',
)

// ── Overview (regional metrics) ─────────────────────────────────────────────
const overviewAdmins = ref<any[]>([])
const bds = ref<any[]>([])
const period = ref<'week' | 'month'>('month')
const overviewLoading = ref(false)

const transferBdModal = ref(false)
const selectedBdId = ref('')
const selectedAdminId = ref('')
const transferBdLoading = ref(false)

async function loadOverview() {
  overviewLoading.value = true
  try {
    const res = await listAdminsForManagement(period.value)
    overviewAdmins.value = res.items ?? []
  } catch {
    toast.error('Failed to load admin overview')
  } finally {
    overviewLoading.value = false
  }
}

async function openTransferBd(adminId: string) {
  selectedAdminId.value = adminId
  selectedBdId.value = ''
  const res = await listBds().catch(() => ({ items: [] }))
  bds.value = res.items ?? []
  transferBdModal.value = true
}

async function doTransferBd() {
  if (!selectedBdId.value) return
  transferBdLoading.value = true
  try {
    await transferBd(selectedBdId.value, selectedAdminId.value)
    toast.success('BD transferred')
    transferBdModal.value = false
    await loadOverview()
  } catch {
    toast.error('Transfer failed')
  } finally {
    transferBdLoading.value = false
  }
}

function exportOverviewCsv() {
  exportToCsv(overviewAdmins.value, [
    { header: 'Name', value: r => r.displayName },
    { header: 'Region', value: r => r.region },
    { header: 'BDs', value: r => r.bdCount },
    { header: 'Agencies', value: r => r.agencyCount },
    { header: 'Revenue', value: r => r.revenue },
    { header: 'New BDs', value: r => r.newBds },
  ], 'admin-overview')
}

// ── Admin accounts ────────────────────────────────────────────────────────────
const staffAdmins = ref<any[]>([])
const accountsLoading = ref(false)
const selected = ref<any>(null)
const viewModal = ref(false)

const createModal = ref(false)
const createLoading = ref(false)
const createForm = ref({
  email: '',
  password: '',
  displayName: '',
  region: '',
  username: '',
  phone: '',
  country: '',
  hakaId: '',
})

const editModal = ref(false)
const editForm = ref({ displayName: '', region: '', username: '', phone: '', country: '', hakaId: '' })
const editLoading = ref(false)

const resetPasswordModal = ref(false)
const resetPasswordValue = ref('')
const resetPasswordAuto = ref(false)
const resetPasswordLoading = ref(false)
const resetPasswordResult = ref<{ admin: any; tempPassword: string } | null>(null)

const otpModal = ref(false)
const otpResult = ref<{ otpCode: string; expiresAt: string } | null>(null)

const freezeModal = ref(false)
const freezeForm = ref({ isFrozen: false, reason: '' })
const freezeLoading = ref(false)

const transferAgenciesModal = ref(false)
const transferToAdminId = ref('')
const transferAgenciesLoading = ref(false)

const deleteConfirm = ref(false)
const deleteReason = ref('')
const deleteLoading = ref(false)

const regionalAdmins = computed(() =>
  staffAdmins.value.filter((a) => (a.roles?.length ? a.roles : [a.role]).includes('admin')),
)

async function loadAccounts() {
  accountsLoading.value = true
  try {
    const list = await staffApi.listAdmins()
    staffAdmins.value = Array.isArray(list) ? list : (list?.items ?? [])
  } catch (e: any) {
    toast.error('Failed to load admins', e?.message)
  } finally {
    accountsLoading.value = false
  }
}

function openCreate() {
  createForm.value = {
    email: '',
    password: '',
    displayName: '',
    region: '',
    username: '',
    phone: '',
    country: '',
    hakaId: '',
  }
  createModal.value = true
}

async function submitCreate() {
  const f = createForm.value
  if (!f.email || !f.displayName) {
    toast.error('Email and display name are required')
    return
  }
  if (!f.password || f.password.length < 8) {
    toast.error('Password must be at least 8 characters')
    return
  }
  createLoading.value = true
  try {
    const res: any = await staffApi.createAdmin({
      email: f.email,
      password: f.password,
      displayName: f.displayName,
      role: 'admin',
      region: f.region || null,
      username: f.username || null,
      phone: f.phone || null,
      country: f.country || undefined,
      hakaId: f.hakaId.trim() || undefined,
    })
    toast.success(res?.merged ? 'Admin role added to existing account' : 'Admin created')
    createModal.value = false
    await loadAccounts()
    await loadOverview()
  } catch (e: any) {
    const fe = fieldErrorsOf(e)
    if (fe) toast.error('Validation failed', formatFieldErrors(fe, ADMIN_FIELD_LABELS))
    else toast.error(e?.message || 'Failed to create admin')
  } finally {
    createLoading.value = false
  }
}

function openView(admin: any) {
  selected.value = admin
  viewModal.value = true
}

function openEdit(admin: any) {
  selected.value = admin
  editForm.value = {
    displayName: admin.displayName ?? '',
    region: admin.region ?? '',
    username: admin.username ?? '',
    phone: admin.phone ?? '',
    country: admin.country ?? '',
    hakaId: admin.hakaId ?? '',
  }
  editModal.value = true
}

async function submitEdit() {
  if (!selected.value) return
  editLoading.value = true
  try {
    await staffApi.updateAdmin(selected.value.id, editForm.value)
    toast.success('Admin updated')
    editModal.value = false
    await loadAccounts()
  } catch (e: any) {
    toast.error(e?.message || 'Update failed')
  } finally {
    editLoading.value = false
  }
}

async function suspendAdmin(admin: any) {
  if (admin.id === auth.admin?.id) {
    toast.error('You cannot suspend your own account')
    return
  }
  try {
    await staffApi.deactivateAdmin(admin.id)
    toast.warning('Admin suspended')
    await loadAccounts()
  } catch (e: any) {
    toast.error(e?.message || 'Suspend failed')
  }
}

async function activateAdmin(admin: any) {
  try {
    await staffApi.reactivateAdmin(admin.id)
    toast.success('Admin activated')
    await loadAccounts()
  } catch (e: any) {
    toast.error(e?.message || 'Activate failed')
  }
}

async function openFreeze(admin: any) {
  selected.value = admin
  freezeLoading.value = true
  try {
    const f = await getAdminWithdrawalFreeze(admin.id)
    freezeForm.value = { isFrozen: f.isFrozen ?? false, reason: f.reason ?? '' }
    freezeModal.value = true
  } catch (e: any) {
    toast.error(e?.message || 'Failed to load freeze status')
  } finally {
    freezeLoading.value = false
  }
}

async function submitFreeze() {
  if (!selected.value) return
  freezeLoading.value = true
  try {
    await setAdminWithdrawalFreeze(selected.value.id, {
      isFrozen: freezeForm.value.isFrozen,
      reason: freezeForm.value.reason,
    })
    toast.success(freezeForm.value.isFrozen ? 'Revenue frozen' : 'Revenue unfrozen')
    freezeModal.value = false
  } catch (e: any) {
    toast.error(e?.message || 'Freeze update failed')
  } finally {
    freezeLoading.value = false
  }
}

function openTransferAgencies(admin: any) {
  selected.value = admin
  transferToAdminId.value = ''
  transferAgenciesModal.value = true
}

async function submitTransferAgencies() {
  if (!selected.value || !transferToAdminId.value) return
  transferAgenciesLoading.value = true
  try {
    await transferAgenciesBetweenAdmins({
      fromAdminId: selected.value.id,
      toAdminId: transferToAdminId.value,
    })
    toast.success('Agencies transferred')
    transferAgenciesModal.value = false
    await loadOverview()
  } catch (e: any) {
    toast.error(e?.message || 'Transfer failed')
  } finally {
    transferAgenciesLoading.value = false
  }
}

function openResetPassword(admin: any) {
  selected.value = admin
  resetPasswordValue.value = ''
  resetPasswordAuto.value = false
  resetPasswordModal.value = true
}

async function submitResetPassword() {
  if (!selected.value) return
  const custom = resetPasswordAuto.value ? undefined : resetPasswordValue.value.trim()
  if (!resetPasswordAuto.value && custom && custom.length < 8) return
  resetPasswordLoading.value = true
  try {
    const res = await staffApi.resetAdminPassword(selected.value.id, custom)
    resetPasswordResult.value = { admin: selected.value, tempPassword: res.tempPassword }
    resetPasswordModal.value = false
    await loadAccounts()
    toast.success('Password reset', 'Share the new password with the admin.')
  } catch (e: any) {
    toast.error(e?.message || 'Reset failed')
  } finally {
    resetPasswordLoading.value = false
  }
}

async function copyResetPassword() {
  if (!resetPasswordResult.value) return
  try {
    await navigator.clipboard.writeText(resetPasswordResult.value.tempPassword)
    toast.success('Copied', 'New password copied to clipboard')
  } catch {
    toast.error('Copy failed')
  }
}

async function openGenerateOtp(admin: any) {
  selected.value = admin
  try {
    otpResult.value = await staffApi.generateAdminOtp(admin.id)
    otpModal.value = true
  } catch (e: any) {
    toast.error(e?.message || 'OTP generation failed')
  }
}

async function removePermissions(admin: any) {
  if (!confirm(`Remove all permissions from ${admin.displayName}?`)) return
  try {
    await staffApi.removeAdminPermissions(admin.id)
    toast.success('Permissions removed')
    await loadAccounts()
  } catch (e: any) {
    toast.error(e?.message || 'Failed')
  }
}

function viewLogs(admin: any) {
  router.push({ path: '/audit-log', query: { adminId: admin.id } })
}

function openDelete(admin: any) {
  selected.value = admin
  deleteReason.value = ''
  deleteConfirm.value = true
}

async function confirmDelete() {
  if (!selected.value) return
  deleteLoading.value = true
  try {
    const check = await staffApi.canDeleteAdmin(selected.value.id)
    if (!check.canDelete) {
      toast.error('Cannot delete', check.reason || 'Active dependencies exist')
      deleteConfirm.value = false
      return
    }
    await staffApi.hardDeleteAdmin(selected.value.id)
    toast.success('Admin deleted')
    deleteConfirm.value = false
    await loadAccounts()
    await loadOverview()
  } catch (e: any) {
    toast.error(e?.message || 'Delete failed')
  } finally {
    deleteLoading.value = false
  }
}

useAdminRealtime('admin_management', () => {
  if (activeTab.value === 'overview') {
    void loadOverview()
  }
})

onMounted(() => {
  if (route.query.tab === 'accounts') {
    activeTab.value = 'accounts'
    loadAccounts()
  }
  loadOverview()
})

function switchTab(tab: 'overview' | 'accounts') {
  activeTab.value = tab
  if (tab === 'accounts' && staffAdmins.value.length === 0) loadAccounts()
  if (tab === 'overview') loadOverview()
}
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Admin Management</h2>
        <div class="page-sub">Regional performance, admin accounts, and assignments</div>
      </div>
      <div v-if="activeTab === 'overview'" class="toolbar-actions">
        <select v-model="period" class="form-input filter-select" @change="loadOverview">
          <option value="month">This Month</option>
          <option value="week">This Week</option>
        </select>
        <button class="btn btn-secondary" @click="exportOverviewCsv">Export CSV</button>
      </div>
      <div v-else class="toolbar-actions">
        <button
          v-if="auth.isSuperAdmin"
          class="btn btn-primary"
          @click="openCreate"
        >
          + Add Admin
        </button>
        <button class="btn btn-secondary" @click="loadAccounts">Refresh</button>
      </div>
    </div>

    <div class="tabs">
      <button :class="['tab', activeTab === 'overview' ? 'active' : '']" @click="switchTab('overview')">
        Overview
      </button>
      <button :class="['tab', activeTab === 'accounts' ? 'active' : '']" @click="switchTab('accounts')">
        Admin Accounts
      </button>
    </div>

    <!-- Overview tab -->
    <div v-if="activeTab === 'overview'" class="table-card">
      <div v-if="overviewLoading" class="loading">Loading overview…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Region</th>
            <th>BDs</th>
            <th>Agencies</th>
            <th>Revenue</th>
            <th>New BDs</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in overviewAdmins" :key="a.id">
            <td class="fw">{{ a.displayName }}</td>
            <td class="dim">{{ a.region ?? '—' }}</td>
            <td class="fw">{{ a.bdCount }}</td>
            <td class="fw">{{ a.agencyCount }}</td>
            <td class="mono">{{ a.revenue }}</td>
            <td class="fw">{{ a.newBds }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openTransferBd(a.id)">Transfer BD</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="overviewAdmins.length === 0">
            <td colspan="7" class="empty">No regional admins found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Admin accounts tab -->
    <div v-else class="table-card">
      <div v-if="!auth.isSuperAdmin" class="notice">
        Admin account actions require <strong>Super Admin</strong>.
      </div>
      <div v-if="accountsLoading" class="loading">Loading admin accounts…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Haka ID</th>
            <th>Region</th>
            <th>Status</th>
            <th>Last Login</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in regionalAdmins" :key="admin.id">
            <td class="fw">{{ admin.displayName }}</td>
            <td class="dim">{{ admin.email }}</td>
            <td class="mono">{{ admin.hakaId ?? '—' }}</td>
            <td>{{ admin.region ?? '—' }}</td>
            <td>
              <span :class="admin.isActive ? 'status-active' : 'status-inactive'">
                {{ admin.isActive ? 'Active' : 'Suspended' }}
              </span>
            </td>
            <td class="dim">
              {{ admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never' }}
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openView(admin)">View</RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="openEdit(admin)">Edit</RowActionMenuItem>
                <RowActionMenuItem
                  v-if="admin.isActive"
                  variant="danger"
                  :disabled="!auth.isSuperAdmin"
                  @click="suspendAdmin(admin)"
                >
                  Suspend
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-else
                  variant="success"
                  :disabled="!auth.isSuperAdmin"
                  @click="activateAdmin(admin)"
                >
                  Activate
                </RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="openFreeze(admin)">
                  Freeze Revenue
                </RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="openTransferAgencies(admin)">
                  Transfer Agencies
                </RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="openResetPassword(admin)">
                  Reset Password
                </RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="openGenerateOtp(admin)">
                  Generate OTP
                </RowActionMenuItem>
                <RowActionMenuItem :disabled="!auth.isSuperAdmin" @click="removePermissions(admin)">
                  Remove Permissions
                </RowActionMenuItem>
                <RowActionMenuItem @click="viewLogs(admin)">View Logs</RowActionMenuItem>
                <RowActionMenuItem
                  variant="danger"
                  :disabled="!auth.isSuperAdmin"
                  @click="openDelete(admin)"
                >
                  Delete Admin
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="regionalAdmins.length === 0">
            <td colspan="6" class="empty">No admin accounts found.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <!-- Transfer BD (overview) -->
    <div v-if="transferBdModal" class="modal-overlay" @click.self="transferBdModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Assign BD to Admin</h3>
          <button class="btn-close" @click="transferBdModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Select BD</label>
            <select v-model="selectedBdId" class="form-input">
              <option value="">Select BD…</option>
              <option v-for="b in bds" :key="b.id" :value="b.id">
                {{ b.displayName }} ({{ b.region ?? 'no region' }})
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="transferBdModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="!selectedBdId || transferBdLoading" @click="doTransferBd">
            {{ transferBdLoading ? 'Assigning…' : 'Assign' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create admin -->
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal-box modal-wide">
        <div class="modal-header">
          <h3>Create Admin</h3>
          <button class="btn-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Display Name *</label>
              <input v-model="createForm.displayName" class="form-input" />
            </div>
            <div class="form-group">
              <label>Email *</label>
              <input v-model="createForm.email" type="email" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label>Password *</label>
            <input v-model="createForm.password" type="password" class="form-input" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Region</label>
              <input v-model="createForm.region" class="form-input" placeholder="e.g. GB" />
            </div>
            <div class="form-group">
              <label>Country</label>
              <input v-model="createForm.country" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username</label>
              <input v-model="createForm.username" class="form-input" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input v-model="createForm.phone" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label>Haka ID <span class="dim">(optional — auto-generated if blank)</span></label>
            <input v-model="createForm.hakaId" class="form-input" placeholder="Leave blank to auto-assign" />
            <span class="dim">If this Haka ID already has a staff account, the admin role is added to it.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="createModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Creating…' : 'Create Admin' }}
          </button>
        </div>
      </div>
    </div>

    <!-- View admin -->
    <div v-if="viewModal && selected" class="modal-overlay" @click.self="viewModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <div>
            <h3>{{ selected.displayName }}</h3>
            <div class="modal-sub dim">{{ selected.email }}</div>
          </div>
          <button class="btn-close" @click="viewModal = false">✕</button>
        </div>
        <div class="modal-body detail-grid">
          <div><span class="lbl">Role</span> {{ (selected.roles && selected.roles.length ? selected.roles : [selected.role]).join(', ') }}</div>
          <div><span class="lbl">Haka ID</span> {{ selected.hakaId ?? '—' }}</div>
          <div><span class="lbl">Region</span> {{ selected.region ?? '—' }}</div>
          <div><span class="lbl">Status</span> {{ selected.isActive ? 'Active' : 'Suspended' }}</div>
          <div><span class="lbl">Permissions</span> {{ (selected.permissions ?? []).length }} granted</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="viewModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- Edit -->
    <div v-if="editModal" class="modal-overlay" @click.self="editModal = false">
      <div class="modal-box">
        <div class="modal-header"><h3>Edit Admin</h3><button class="btn-close" @click="editModal = false">✕</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Display Name</label><input v-model="editForm.displayName" class="form-input" /></div>
          <div class="form-group"><label>Haka ID</label><input v-model="editForm.hakaId" class="form-input" placeholder="Staff public ID" /></div>
          <div class="form-group"><label>Region</label><input v-model="editForm.region" class="form-input" /></div>
          <div class="form-group"><label>Username</label><input v-model="editForm.username" class="form-input" /></div>
          <div class="form-group"><label>Phone</label><input v-model="editForm.phone" class="form-input" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="editModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="editLoading" @click="submitEdit">Save</button>
        </div>
      </div>
    </div>

    <!-- Freeze revenue -->
    <div v-if="freezeModal" class="modal-overlay" @click.self="freezeModal = false">
      <div class="modal-box">
        <div class="modal-header"><h3>Freeze Revenue</h3><button class="btn-close" @click="freezeModal = false">✕</button></div>
        <div class="modal-body">
          <label class="check-row">
            <input v-model="freezeForm.isFrozen" type="checkbox" />
            Freeze withdrawals for this admin's region
          </label>
          <div class="form-group">
            <label>Reason</label>
            <input v-model="freezeForm.reason" class="form-input" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="freezeModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="freezeLoading" @click="submitFreeze">Save</button>
        </div>
      </div>
    </div>

    <!-- Transfer agencies -->
    <div v-if="transferAgenciesModal" class="modal-overlay" @click.self="transferAgenciesModal = false">
      <div class="modal-box">
        <div class="modal-header"><h3>Transfer Agencies</h3><button class="btn-close" @click="transferAgenciesModal = false">✕</button></div>
        <div class="modal-body">
          <p class="modal-sub">Move all agencies from <strong>{{ selected?.displayName }}</strong> to another admin.</p>
          <div class="form-group">
            <label>Target Admin ID</label>
            <select v-model="transferToAdminId" class="form-input">
              <option value="">Select admin…</option>
              <option
                v-for="a in regionalAdmins.filter(x => x.id !== selected?.id)"
                :key="a.id"
                :value="a.id"
              >
                {{ a.displayName }} ({{ a.region ?? '—' }})
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="transferAgenciesModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="!transferToAdminId || transferAgenciesLoading" @click="submitTransferAgencies">
            Transfer
          </button>
        </div>
      </div>
    </div>

    <!-- Reset password -->
    <div v-if="resetPasswordModal" class="modal-overlay" @click.self="resetPasswordModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Reset Password — {{ selected?.displayName }}</h3>
          <button class="btn-close" @click="resetPasswordModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">All active sessions for this admin will be signed out.</p>
          <label class="check-row">
            <input v-model="resetPasswordAuto" type="checkbox" />
            Generate a random password automatically
          </label>
          <div v-if="!resetPasswordAuto" class="form-group">
            <label>New Password</label>
            <input v-model="resetPasswordValue" type="password" class="form-input" placeholder="Min 8 characters" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="resetPasswordModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="resetPasswordLoading || (!resetPasswordAuto && resetPasswordValue.length < 8)"
            @click="submitResetPassword"
          >
            {{ resetPasswordLoading ? 'Resetting…' : 'Reset Password' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reset password result -->
    <div v-if="resetPasswordResult" class="modal-overlay" @click.self="resetPasswordResult = null">
      <div class="modal-box">
        <div class="modal-header"><h3>New Password</h3><button class="btn-close" @click="resetPasswordResult = null">✕</button></div>
        <div class="modal-body">
          <p class="modal-sub">Password for <strong>{{ resetPasswordResult.admin.displayName }}</strong>:</p>
          <p class="otp-code">{{ resetPasswordResult.tempPassword }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="copyResetPassword">Copy</button>
          <button class="btn btn-primary" @click="resetPasswordResult = null">Done</button>
        </div>
      </div>
    </div>

    <!-- OTP -->
    <div v-if="otpModal && otpResult" class="modal-overlay" @click.self="otpModal = false">
      <div class="modal-box">
        <div class="modal-header"><h3>Emergency OTP</h3><button class="btn-close" @click="otpModal = false">✕</button></div>
        <div class="modal-body">
          <p class="otp-code">{{ otpResult.otpCode }}</p>
          <p class="dim">Expires: {{ new Date(otpResult.expiresAt).toLocaleString() }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="otpModal = false">Done</button>
        </div>
      </div>
    </div>

    <!-- Delete -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = false">
      <div class="modal-box">
        <div class="modal-header"><h3>Delete Admin</h3><button class="btn-close" @click="deleteConfirm = false">✕</button></div>
        <div class="modal-body">
          <p>Only allowed when there are no active dependencies. This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm = false">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Deleting…' : 'Delete' }}
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
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--card-border); }
.tab { padding: 10px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.notice { padding: 12px 16px; background: #fef3c7; color: #92400e; font-size: 13px; border-bottom: 1px solid #fde68a; }
.filter-select { width: auto; min-width: 140px; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger { background: #ef4444; color: #fff; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }
.status-active { color: #16a34a; font-weight: 600; }
.status-inactive { color: #dc2626; font-weight: 600; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); max-height: calc(100vh - 48px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal-wide { width: min(640px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; }
.modal-sub { font-size: 12px; margin-top: 4px; }
.modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.detail-grid { display: grid; gap: 10px; font-size: 13px; }
.lbl { color: var(--text-muted); margin-right: 8px; }
.check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.otp-code { font-size: 28px; font-weight: 700; letter-spacing: 4px; font-family: monospace; text-align: center; }
</style>
