<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as usersApi from '@/api/users'
import * as modApi from '@/api/moderation'
import * as riskApi from '@/api/riskControl'
import * as authApi from '@/api/auth'
import * as tagsApi from '@/api/tags'
import * as paymentsApi from '@/api/payments'
import * as hostsApi from '@/api/hosts'
import EditableFieldRow from '@/components/users/EditableFieldRow.vue'
import { onAdminRealtime } from '@/lib/adminSocket'
import StatusBadge from '@/components/common/StatusBadge.vue'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { resolveTagIconUrl } from '@/lib/tagIconUrl'

const router = useRouter()

const toast = useToastStore()
const auth = useAuthStore()

// ── List state ────────────────────────────────────────────────────────────────
const users = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const countryFilter = ref('')
const muteFilter = ref('')
const sortField = ref('createdAt')
const sortOrder = ref('desc')
const loading = ref(true)
const vipIdFilter = ref('')
const longIdFilter = ref('')
const selectedUsers = ref<string[]>([])
const bulkTagId = ref('')
const bulkTagLoading = ref(false)

async function fetchUsers() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      sort: sortField.value,
      order: sortOrder.value,
    }
    if (search.value)       params.search   = search.value
    if (roleFilter.value)   params.role     = roleFilter.value
    if (statusFilter.value) params.isActive = statusFilter.value
    if (countryFilter.value) params.country = countryFilter.value
    if (muteFilter.value)   params.isMuted  = muteFilter.value
    if (vipIdFilter.value)  params.vipId    = vipIdFilter.value
    if (longIdFilter.value) params.longId   = longIdFilter.value
    const result = await usersApi.listUsers(params)
    users.value = result.users
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchUsers() }

function handleReset() {
  search.value = ''
  vipIdFilter.value = ''
  longIdFilter.value = ''
  roleFilter.value = ''
  statusFilter.value = ''
  countryFilter.value = ''
  muteFilter.value = ''
  selectedUsers.value = []
  pagination.value.page = 1
  fetchUsers()
}

function toggleSelectAll(checked: boolean) {
  selectedUsers.value = checked ? users.value.map(u => u.id) : []
}

function toggleSelectUser(userId: string, checked: boolean) {
  if (checked) {
    if (!selectedUsers.value.includes(userId)) selectedUsers.value.push(userId)
  } else {
    selectedUsers.value = selectedUsers.value.filter(id => id !== userId)
  }
}

function clearSelection() { selectedUsers.value = [] }

async function fetchAllTags() {
  try {
    allTags.value = await tagsApi.listTags()
  } catch (e) {
    console.error('[tags] list failed', e)
  }
}

async function bulkAssignSelectedTag() {
  if (!bulkTagId.value || selectedUsers.value.length === 0) return
  bulkTagLoading.value = true
  try {
    await tagsApi.bulkAssignTag(selectedUsers.value, bulkTagId.value)
    toast.success('Tags Assigned', `${selectedUsers.value.length} user(s) updated.`)
    bulkTagId.value = ''
    selectedUsers.value = []
    await fetchUsers()
  } catch (e: any) {
    toast.error('Bulk Assign Failed', e?.message)
  }
  bulkTagLoading.value = false
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    normal_user: 'User',
    host: 'Host',
    agent: 'Agent',
    admin: 'Admin',
    super_admin: 'Super Admin',
  }
  return map[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User')
}


// ── Drawer state ──────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerUser = ref<any>(null)
const drawerLoading = ref(false)
const drawerError = ref(false)
const drawerTab = ref('userDetails')
const actionLoading = ref(false)

// Avatar upload state
const avatarUploading = ref(false)

async function handleUserAvatarUpload() {
  if (!drawerUser.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    avatarUploading.value = true
    try {
      const result = await usersApi.uploadUserAvatar(drawerUser.value!.id, file)
      drawerUser.value!.avatar = result.avatarUrl
      toast.success('Avatar Updated')
    } catch (err: any) { toast.error('Upload Failed', err?.message) }
    avatarUploading.value = false
  }
  input.click()
}

// Same-device state
const deviceData    = ref<{ devices: any[]; linkedAccounts: any[] }>({ devices: [], linkedAccounts: [] })
const deviceLoading = ref(false)

async function fetchDevices(userId: string) {
  deviceLoading.value = true
  try { deviceData.value = await usersApi.getSameDeviceUsers(userId) } catch {}
  deviceLoading.value = false
}

// Risk control state
const riskData      = ref<{ active: any; history: any[] } | null>(null)
const riskLoading   = ref(false)
const riskModal     = ref(false)
const riskSubmitting = ref(false)
const riskReleaseConfirm = ref(false)
const evidenceFiles = ref<File[]>([])
const evidenceUrls  = ref<string[]>([])
const evidenceUploading = ref(false)

const riskForm = ref({
  freezeCoins:  true,
  freezeBeans:  true,
  disableGames: true,
  disableGifts: true,
  blockChat:    false,
  reason:       'fraud_activity',
  severity:     'high',
  duration:     'permanent',
  notes:        '',
})

async function fetchRisk(userId: string) {
  riskLoading.value = true
  try {
    const result = await riskApi.getUserRisk(userId)
    riskData.value = { active: result.active, history: result.history }
  } catch {}
  riskLoading.value = false
}

function openRiskModal() {
  const active = riskData.value?.active
  if (active) {
    riskForm.value = {
      freezeCoins:  active.freezeCoins,
      freezeBeans:  active.freezeBeans,
      disableGames: active.disableGames,
      disableGifts: active.disableGifts,
      blockChat:    active.blockChat,
      reason:       active.reason,
      severity:     active.severity,
      duration:     'permanent',
      notes:        active.notes || '',
    }
    evidenceUrls.value = active.evidenceUrls || []
  } else {
    riskForm.value = {
      freezeCoins:  true,
      freezeBeans:  true,
      disableGames: true,
      disableGifts: true,
      blockChat:    false,
      reason:       'fraud_activity',
      severity:     'high',
      duration:     'permanent',
      notes:        '',
    }
    evidenceUrls.value = []
  }
  evidenceFiles.value = []
  riskModal.value = true
}

async function handleEvidenceChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const files = Array.from(input.files)
  evidenceUploading.value = true
  try {
    for (const file of files) {
      const result = await authApi.uploadFile(file)
      evidenceUrls.value.push(result.url)
    }
    toast.success('Evidence Uploaded', `${files.length} file(s) uploaded`)
  } catch (err: any) { toast.error('Upload Failed', err?.message) }
  evidenceUploading.value = false
  input.value = ''
}

function removeEvidence(url: string) {
  evidenceUrls.value = evidenceUrls.value.filter(u => u !== url)
}

async function submitRisk() {
  if (!drawerUser.value) return
  riskSubmitting.value = true
  try {
    const payload: riskApi.RiskControlPayload = {
      ...riskForm.value,
      evidenceUrls: evidenceUrls.value,
    }
    if (riskData.value?.active) {
      await riskApi.updateRisk(drawerUser.value.id, payload)
      toast.success('Risk Control Updated')
    } else {
      await riskApi.applyRisk(drawerUser.value.id, payload)
      toast.warning('Risk Control Applied — Account Frozen')
    }
    riskModal.value = false
    await fetchRisk(drawerUser.value.id)
  } catch (err: any) { toast.error('Failed', err?.message) }
  riskSubmitting.value = false
}

async function executeReleaseRisk() {
  if (!drawerUser.value) return
  riskReleaseConfirm.value = false
  actionLoading.value = true
  try {
    await riskApi.releaseRisk(drawerUser.value.id)
    toast.success('Risk Control Released')
    await fetchRisk(drawerUser.value.id)
  } catch (err: any) { toast.error('Release Failed', err?.message) }
  actionLoading.value = false
}


// Modals
const roleModal = ref(false)
const newRole = ref('')
const banConfirm = ref(false)
const deleteConfirm = ref(false)
const deleteLoading = ref(false)

// Reset password
const resetPasswordModal = ref(false)
const resetNewPassword = ref('')
const resetSaving = ref(false)
const resetError = ref('')
const muteConfirm = ref(false)

// Adjust coins modal
const coinsModal = ref(false)
const coinsAmount = ref('')
const coinsCurrency = ref<'coins' | 'beans'>('coins')
const coinsReason = ref('')
const coinsLoading = ref(false)

async function openDrawer(userId: string) {
  drawerOpen.value = true
  drawerTab.value = 'userDetails'
  drawerLoading.value = true
  drawerError.value = false
  drawerUser.value = null
  deviceData.value = { devices: [], linkedAccounts: [] }
  riskData.value = null
  userTags.value = []
  allTags.value  = []
  selectedTagId.value = ''
  try {
    drawerUser.value = await usersApi.getUserDetail(userId)
    fetchDevices(userId)
    fetchRisk(userId)
    fetchTags(userId)
  } catch (e: any) {
    drawerError.value = true
    toast.error('Failed to load user', e?.message)
  }
  drawerLoading.value = false
}

function closeDrawer() {
  stopRechargeRealtime()
  drawerOpen.value = false
  drawerUser.value = null
  rechargeRecords.value = []
}

async function copyText(text: string, toastTitle: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(toastTitle, 'Copied to clipboard')
  } catch {
    toast.error('Copy failed', 'Could not copy to clipboard')
  }
}

// ── Tags ────────────────────────────────────────────────────────────────────
const allTags       = ref<tagsApi.AdminTag[]>([])
const userTags      = ref<Array<{ id: string; tagId: string; tag: tagsApi.AdminTag }>>([])
const tagsLoading   = ref(false)
const selectedTagId = ref('')

async function fetchTags(userId: string) {
  tagsLoading.value = true
  try {
    const [all, mine] = await Promise.all([
      tagsApi.listTags(),
      tagsApi.listUserTags(userId),
    ])
    allTags.value  = all
    userTags.value = mine
  } catch (e) {
    console.error('[tags] fetch failed', e)
  }
  tagsLoading.value = false
}

async function assignSelectedTag() {
  if (!selectedTagId.value || !drawerUser.value) return
  try {
    await tagsApi.assignTag(drawerUser.value.id, selectedTagId.value)
    toast.success('Tag Assigned', 'The user has been logged out to apply the new permissions.')
    selectedTagId.value = ''
    await fetchTags(drawerUser.value.id)
  } catch (e: any) { toast.error('Assign Failed', e?.message) }
}

async function revokeUserTag(tagId: string, name: string) {
  if (!drawerUser.value) return
  try {
    await tagsApi.revokeTag(drawerUser.value.id, tagId)
    toast.info('Tag Removed', `${name} has been removed.`)
    await fetchTags(drawerUser.value.id)
  } catch (e: any) { toast.error('Remove Failed', e?.message) }
}

async function refreshDrawer() {
  if (!drawerUser.value) return
  drawerUser.value = await usersApi.getUserDetail(drawerUser.value.id)
}

function genderLabel(gender: string | undefined) {
  if (gender === 'male') return 'Boy'
  if (gender === 'female') return 'Girl'
  return '—'
}

const canEditUser = () => auth.hasPermission('user.edit')
const canSendOtp = () => auth.hasPermission('user.send_otp')

// ── Profile field modals ─────────────────────────────────────────────────────
const editNameModal = ref(false)
const editNameValue = ref('')
const editCountryModal = ref(false)
const editCountryValue = ref('')
const editGenderModal = ref(false)
const editGenderValue = ref<'male' | 'female' | ''>('')
const editPhoneModal = ref(false)
const editPhoneValue = ref('')
const editLevelModal = ref(false)
const levelForm = ref({ richLevel: 1, richXp: 0, charmLevel: 1, charmXp: 0 })
const profileEditSaving = ref(false)
const profileEditError = ref('')

function openEditName() {
  editNameValue.value = drawerUser.value?.displayName ?? ''
  profileEditError.value = ''
  editNameModal.value = true
}
function openEditCountry() {
  editCountryValue.value = drawerUser.value?.country ?? ''
  profileEditError.value = ''
  editCountryModal.value = true
}
function openEditGender() {
  const g = drawerUser.value?.gender
  editGenderValue.value = g === 'male' || g === 'female' ? g : ''
  profileEditError.value = ''
  editGenderModal.value = true
}
function openEditPhone() {
  editPhoneValue.value = drawerUser.value?.phone ?? ''
  profileEditError.value = ''
  editPhoneModal.value = true
}
function openEditLevel() {
  levelForm.value = {
    richLevel: drawerUser.value?.level?.richLevel ?? 1,
    richXp: 0,
    charmLevel: drawerUser.value?.level?.charmLevel ?? 1,
    charmXp: 0,
  }
  profileEditError.value = ''
  editLevelModal.value = true
}

async function saveProfileEdit(
  fn: () => Promise<unknown>,
  successMsg: string,
  closeModal: () => void,
) {
  if (!drawerUser.value) return
  profileEditSaving.value = true
  profileEditError.value = ''
  try {
    await fn()
    await refreshDrawer()
    toast.success(successMsg)
    closeModal()
  } catch (e: any) {
    profileEditError.value = e?.message || 'Update failed'
  }
  profileEditSaving.value = false
}

const otpDrawerSending = ref(false)
async function sendDrawerLoginOtp() {
  if (!drawerUser.value?.phone || !canSendOtp()) return
  if (!confirm(`Send login OTP to ${drawerUser.value.phone}?`)) return
  otpDrawerSending.value = true
  try {
    const res = await usersApi.sendLoginOtp(drawerUser.value.id)
    toast.success('OTP Sent', res?.message || `Sent to ${res?.phoneMasked || 'user'}`)
  } catch (e: any) {
    toast.error('OTP failed', e?.message)
  }
  otpDrawerSending.value = false
}

// ── Recharge tab ─────────────────────────────────────────────────────────────
const rechargeRecords = ref<any[]>([])
const rechargeLoading = ref(false)
let rechargePollTimer: ReturnType<typeof setInterval> | null = null
let unsubCoinPurchases: (() => void) | null = null

async function fetchRechargeRecords() {
  if (!drawerUser.value) return
  rechargeLoading.value = true
  try {
    const res = await paymentsApi.listCoinPurchases({
      userId: drawerUser.value.id,
      limit: 50,
      page: 1,
      status: 'succeeded',
    })
    rechargeRecords.value = (res.items ?? []).map((p: any) => ({
      id: p.id,
      createdAt: p.createdAt,
      orderId: p.stripePaymentIntentId || p.razorpayOrderId || p.id,
      amount: p.amountGbp != null ? Number(p.amountGbp) : (p.package?.coins ?? 0),
    }))
  } catch {
    rechargeRecords.value = []
  }
  rechargeLoading.value = false
}

function startRechargeRealtime() {
  stopRechargeRealtime()
  unsubCoinPurchases = onAdminRealtime('resource:coin_purchases', (payload: any) => {
    if (payload?.userId === drawerUser.value?.id) void fetchRechargeRecords()
  })
  rechargePollTimer = setInterval(() => {
    if (drawerTab.value === 'recharge' && drawerOpen.value) void fetchRechargeRecords()
  }, 30_000)
}

function stopRechargeRealtime() {
  unsubCoinPurchases?.()
  unsubCoinPurchases = null
  if (rechargePollTimer) {
    clearInterval(rechargePollTimer)
    rechargePollTimer = null
  }
}

watch(drawerTab, (tab) => {
  if (tab === 'recharge' && drawerUser.value) {
    void fetchRechargeRecords()
    startRechargeRealtime()
  } else {
    stopRechargeRealtime()
  }
})

// ── Moderation bind / transfer ───────────────────────────────────────────────
const bindModal = ref(false)
const transferModal = ref(false)
const agencyTargetHakaId = ref('')
const agencyActionLoading = ref(false)
const agencyActionError = ref('')

function openBindModal() {
  agencyTargetHakaId.value = ''
  agencyActionError.value = ''
  bindModal.value = true
}
function openTransferModal() {
  agencyTargetHakaId.value = ''
  agencyActionError.value = ''
  transferModal.value = true
}

async function resolveAgentOwnerId(hakaId: string): Promise<string> {
  const res = await usersApi.listUsers({ search: hakaId.trim(), role: 'agent', limit: 5 })
  const match = (res.users ?? []).find(
    (u: any) => u.hakaId === hakaId.trim() || u.id === hakaId.trim(),
  )
  if (!match) throw new Error('Agent not found for that Haka ID')
  return match.id
}

async function submitBindAgency() {
  if (!drawerUser.value || drawerUser.value.role !== 'host') return
  agencyActionLoading.value = true
  agencyActionError.value = ''
  try {
    const toAgentOwnerId = await resolveAgentOwnerId(agencyTargetHakaId.value)
    await hostsApi.transferHostAgency(drawerUser.value.id, toAgentOwnerId, 'Admin bind from user panel')
    toast.success('Host bound to agency')
    bindModal.value = false
    await refreshDrawer()
  } catch (e: any) {
    agencyActionError.value = e?.message || 'Bind failed'
  }
  agencyActionLoading.value = false
}

async function submitTransferAgency() {
  if (!drawerUser.value || drawerUser.value.role !== 'host') return
  agencyActionLoading.value = true
  agencyActionError.value = ''
  try {
    const toAgentOwnerId = await resolveAgentOwnerId(agencyTargetHakaId.value)
    await hostsApi.transferHostAgency(drawerUser.value.id, toAgentOwnerId, 'Admin transfer from user panel')
    toast.success('Host transferred')
    transferModal.value = false
    await refreshDrawer()
  } catch (e: any) {
    agencyActionError.value = e?.message || 'Transfer failed'
  }
  agencyActionLoading.value = false
}

let unsubUserAgency: (() => void) | null = null
let unsubUserRisk: (() => void) | null = null

onMounted(() => {
  unsubUserAgency = onAdminRealtime('resource:user_agency', (payload: any) => {
    if (payload?.userId === drawerUser.value?.id) void refreshDrawer()
  })
  unsubUserRisk = onAdminRealtime('resource:user_risk', (payload: any) => {
    if (payload?.userId === drawerUser.value?.id && drawerUser.value) void fetchRisk(drawerUser.value.id)
  })
})

onUnmounted(() => {
  stopRechargeRealtime()
  unsubUserAgency?.()
  unsubUserRisk?.()
})

// ── Actions ───────────────────────────────────────────────────────────────────
async function executeBan() {
  if (!drawerUser.value) return
  banConfirm.value = false
  actionLoading.value = true
  try {
    if (drawerUser.value.isActive) {
      await usersApi.banUser(drawerUser.value.id)
      toast.warning('User Banned')
    } else {
      await usersApi.unbanUser(drawerUser.value.id)
      toast.success('User Unbanned')
    }
    await refreshDrawer()
    await fetchUsers()
  } catch (e: any) { toast.error('Action Failed', e?.message) }
  actionLoading.value = false
}

async function executeMute() {
  if (!drawerUser.value) return
  muteConfirm.value = false
  actionLoading.value = true
  try {
    if (drawerUser.value.isMuted) {
      await usersApi.unmuteUser(drawerUser.value.id)
      toast.success('User Unmuted')
    } else {
      await usersApi.muteUser(drawerUser.value.id)
      toast.warning('User Muted')
    }
    await refreshDrawer()
    await fetchUsers()
  } catch (e: any) { toast.error('Action Failed', e?.message) }
  actionLoading.value = false
}

async function toggleVerify() {
  if (!drawerUser.value) return
  actionLoading.value = true
  try {
    if (drawerUser.value.isVerified) {
      await modApi.unverifyUser(drawerUser.value.id)
      toast.info('Verification Removed')
    } else {
      await modApi.verifyUser(drawerUser.value.id)
      toast.success('User Verified')
    }
    await refreshDrawer()
    await fetchUsers()
  } catch (e: any) { toast.error('Action Failed', e?.message) }
  actionLoading.value = false
}

function openRoleModal() {
  newRole.value = drawerUser.value?.role || 'normal_user'
  roleModal.value = true
}

async function submitRoleChange() {
  if (!drawerUser.value || !newRole.value) return
  actionLoading.value = true
  try {
    await usersApi.changeUserRole(drawerUser.value.id, newRole.value)
    toast.success('Role Updated')
    await refreshDrawer()
    roleModal.value = false
    await fetchUsers()
  } catch (e: any) { toast.error('Role Change Failed', e?.message) }
  actionLoading.value = false
}

function openCoinsModal() {
  coinsAmount.value = ''
  coinsCurrency.value = 'coins'
  coinsReason.value = ''
  coinsModal.value = true
}

async function submitAdjustCoins() {
  if (!drawerUser.value || !coinsAmount.value || !coinsReason.value) return
  const amt = parseInt(coinsAmount.value, 10)
  if (isNaN(amt) || amt === 0) { toast.warning('Invalid Amount', 'Enter a non-zero integer.'); return }
  coinsLoading.value = true
  try {
    const result = await usersApi.adjustCoins(drawerUser.value.id, amt, coinsCurrency.value, coinsReason.value)
    const newBal = result[coinsCurrency.value === 'coins' ? 'coinBalance' : 'beanBalance']?.toLocaleString()
    toast.success('Balance Adjusted', `New ${coinsCurrency.value} balance: ${newBal}`)
    coinsModal.value = false
    await refreshDrawer()
    await fetchUsers()
  } catch (e: any) { toast.error('Adjustment Failed', e?.message) }
  coinsLoading.value = false
}

async function handleResetPassword() {
  if (!drawerUser.value) return
  resetSaving.value = true
  resetError.value = ''
  try {
    await usersApi.resetUserPassword(drawerUser.value.id, resetNewPassword.value)
    toast.success('Password Reset', "The user's password has been updated.")
    resetPasswordModal.value = false
    resetNewPassword.value = ''
  } catch (e: any) {
    resetError.value = e?.message || 'Failed to reset password'
  }
  resetSaving.value = false
}

async function executeDelete() {
  if (!drawerUser.value) return
  deleteLoading.value = true
  try {
    await usersApi.deleteUser(drawerUser.value.id)
    toast.success('User Deleted')
    deleteConfirm.value = false
    closeDrawer()
    await fetchUsers()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

onMounted(() => {
  fetchUsers()
  fetchAllTags()
})
watch(() => pagination.value.page, fetchUsers)
</script>

<template>
  <div class="page">
    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-row">
        <div class="filter-field">
          <label class="filter-label">VIP ID:</label>
          <input v-model="vipIdFilter" @keyup.enter="handleSearch" type="text" class="filter-input" placeholder="Enter VIP id" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Search:</label>
          <input v-model="search" @keyup.enter="handleSearch" type="text" class="filter-input" placeholder="Name, phone, email, Haka ID…" />
        </div>
        <div class="filter-field">
          <label class="filter-label">User type:</label>
          <select v-model="roleFilter" @change="handleSearch" class="filter-select">
            <option value="">Normal User</option>
            <option value="host">Host</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <div class="filter-field filter-field-long">
          <label class="filter-label">Long ID:</label>
          <input v-model="longIdFilter" @keyup.enter="handleSearch" type="text" class="filter-input filter-input-long" placeholder="Please input User long id..." />
        </div>
        <button class="btn-search" @click="handleSearch">Search</button>
        <button class="btn-reset" @click="handleReset">Reset</button>
      </div>
    </div>

    <!-- Selection Banner -->
    <div v-if="selectedUsers.length > 0" class="selection-banner">
      <span class="selection-info-icon">ℹ</span>
      Selected <strong>{{ selectedUsers.length }}</strong> Item
      <template v-if="auth.hasPermission('user.tag_assign')">
        <select v-model="bulkTagId" class="bulk-tag-select">
          <option value="">Assign Tag…</option>
          <option v-for="tag in allTags" :key="tag.id" :value="tag.id">{{ tag.displayName }}</option>
        </select>
        <button class="bulk-tag-btn" :disabled="bulkTagLoading || !bulkTagId" @click="bulkAssignSelectedTag">
          {{ bulkTagLoading ? 'Assigning...' : 'Apply' }}
        </button>
      </template>
      <a class="clear-link" @click="clearSelection">Clear</a>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading users...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th class="th-check">
              <input type="checkbox"
                :checked="selectedUsers.length === users.length && users.length > 0"
                :indeterminate="selectedUsers.length > 0 && selectedUsers.length < users.length"
                @change="toggleSelectAll(($event.target as HTMLInputElement).checked)" />
            </th>
            <th>Haka ID</th>
            <th>Long ID</th>
            <th>Nickname</th>
            <th>Avatar</th>
            <th>Face ID</th>
            <th>App name</th>
            <th>Role</th>
            <th>Tags</th>
            <th class="actions-th">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id"
            :class="{ 'row-selected': selectedUsers.includes(user.id) }">
            <td class="td-check">
              <input type="checkbox"
                :checked="selectedUsers.includes(user.id)"
                @change="toggleSelectUser(user.id, ($event.target as HTMLInputElement).checked)" />
            </td>
            <td class="id-cell-td">
              <div class="id-cell-row">
                <span class="uid-cell" @click="openDrawer(user.id)">{{ user.hakaId || '—' }}</span>
                <button
                  v-if="user.hakaId"
                  type="button"
                  class="copy-icon-btn"
                  title="Copy Haka ID"
                  aria-label="Copy Haka ID"
                  @click.stop="copyText(user.hakaId, 'Haka ID copied')"
                >
                  📋
                </button>
              </div>
            </td>
            <td class="id-cell-td">
              <div class="id-cell-row">
                <span class="long-id-cell" @click="openDrawer(user.id)">
                  {{ user.id ? (user.id.length > 13 ? user.id.slice(0, 13) + '....' : user.id) : '—' }}
                </span>
                <button
                  v-if="user.id"
                  type="button"
                  class="copy-icon-btn"
                  title="Copy account UUID"
                  aria-label="Copy account UUID"
                  @click.stop="copyText(user.id, 'Long ID copied')"
                >
                  📋
                </button>
              </div>
            </td>
            <td>{{ user.displayName || 'Unnamed' }}</td>
            <td>
              <div class="thumb-wrap">
                <img v-if="user.avatarUrl || user.avatar" :src="user.avatarUrl || user.avatar" alt="avatar" class="thumb-img" />
                <div v-else class="thumb-fallback">{{ user.displayName?.charAt(0) || '?' }}</div>
              </div>
            </td>
            <td>
              <div class="thumb-wrap">
                <img v-if="user.facePhotoUrl" :src="user.facePhotoUrl" alt="face" class="thumb-img" />
                <img v-else-if="user.avatarUrl || user.avatar" :src="user.avatarUrl || user.avatar" alt="face" class="thumb-img" />
                <div v-else class="thumb-fallback">—</div>
              </div>
            </td>
            <td>
              <span class="app-badge">{{ user.appName || 'Haka' }}</span>
            </td>
            <td>
              <span class="role-badge" :class="'role-' + (user.role || 'normal_user')">
                {{ formatRole(user.role) }}
              </span>
            </td>
            <td>
              <div class="row-tags">
                <span
                  v-for="ut in (user.userTags || []).slice(0, 3)"
                  :key="ut.tagId"
                  class="row-tag"
                  :style="{ background: ut.tag?.color || '#7B4FFF' }"
                >
                  {{ ut.tag?.displayName || 'Tag' }}
                </span>
                <span v-if="(user.userTags || []).length > 3" class="row-tag-more">+{{ (user.userTags || []).length - 3 }}</span>
                <span v-if="!(user.userTags || []).length" class="dim">—</span>
              </div>
            </td>
            <td @click.stop class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem @click="openDrawer(user.id)">Edit</RowActionMenuItem>
                <RowActionMenuItem @click="router.push('/users/' + user.id)">More</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total"
        @update:page="(p) => pagination.page = p" />
    </div>
  </div>

  <!-- ── User Detail Modal ── -->
  <Teleport to="body">
    <div v-if="drawerOpen" class="user-modal-overlay" @click.self="closeDrawer">
      <div class="user-modal">

        <div class="user-modal-header">
          <span class="user-modal-title">User Details Panel</span>
          <button class="user-modal-close" @click="closeDrawer">✕</button>
        </div>

        <div v-if="drawerLoading" class="user-modal-loading">Loading...</div>

        <div v-else-if="drawerError" class="user-modal-loading user-modal-error">
          Failed to load user details. Please try again.
          <button class="btn btn-secondary" style="margin-top:12px" @click="closeDrawer">Close</button>
        </div>

        <div v-else-if="drawerUser" class="user-modal-body">

          <!-- Tabs -->
          <div class="user-modal-tabs">
            <button :class="['umtab', drawerTab === 'userDetails' ? 'umtab-active' : '']" @click="drawerTab = 'userDetails'">User Details</button>
            <button :class="['umtab', drawerTab === 'roomDetails' ? 'umtab-active' : '']" @click="drawerTab = 'roomDetails'">Room Details</button>
            <button :class="['umtab', drawerTab === 'recharge' ? 'umtab-active' : '']" @click="drawerTab = 'recharge'">Recharge Record</button>
            <button :class="['umtab', drawerTab === 'sameDevice' ? 'umtab-active' : '']" @click="drawerTab = 'sameDevice'">
              Same Device Account
              <span v-if="deviceData.linkedAccounts.length" class="umtab-count">{{ deviceData.linkedAccounts.length }}</span>
            </button>
            <button :class="['umtab', drawerTab === 'moderation' ? 'umtab-active' : '', riskData?.active ? 'umtab-risk-active' : '']"
              @click="drawerTab = 'moderation'">
              Moderation Details
              <span v-if="riskData?.active" class="umtab-count umtab-count-risk">1</span>
            </button>
          </div>

          <div class="user-modal-pane">

          <!-- User Details tab -->
          <div v-if="drawerTab === 'userDetails'" class="tab-pane ud-pane">
            <div class="ud3-grid">

              <!-- LEFT: avatar + action buttons -->
              <div class="ud3-left">
                <div class="ud3-avatar" @click="handleUserAvatarUpload" title="Click to change avatar">
                  <img v-if="drawerUser.avatar" :src="drawerUser.avatar" class="ud3-avatar-img" alt="avatar" />
                  <span v-else>{{ drawerUser.displayName?.charAt(0) || '?' }}</span>
                  <div v-if="avatarUploading" class="avatar-upload-overlay">⏳</div>
                </div>
                <div class="ud3-actions">
                  <button class="ud3-btn" :disabled="actionLoading" @click="banConfirm = true">Reset/Ban</button>
                  <button class="ud3-btn" :disabled="actionLoading" @click="openRiskModal">Freeze/Ban</button>
                  <button class="ud3-btn" :disabled="actionLoading" @click="toggleVerify">Normal Album</button>
                  <button class="ud3-btn" :disabled="actionLoading" @click="openCoinsModal">Wallet Setting</button>
                  <button class="ud3-btn" :disabled="actionLoading" @click="muteConfirm = true">Reset Bio</button>
                  <button class="ud3-btn" :disabled="actionLoading" @click="openRoleModal">Wallet Auth</button>
                </div>
              </div>

              <!-- MIDDLE: name + user fields -->
              <div class="ud3-mid">
                <div class="ud3-name-row">
                  <span class="ud3-name">{{ drawerUser.displayName || 'Unnamed' }}</span>
                  <span class="ud3-status-pill" :class="drawerUser.isActive ? 'ud3-pill-normal' : 'ud3-pill-banned'">
                    {{ drawerUser.isActive ? 'Normal' : 'Banned' }}
                  </span>
                </div>
                <EditableFieldRow
                  label="Name"
                  :value="drawerUser.displayName || '—'"
                  :can-edit="canEditUser()"
                  @edit="openEditName"
                />
                <div class="ud3-info">Haka ID: {{ drawerUser.hakaId || '—' }}</div>
                <div class="ud3-info">VIP ID: {{ drawerUser.hakaId || '—' }}</div>
                <EditableFieldRow
                  label="Country"
                  :value="drawerUser.country || '—'"
                  :can-edit="canEditUser()"
                  @edit="openEditCountry"
                />
                <EditableFieldRow
                  label="Sex"
                  :value="genderLabel(drawerUser.gender)"
                  :can-edit="canEditUser()"
                  @edit="openEditGender"
                />
                <EditableFieldRow
                  label="Level"
                  :value="String(drawerUser.level?.richLevel ?? '—')"
                  :can-edit="canEditUser()"
                  @edit="openEditLevel"
                />
                <div class="ud3-info">Gold: {{ drawerUser.wallet ? drawerUser.wallet.coinBalance.toLocaleString() : '—' }}</div>
                <EditableFieldRow
                  label="Charm"
                  :value="String(drawerUser.level?.charmLevel ?? '—')"
                  :can-edit="canEditUser()"
                  @edit="openEditLevel"
                />
                <EditableFieldRow
                  v-if="drawerUser.phone"
                  label="Phone"
                  :value="drawerUser.phone"
                  :can-edit="canEditUser()"
                  @edit="openEditPhone"
                />
                <div v-else-if="canEditUser()" class="ud3-info">
                  Phone: —
                  <button type="button" class="editable-pencil-inline" @click="openEditPhone">✏️</button>
                </div>
                <div v-if="canSendOtp() && drawerUser.phone" class="ud3-otp-row">
                  <button
                    type="button"
                    class="ud3-btn ud3-btn-otp"
                    :disabled="otpDrawerSending"
                    @click="sendDrawerLoginOtp"
                  >
                    {{ otpDrawerSending ? 'Sending…' : 'Generate Login OTP' }}
                  </button>
                </div>
              </div>

              <!-- RIGHT: role + ids -->
              <div class="ud3-right">
                <div class="ud3-role-row">
                  <span class="ud3-info-label">Role:</span>
                  <div class="ud-role-chips"><StatusBadge :value="drawerUser.role" /></div>
                </div>
                <div class="ud3-info">Long ID: {{ drawerUser.id }}</div>
                <div class="ud3-info">APP ID: {{ (drawerUser as any).appId || 'Haka' }}</div>
                <div class="ud3-info">Agency ID: {{ drawerUser.agent?.id ? drawerUser.agent.id.slice(0,8) : '—' }}</div>
                <div class="ud3-info">BD ID: {{ drawerUser.bdId || drawerUser.bdDisplayName || '—' }}</div>
                <div class="ud3-info">Register Source: {{ (drawerUser as any).registrationSource || 'Normal' }}</div>
                <div class="ud3-info">Recent Login: {{ (drawerUser as any).lastLoginAt ? new Date((drawerUser as any).lastLoginAt).toLocaleString() : new Date(drawerUser.updatedAt).toLocaleString() }}</div>
                <div class="ud3-info">Device Code: {{ deviceData.devices[0]?.deviceId || '—' }}</div>
              </div>

            </div>

            <!-- Tags section below columns -->
            <div class="ud3-tags-wrap">
              <div class="ud-section-title">Tags</div>
              <div class="tags-panel">
                <div v-if="userTags.length === 0" class="empty">No tags assigned.</div>
                <div v-else class="tag-list">
                  <div v-for="ut in userTags" :key="ut.id" class="tag-badge-wrap">
                    <img v-if="ut.tag.iconUrl" :src="resolveTagIconUrl(ut.tag.iconUrl)" :alt="ut.tag.displayName" class="tag-badge-img" />
                    <span v-else class="tag-badge-fallback" :style="{ background: ut.tag.color }">{{ ut.tag.displayName }}</span>
                    <button class="tag-remove-floating" @click="revokeUserTag(ut.tagId, ut.tag.displayName)" title="Remove">×</button>
                  </div>
                </div>
                <div class="tag-assign-row">
                  <select v-model="selectedTagId" class="form-input">
                    <option value="">Select a tag to assign…</option>
                    <option v-for="t in allTags.filter(t => !userTags.find(u => u.tagId === t.id))" :key="t.id" :value="t.id">{{ t.displayName }}</option>
                  </select>
                  <button class="btn btn-primary" :disabled="!selectedTagId || tagsLoading" @click="assignSelectedTag">Assign Tag</button>
                </div>
                <p class="tag-note">Assigning or removing a tag logs the user out so the new permissions take effect immediately.</p>
              </div>
            </div>
          </div>

          <!-- Room Details tab -->
          <div v-if="drawerTab === 'roomDetails'" class="tab-pane rd-pane">
            <template v-if="drawerUser.hostedRooms?.length">
              <div v-for="room in drawerUser.hostedRooms" :key="room.id" class="rd2-grid">

                <!-- LEFT: avatar + action buttons -->
                <div class="rd2-left">
                  <div class="rd2-avatar">
                    <img v-if="drawerUser.avatar" :src="drawerUser.avatar" alt="avatar" class="rd2-avatar-img" />
                    <span v-else>{{ drawerUser.displayName?.charAt(0) || '?' }}</span>
                  </div>
                  <div class="ud3-actions">
                    <button class="ud3-btn">Room Setting</button>
                    <button class="ud3-btn">Reset Notice</button>
                    <button class="ud3-btn">Reset Room</button>
                    <button class="ud3-btn">Room Ban</button>
                    <button class="ud3-btn">Update Admin</button>
                  </div>
                </div>

                <!-- RIGHT: name/badge + room fields -->
                <div class="rd2-right">
                  <div class="ud3-name-row">
                    <span class="ud3-name">{{ drawerUser.displayName || 'Unnamed' }}</span>
                    <span class="ud3-status-pill" :class="room.status === 'active' ? 'ud3-pill-normal' : 'ud3-pill-banned'">
                      {{ room.status === 'active' ? 'Normal' : room.status || 'Normal' }}
                    </span>
                  </div>
                  <div class="ud3-info">Room ID: {{ room.hakaId || room.id }}</div>
                  <div class="ud3-info">Room owner: {{ drawerUser.hakaId || drawerUser.displayName }}</div>
                  <div class="ud3-info">Room Mic: {{ room.micConfig ?? '—' }}</div>
                  <div class="ud3-info">Room Attention: {{ room.viewerCount ?? 0 }}</div>
                  <div class="ud3-info">Room Level: {{ room.level ?? '—' }}</div>
                  <div class="ud3-info">Room Announcement: {{ room.announcement || '—' }}</div>
                  <div class="ud3-info">Room Create Time: {{ new Date(room.createdAt).toLocaleString() }}</div>
                </div>

              </div>
            </template>
            <div v-else class="empty">No rooms hosted yet</div>
          </div>

          <!-- Recharge Record tab -->
          <div v-if="drawerTab === 'recharge'" class="tab-pane rc-pane">
            <div class="rc-banner">
              <span class="rc-banner-label">Total Amount:</span>
              <span class="rc-banner-value">{{ rechargeRecords.reduce((s: number, r: any) => s + (r.amount || 0), 0).toLocaleString() }}</span>
              <span class="rc-banner-count">(total:{{ rechargeRecords.length }})</span>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="rechargeLoading" @click="fetchRechargeRecords">
                {{ rechargeLoading ? 'Refreshing…' : 'Refresh' }}
              </button>
            </div>
            <div v-if="rechargeLoading && rechargeRecords.length === 0" class="empty">Loading recharge records…</div>
            <table v-else class="rc-table">
              <thead>
                <tr>
                  <th>Completed Time</th>
                  <th>Order Id</th>
                  <th>Amount($)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!rechargeRecords.length">
                  <td colspan="3" class="rc-empty">No recharge records found</td>
                </tr>
                <tr v-for="rec in rechargeRecords" :key="rec.id" class="rc-row">
                  <td class="rc-time">
                    <span class="rc-date">{{ new Date(rec.createdAt).toLocaleDateString('en-CA') }}</span>
                    <span class="rc-hour">{{ new Date(rec.createdAt).toLocaleTimeString('en-GB') }}</span>
                  </td>
                  <td class="rc-order">{{ rec.orderId }}</td>
                  <td class="rc-amount-val">{{ rec.amount?.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Same Device Account tab -->
          <div v-if="drawerTab === 'sameDevice'" class="tab-pane sd-pane">
            <div v-if="deviceLoading" class="empty">Loading device data…</div>
            <template v-else>
              <div class="sd-banner">
                Total number of device account: <strong>{{ deviceData.linkedAccounts.length }}</strong>
              </div>
              <div class="sd-section-title">Devices</div>
              <div v-if="deviceData.devices.length === 0" class="empty" style="margin: 0 16px 16px;">
                No device data found for this user.
              </div>
              <table v-else class="sd-table">
                <thead>
                  <tr>
                    <th>Device Code</th>
                    <th>Platform</th>
                    <th>Model</th>
                    <th>Last Seen</th>
                    <th>Other Accounts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in deviceData.devices" :key="d.deviceId" class="sd-row sd-row-static">
                    <td class="sd-mono">{{ d.deviceId }}</td>
                    <td>{{ d.platform || '—' }}</td>
                    <td>{{ d.deviceModel || '—' }}</td>
                    <td>{{ d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleString() : '—' }}</td>
                    <td>{{ (d.otherAccounts ?? 0).toLocaleString() }}</td>
                  </tr>
                </tbody>
              </table>

              <div class="sd-section-title" style="margin-top: 6px;">Accounts on same device</div>
              <div v-if="deviceData.linkedAccounts.length === 0" class="empty" style="margin: 0 16px 16px;">
                No accounts found for this device.
              </div>
              <table v-else class="sd-table">
                <thead>
                  <tr>
                    <th>VIP ID</th>
                    <th>Nickname</th>
                    <th>Golds</th>
                    <th>Charm</th>
                    <th>Status</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="acc in deviceData.linkedAccounts"
                    :key="acc.id"
                    class="sd-row"
                    :class="{ 'sd-row-self': !!acc.isSelf }"
                    @click="closeDrawer(); router.push(`/users/${acc.id}`)"
                  >
                    <td>{{ acc.hakaId || '—' }}</td>
                    <td>
                      <span>{{ acc.displayName || '—' }}</span>
                      <span v-if="acc.isSelf" class="sd-self-pill">This account</span>
                    </td>
                    <td>{{ acc.wallet?.coinBalance?.toLocaleString() || '—' }}</td>
                    <td>{{ acc.level?.charmLevel || '—' }}</td>
                    <td>{{ acc.isActive ? 'Normal' : 'Banned' }}</td>
                    <td>
                      <div class="sd-role-chips">
                        <span class="role-badge" :class="'role-' + (acc.role || 'normal_user')">{{ formatRole(acc.role) }}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>

          <!-- Moderation Details tab -->
          <div v-if="drawerTab === 'moderation'" class="tab-pane md-pane">
            <table class="md-table">
              <thead>
                <tr>
                  <th>VIP ID</th>
                  <th>Nickname</th>
                  <th>admin</th>
                  <th>BD Id</th>
                  <th>Invention</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr class="md-row">
                  <td>{{ drawerUser.hakaId || '—' }}</td>
                  <td>{{ drawerUser.displayName || '—' }}</td>
                  <td>{{ drawerUser.agent?.displayName || drawerUser.agencyName || '—' }}</td>
                  <td>{{ drawerUser.bdId || drawerUser.bdDisplayName || '—' }}</td>
                  <td>{{ drawerUser.inviteCode || drawerUser.referralCode || '—' }}</td>
                  <td>
                    <div class="md-actions">
                      <button
                        class="md-btn md-btn-bind"
                        :disabled="drawerUser.role !== 'host' || !canEditUser()"
                        :title="drawerUser.role !== 'host' ? 'Only hosts can be bound to an agency' : 'Bind host to agency'"
                        @click="openBindModal"
                      >
                        Bind
                      </button>
                      <button
                        class="md-btn md-btn-transfer"
                        :disabled="drawerUser.role !== 'host' || !canEditUser()"
                        :title="drawerUser.role !== 'host' ? 'Only hosts can be transferred' : 'Transfer host to another agency'"
                        @click="openTransferModal"
                      >
                        Transfer
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          </div><!-- /user-modal-pane -->

          <div class="user-modal-footer">
            <button class="btn btn-secondary" @click="closeDrawer">Cancel</button>
            <button class="btn btn-primary" @click="closeDrawer">OK</button>
          </div>

        </div><!-- /user-modal-body -->
      </div><!-- /user-modal -->
    </div><!-- /user-modal-overlay -->

    <!-- Ban/Unban confirm -->
    <div v-if="banConfirm" class="modal-overlay" @click.self="banConfirm = false">
      <div class="modal-box">
        <h3>{{ drawerUser?.isActive ? 'Ban User' : 'Unban User' }}</h3>
        <p class="modal-sub">
          {{ drawerUser?.isActive
            ? `Ban ${drawerUser?.displayName}? They will lose all access immediately.`
            : `Unban ${drawerUser?.displayName}? They will regain access.` }}
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="banConfirm = false">Cancel</button>
          <button class="btn" :class="drawerUser?.isActive ? 'btn-danger' : 'btn-success'"
            :disabled="actionLoading" @click="executeBan">
            {{ drawerUser?.isActive ? 'Yes, Ban' : 'Yes, Unban' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mute/Unmute confirm -->
    <div v-if="muteConfirm" class="modal-overlay" @click.self="muteConfirm = false">
      <div class="modal-box">
        <h3>{{ drawerUser?.isMuted ? 'Unmute User' : 'Mute User' }}</h3>
        <p class="modal-sub">
          {{ drawerUser?.isMuted
            ? `Unmute ${drawerUser?.displayName}? They will be able to chat and speak again.`
            : `Mute ${drawerUser?.displayName}? They will be silenced in chat and voice rooms.` }}
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="muteConfirm = false">Cancel</button>
          <button class="btn" :class="drawerUser?.isMuted ? 'btn-success' : 'btn-warning'"
            :disabled="actionLoading" @click="executeMute">
            {{ drawerUser?.isMuted ? 'Yes, Unmute' : 'Yes, Mute' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Role change modal -->
    <div v-if="roleModal" class="modal-overlay" @click.self="roleModal = false">
      <div class="modal-box">
        <h3>Change Role</h3>
        <p class="modal-sub">User: <strong>{{ drawerUser?.displayName }}</strong></p>
        <div class="form-group">
          <label class="form-label">New Role</label>
          <select v-model="newRole" class="form-input">
            <option value="normal_user">Normal User</option>
            <option value="host">Host</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="roleModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="actionLoading" @click="submitRoleChange">Save</button>
        </div>
      </div>
    </div>

    <!-- Adjust Coins modal -->
    <div v-if="coinsModal" class="modal-overlay" @click.self="coinsModal = false">
      <div class="modal-box">
        <h3>🪙 Adjust Balance</h3>
        <p class="modal-sub">User: <strong>{{ drawerUser?.displayName }}</strong></p>
        <div v-if="drawerUser?.wallet" class="coins-current">
          <span>🪙 {{ drawerUser.wallet.coinBalance.toLocaleString() }} coins</span>
          <span>🫘 {{ drawerUser.wallet.beanBalance.toLocaleString() }} beans</span>
        </div>
        <div class="form-group">
          <label class="form-label">Currency</label>
          <select v-model="coinsCurrency" class="form-input">
            <option value="coins">Coins 🪙</option>
            <option value="beans">Beans 🫘</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount (positive = add, negative = deduct)</label>
          <input v-model="coinsAmount" type="number" class="form-input" placeholder="e.g. 500 or -200" />
        </div>
        <div class="form-group">
          <label class="form-label">Reason (required)</label>
          <input v-model="coinsReason" type="text" class="form-input" placeholder="e.g. Event reward, compensation..." />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="coinsModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="coinsLoading || !coinsAmount || !coinsReason" @click="submitAdjustCoins">
            {{ coinsLoading ? 'Processing...' : 'Apply' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reset Password modal -->
    <div v-if="resetPasswordModal" class="modal-overlay" @click.self="resetPasswordModal = false">
      <div class="modal-box">
        <h3>Reset Password — {{ drawerUser?.displayName }}</h3>
        <p class="modal-sub">This will update the user's password. They will need to use the new password on next login.</p>
        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label">New Password (min 8 characters)</label>
          <input
            v-model="resetNewPassword"
            type="password"
            class="form-input"
            placeholder="Enter new password…"
            minlength="8"
          />
        </div>
        <p v-if="resetError" style="color: var(--danger); font-size: 13px; margin-top: 8px;">{{ resetError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="resetPasswordModal = false; resetNewPassword = ''; resetError = ''">Cancel</button>
          <button class="btn btn-danger" :disabled="resetSaving || resetNewPassword.length < 8" @click="handleResetPassword">
            {{ resetSaving ? 'Resetting…' : 'Reset Password' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = false">
      <div class="modal-box">
        <h3>Delete Account Permanently</h3>
        <p class="modal-sub" style="color: #991b1b;">
          This will <strong>permanently delete</strong> {{ drawerUser?.displayName }}'s account and all associated data.
          This action cannot be undone.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="deleteConfirm = false">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="executeDelete">
            {{ deleteLoading ? 'Deleting...' : 'Permanently Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Risk Control modal -->
    <div v-if="riskModal" class="modal-overlay" @click.self="riskModal = false">
      <div class="modal-box modal-wide">
        <h3>⚠️ {{ riskData?.active ? 'Update Risk Control' : 'Apply Risk Control' }}</h3>
        <p class="modal-sub">Account: <strong>{{ drawerUser?.displayName }}</strong></p>

        <!-- Freeze toggles -->
        <div class="section-label" style="margin-bottom:8px">Freeze Controls</div>
        <div class="freeze-grid">
          <label class="freeze-toggle" :class="{ active: riskForm.freezeCoins }">
            <input type="checkbox" v-model="riskForm.freezeCoins" />
            <span class="toggle-icon">🪙</span>
            <span class="toggle-label">Freeze Coins</span>
          </label>
          <label class="freeze-toggle" :class="{ active: riskForm.freezeBeans }">
            <input type="checkbox" v-model="riskForm.freezeBeans" />
            <span class="toggle-icon">🫘</span>
            <span class="toggle-label">Freeze Beans</span>
          </label>
          <label class="freeze-toggle" :class="{ active: riskForm.disableGames }">
            <input type="checkbox" v-model="riskForm.disableGames" />
            <span class="toggle-icon">🎮</span>
            <span class="toggle-label">Disable Games</span>
          </label>
          <label class="freeze-toggle" :class="{ active: riskForm.disableGifts }">
            <input type="checkbox" v-model="riskForm.disableGifts" />
            <span class="toggle-icon">🎁</span>
            <span class="toggle-label">Disable Gifts</span>
          </label>
          <label class="freeze-toggle" :class="{ active: riskForm.blockChat }">
            <input type="checkbox" v-model="riskForm.blockChat" />
            <span class="toggle-icon">💬</span>
            <span class="toggle-label">Block Chat</span>
          </label>
        </div>

        <div class="form-row" style="margin-top:14px">
          <div class="form-group">
            <label class="form-label">Reason</label>
            <select v-model="riskForm.reason" class="form-input">
              <option value="fraud_activity">Fraud Activity</option>
              <option value="suspicious_transactions">Suspicious Transactions</option>
              <option value="multiple_accounts">Multiple Accounts</option>
              <option value="chargeback">Chargeback</option>
              <option value="manual_review">Manual Review</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Severity</label>
            <select v-model="riskForm.severity" class="form-input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top:10px">
          <label class="form-label">Duration</label>
          <div class="duration-grid">
            <button v-for="d in [{ v:'24h', l:'24 Hours' },{ v:'7d', l:'7 Days' },{ v:'30d', l:'30 Days' },{ v:'permanent', l:'Permanent' }]"
              :key="d.v"
              :class="['duration-btn', riskForm.duration === d.v ? 'duration-active' : '']"
              @click="riskForm.duration = d.v" type="button">{{ d.l }}</button>
          </div>
        </div>

        <div class="form-group" style="margin-top:10px">
          <label class="form-label">Notes (optional)</label>
          <textarea v-model="riskForm.notes" class="form-textarea" rows="2" placeholder="Internal note..." />
        </div>

        <!-- Evidence upload -->
        <div class="form-group" style="margin-top:10px">
          <label class="form-label">Evidence Files</label>
          <div class="evidence-upload-area">
            <label class="evidence-upload-btn" :class="{ uploading: evidenceUploading }">
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx" @change="handleEvidenceChange" :disabled="evidenceUploading" />
              {{ evidenceUploading ? '⏳ Uploading...' : '📎 Upload Evidence' }}
            </label>
            <div v-if="evidenceUrls.length" class="evidence-uploaded-list">
              <div v-for="url in evidenceUrls" :key="url" class="evidence-uploaded-item">
                <a :href="url" target="_blank" class="evidence-link">{{ url.split('/').pop() }}</a>
                <button class="evidence-remove" @click="removeEvidence(url)">✕</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="riskModal = false">Cancel</button>
          <button class="btn btn-danger" :disabled="riskSubmitting || evidenceUploading" @click="submitRisk">
            {{ riskSubmitting ? 'Applying...' : (riskData?.active ? 'Update Freeze' : 'Apply Freeze') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Release risk confirm -->
    <div v-if="riskReleaseConfirm" class="modal-overlay" @click.self="riskReleaseConfirm = false">
      <div class="modal-box">
        <h3>Release Risk Control</h3>
        <p class="modal-sub">Remove all freezes from <strong>{{ drawerUser?.displayName }}</strong>'s account?</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="riskReleaseConfirm = false">Cancel</button>
          <button class="btn btn-success" :disabled="actionLoading" @click="executeReleaseRisk">
            Yes, Release Account
          </button>
        </div>
      </div>
    </div>

    <!-- Edit name -->
    <div v-if="editNameModal" class="modal-overlay" @click.self="editNameModal = false">
      <div class="modal-box">
        <h3>Edit Name</h3>
        <p class="modal-sub">Correct fake, abusive, or policy-violating names.</p>
        <input v-model="editNameValue" class="form-input" maxlength="50" />
        <p v-if="profileEditError" class="form-error">{{ profileEditError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editNameModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="profileEditSaving || !editNameValue.trim()"
            @click="saveProfileEdit(
              () => usersApi.updateProfileName(drawerUser!.id, editNameValue.trim()),
              'Name updated',
              () => { editNameModal = false },
            )"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- Edit country -->
    <div v-if="editCountryModal" class="modal-overlay" @click.self="editCountryModal = false">
      <div class="modal-box">
        <h3>Change User Location</h3>
        <p class="modal-sub">Fix incorrect country assignment. Users cannot change this themselves after Haka ID is created.</p>
        <input v-model="editCountryValue" class="form-input" placeholder="Country" />
        <p v-if="profileEditError" class="form-error">{{ profileEditError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editCountryModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="profileEditSaving || !editCountryValue.trim()"
            @click="saveProfileEdit(
              () => usersApi.updateProfileCountry(drawerUser!.id, editCountryValue.trim()),
              'Country updated',
              () => { editCountryModal = false },
            )"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- Edit gender -->
    <div v-if="editGenderModal" class="modal-overlay" @click.self="editGenderModal = false">
      <div class="modal-box">
        <h3>Change Gender</h3>
        <p class="modal-sub">Correct wrong gender selection.</p>
        <select v-model="editGenderValue" class="form-input">
          <option value="">Not set</option>
          <option value="male">Boy</option>
          <option value="female">Girl</option>
        </select>
        <p v-if="profileEditError" class="form-error">{{ profileEditError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editGenderModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="profileEditSaving"
            @click="saveProfileEdit(
              () => usersApi.updateProfileGender(drawerUser!.id, editGenderValue),
              'Gender updated',
              () => { editGenderModal = false },
            )"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- Edit phone -->
    <div v-if="editPhoneModal" class="modal-overlay" @click.self="editPhoneModal = false">
      <div class="modal-box">
        <h3>Change Mobile Number</h3>
        <p class="modal-sub">Lost SIM, wrong number, or account recovery.</p>
        <input v-model="editPhoneValue" class="form-input" placeholder="+447..." />
        <p v-if="profileEditError" class="form-error">{{ profileEditError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editPhoneModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="profileEditSaving || editPhoneValue.trim().length < 5"
            @click="saveProfileEdit(
              () => usersApi.updateProfilePhone(drawerUser!.id, editPhoneValue.trim()),
              'Phone updated',
              () => { editPhoneModal = false },
            )"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- Force level -->
    <div v-if="editLevelModal" class="modal-overlay" @click.self="editLevelModal = false">
      <div class="modal-box">
        <h3>Force Level</h3>
        <p class="modal-sub">Set rich and charm level (1–100).</p>
        <div class="form-group">
          <label class="form-label">Rich Level</label>
          <input v-model.number="levelForm.richLevel" type="number" min="1" max="100" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Charm Level</label>
          <input v-model.number="levelForm.charmLevel" type="number" min="1" max="100" class="form-input" />
        </div>
        <p v-if="profileEditError" class="form-error">{{ profileEditError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editLevelModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="profileEditSaving"
            @click="saveProfileEdit(
              () => usersApi.forceSetLevel(drawerUser!.id, {
                richLevel: levelForm.richLevel,
                charmLevel: levelForm.charmLevel,
              }),
              'Level updated',
              () => { editLevelModal = false },
            )"
          >Save</button>
        </div>
      </div>
    </div>

    <!-- Bind / Transfer agency -->
    <div v-if="bindModal || transferModal" class="modal-overlay" @click.self="bindModal = false; transferModal = false">
      <div class="modal-box">
        <h3>{{ bindModal ? 'Bind to Agency' : 'Transfer Agency' }}</h3>
        <p class="modal-sub">Enter the target agent's Haka ID (agency owner).</p>
        <input v-model="agencyTargetHakaId" class="form-input" placeholder="Agent Haka ID" />
        <p v-if="agencyActionError" class="form-error">{{ agencyActionError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="bindModal = false; transferModal = false">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="agencyActionLoading || !agencyTargetHakaId.trim()"
            @click="bindModal ? submitBindAgency() : submitTransferAgency()"
          >
            {{ agencyActionLoading ? 'Saving…' : (bindModal ? 'Bind' : 'Transfer') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Page & filter bar ─────────────────────────────────────────────── */
.page { display: flex; flex-direction: column; gap: 12px; }

.filter-bar { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 14px 16px; }
.filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.filter-field { display: flex; align-items: center; gap: 6px; }
.filter-field-long { flex: 1; min-width: 220px; }
.filter-label { font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; flex-shrink: 0; }
.filter-input { height: 36px; padding: 0 10px; border: 1px solid var(--card-border); border-radius: 6px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; width: 130px; }
.filter-input:focus { border-color: var(--primary); }
.filter-input-long { width: 100%; }
.filter-select { height: 36px; padding: 0 8px; border: 1px solid var(--card-border); border-radius: 6px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; cursor: pointer; }
.btn-search { height: 36px; padding: 0 22px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-search:hover { background: var(--primary-dark); }
.btn-reset { height: 36px; padding: 0 18px; background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.btn-reset:hover { border-color: var(--primary); color: var(--primary); }

/* ── Selection banner ──────────────────────────────────────────────── */
.selection-banner { background: #EAF4FD; border: 1px solid #B8DCF5; border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1a6fa8; }
.selection-info-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: #1a6fa8; color: #fff; border-radius: 50%; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.selection-banner strong { color: var(--primary); font-weight: 700; }
.clear-link { margin-left: 4px; color: var(--primary); font-weight: 600; cursor: pointer; text-decoration: underline; }
.clear-link:hover { color: var(--primary-dark); }
.bulk-tag-select { height: 30px; padding: 0 8px; border: 1px solid #B8DCF5; border-radius: 6px; background: #fff; font-size: 12px; }
.bulk-tag-btn { height: 30px; padding: 0 12px; border: none; border-radius: 6px; background: var(--primary); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
.bulk-tag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Shared buttons ─────────────────────────────────────────────────── */
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-success { background: #22C97A; color: #fff; }
.btn-danger  { background: #FF4D4D; color: #fff; }
.btn-warning { background: #E8A020; color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-full { width: 100%; }

/* ── Table ──────────────────────────────────────────────────────────── */
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden; padding: 0 0 8px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text-primary); background: #F8FAFC; border-bottom: 1px solid var(--card-border); white-space: nowrap; }
.data-table td { padding: 9px 12px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.th-check, .td-check { width: 40px; text-align: center; }
/* Inner wrapper only — never display:flex on <td> or column alignment breaks */
.id-cell-td { vertical-align: middle; }
.id-cell-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.uid-cell { color: var(--primary); font-weight: 600; cursor: pointer; white-space: nowrap; }
.uid-cell:hover { text-decoration: underline; }
.long-id-cell { color: var(--primary); font-size: 12px; cursor: pointer; white-space: nowrap; font-family: monospace; }
.long-id-cell:hover { text-decoration: underline; }
.copy-icon-btn {
  flex-shrink: 0;
  padding: 2px 4px;
  margin: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.5;
}
.copy-icon-btn:hover { opacity: 1; }
.thumb-wrap { width: 36px; height: 36px; border-radius: 4px; overflow: hidden; background: #E8EDF3; display: flex; align-items: center; justify-content: center; }
.thumb-img { width: 100%; height: 100%; object-fit: cover; }
.thumb-fallback { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.app-badge { display: inline-block; padding: 2px 8px; background: #1a7fd4; color: #fff; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; }
.role-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.role-normal_user { background: rgba(255,85,0,0.1); color: var(--primary); }
.role-host { background: rgba(34,201,122,0.12); color: #16a55e; }
.role-agent { background: rgba(255,85,0,0.1); color: var(--primary); }
.role-admin, .role-super_admin { background: rgba(91,33,182,0.1); color: #5B21B6; }
.row-tags { display: flex; flex-wrap: wrap; gap: 4px; min-width: 120px; }
.row-tag { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; }
.row-tag-more { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 999px; background: #e2e8f0; color: #475569; font-size: 10px; font-weight: 700; }
.action-cell { white-space: nowrap; }
.action-edit { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--primary); padding: 2px 6px; }
.action-edit:hover { text-decoration: underline; }
.action-more { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #FF4D4D; padding: 2px 6px; margin-left: 4px; }
.action-more:hover { text-decoration: underline; }
.row-selected { background: rgba(255,85,0,0.04); }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--row-hover); }
.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar-sm { width: 32px; height: 32px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.cell-primary { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.cell-secondary { font-size: 12px; color: var(--text-muted); }
.haka-id { color: var(--primary); font-weight: 700; }
.level-badge { background: var(--warning-soft); color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.coin-cell { font-size: 12px; font-weight: 600; color: #92400e; }
.status-stack { display: flex; flex-direction: column; gap: 4px; }
.muted-badge { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; display: inline-block; }
.dim { color: var(--text-muted); }
.btn-row-action { padding: 4px 12px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-row-action:hover { background: var(--primary-dark); }

/* ── User Detail Modal ──────────────────────────────────────────────── */
.user-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9050; display: flex; align-items: center; justify-content: center; padding: 16px; }
.user-modal { width: min(880px, 100%); min-height: 220px; max-height: calc(100vh - 32px); background: var(--card-bg); border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 25px 80px rgba(0,0,0,.35); overflow: hidden; }
.user-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.user-modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.user-modal-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 8px; width: 32px; height: 32px; font-size: 14px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.user-modal-close:hover { color: var(--danger); border-color: var(--danger); }
.user-modal-loading { padding: 60px; text-align: center; color: var(--text-muted); font-size: 14px; display: flex; flex-direction: column; align-items: center; }
.user-modal-error { color: var(--danger); }
.user-modal-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.user-modal-pane { flex: 1; overflow-y: auto; min-height: 0; }

/* Profile + actions */
.um-profile { display: flex; align-items: center; gap: 14px; padding: 16px 24px; background: var(--content-bg); border-bottom: 1px solid var(--card-border); flex-shrink: 0; flex-wrap: wrap; }
.profile-avatar-lg {
  width: 64px; height: 64px; border-radius: 50%; background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700;
  flex-shrink: 0; cursor: pointer; overflow: hidden; position: relative;
}
.profile-avatar-lg:hover::after {
  content: '📷'; position: absolute; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; font-size: 18px; border-radius: 50%;
}
.profile-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.avatar-upload-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; font-size: 14px; border-radius: 50%;
}
.um-info { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.um-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.profile-name { font-size: 17px; font-weight: 700; color: var(--text-primary); }
.profile-sub { font-size: 13px; color: var(--text-muted); }
.profile-badges { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.verified-badge { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }

/* Action buttons */
.action-btn { padding: 6px 12px; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-primary  { background: var(--primary); color: #fff; }
.action-success  { background: #22C97A; color: #fff; }
.action-danger   { background: #FF4D4D; color: #fff; }
.action-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.action-warning  { background: #E8A020; color: #fff; }
.action-coins    { background: #f59e0b; color: #fff; }

/* Tabs */
.user-modal-tabs { display: flex; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; overflow-x: auto; background: var(--card-bg); flex-wrap: nowrap; }
.umtab { padding: 6px 14px; background: #fff; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 13px; font-weight: 500; color: #64748B; cursor: pointer; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
.umtab-active { border-color: var(--primary); color: var(--primary); font-weight: 600; background: #fff; }
.umtab:hover:not(.umtab-active) { border-color: #94A3B8; color: var(--text-primary); }

/* Tab pane */
.tab-pane { padding: 20px; flex: 1; }
.fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.fl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.fv { font-size: 14px; color: var(--text-primary); }

/* Edit form */
.success-banner { background: #d1fae5; color: #065f46; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
.edit-form { display: flex; flex-direction: column; gap: 14px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; outline: none; background: var(--content-bg); color: var(--text-primary); }
.form-input:focus { border-color: var(--primary); }
.form-textarea { padding: 10px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; outline: none; background: var(--content-bg); color: var(--text-primary); resize: vertical; }
.form-textarea:focus { border-color: var(--primary); }

/* Wallet */
.wallet-row { display: flex; gap: 16px; margin-bottom: 12px; }
.wallet-card { flex: 1; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wallet-card.coin { background: var(--warning-soft); }
.wallet-card.bean { background: var(--success-soft); }
.wicon { font-size: 28px; }
.wamt { font-size: 26px; font-weight: 700; color: var(--text-primary); }
.wlbl { font-size: 13px; color: var(--text-muted); }
.wallet-note { font-size: 12px; color: var(--text-muted); padding: 10px; background: var(--content-bg); border-radius: 8px; }

/* Mini table */
.mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mini-table th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.mini-table td { padding: 8px 10px; border-top: 1px solid #F1F5F9; }
.fw { font-weight: 500; }
.section-label { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* Stats */
.stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; }
.stat-box { background: var(--content-bg); border-radius: 10px; padding: 14px; text-align: center; display: flex; flex-direction: column; gap: 4px; }
.sv { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.sl { font-size: 11px; color: var(--text-muted); }
.coin-val { color: #d97706; }
.bean-val { color: #059669; }

/* Devices tab */
.umtab-count {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--primary); color: #fff;
  font-size: 10px; font-weight: 700; border-radius: 10px;
  padding: 1px 5px; margin-left: 4px; vertical-align: middle;
}
.linked-count { font-size: 12px; color: var(--text-muted); font-weight: 400; }

.device-list { display: flex; flex-direction: column; gap: 8px; }
.device-item {
  display: flex; align-items: center; gap: 12px;
  background: #F8FAFC; border: 1px solid var(--card-border); border-radius: 10px; padding: 12px;
}
.device-item-icon  { font-size: 24px; flex-shrink: 0; }
.device-item-info  { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.device-item-name  { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.device-item-meta  { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dtag { padding: 1px 6px; background: var(--primary-soft); color: var(--primary); border-radius: 5px; font-size: 11px; font-weight: 600; }
.device-id-mono    { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.device-item-last  { font-size: 11px; color: var(--text-muted); }
.other-acct-badge  { padding: 2px 8px; background: var(--warning-soft); color: var(--warning); border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }

.linked-list { display: flex; flex-direction: column; gap: 8px; }
.linked-item {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px;
  background: var(--card-bg);
}
.linked-avatar {
  width: 36px; height: 36px; border-radius: 50%; background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.linked-info       { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.linked-name       { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.linked-sub        { font-size: 11px; color: var(--primary); font-weight: 600; }
.linked-device-line { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.linked-right      { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
.linked-flags      { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.flag-chip         { padding: 2px 6px; border-radius: 5px; font-size: 10px; font-weight: 700; }
.flag-banned       { background: #fee2e2; color: #991b1b; }
.flag-risk         { background: #fef3c7; color: #92400e; }
.flag-coins        { background: #fef9c3; color: #713f12; }
.btn-row-sm {
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
  border: 1px solid var(--primary); color: var(--primary); background: var(--primary-soft); cursor: pointer;
}
.btn-row-sm:hover  { background: var(--primary); color: #fff; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9100; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--card-bg); border-radius: 16px; padding: 24px; min-width: min(420px, 95vw); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal-box h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.modal-sub { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.coins-current { display: flex; gap: 16px; padding: 10px 14px; background: var(--content-bg); border-radius: 8px; margin-bottom: 14px; font-size: 13px; font-weight: 600; color: var(--text-primary); }

/* Risk tab */
.action-risk { background: #b45309; color: #fff; }
.action-risk:hover { background: #92400e; }
.umtab-risk-active { color: #b45309 !important; }
.umtab-count-risk { background: #b45309 !important; }

.risk-active-banner {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  background: #fff7ed; border: 1px solid #f97316; border-radius: 12px; padding: 14px 16px;
}
.risk-banner-left { display: flex; gap: 12px; align-items: flex-start; flex: 1; }
.risk-icon { font-size: 24px; flex-shrink: 0; }
.risk-banner-title { font-size: 14px; font-weight: 700; color: #92400e; }
.risk-banner-meta { font-size: 12px; color: #b45309; margin-top: 2px; }
.risk-freeze-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.freeze-chip { padding: 2px 8px; background: #fde68a; color: #78350f; border-radius: 5px; font-size: 11px; font-weight: 700; }
.risk-banner-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.btn-sm { padding: 5px 12px; font-size: 12px; }

.risk-no-active {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 24px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; text-align: center;
}
.risk-na-icon { font-size: 32px; }
.risk-na-text { font-size: 14px; color: #166534; font-weight: 500; }

/* Freeze toggle grid */
.freeze-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.freeze-toggle {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 8px; border: 2px solid var(--card-border); border-radius: 10px;
  cursor: pointer; transition: all 0.15s; text-align: center;
}
.freeze-toggle input { display: none; }
.freeze-toggle.active { border-color: #f97316; background: #fff7ed; }
.toggle-icon { font-size: 20px; }
.toggle-label { font-size: 11px; font-weight: 600; color: var(--text-primary); }

/* Duration grid */
.duration-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.duration-btn { padding: 8px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--content-bg); color: var(--text-primary); font-size: 12px; font-weight: 600; cursor: pointer; }
.duration-active { border-color: #f97316; background: #fff7ed; color: #92400e; }

/* Evidence upload */
.evidence-upload-area { display: flex; flex-direction: column; gap: 8px; }
.evidence-upload-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; border: 1px dashed var(--card-border); border-radius: 8px;
  font-size: 12px; font-weight: 600; color: var(--primary); cursor: pointer;
  background: var(--primary-soft); width: fit-content;
}
.evidence-upload-btn input { display: none; }
.evidence-upload-btn.uploading { opacity: 0.6; cursor: not-allowed; }
.evidence-uploaded-list { display: flex; flex-direction: column; gap: 4px; }
.evidence-uploaded-item { display: flex; align-items: center; gap: 8px; }
.evidence-link { font-size: 12px; color: var(--primary); text-decoration: none; }
.evidence-link:hover { text-decoration: underline; }
.evidence-remove { background: none; border: none; color: var(--danger); cursor: pointer; font-size: 12px; padding: 0 2px; }

.evidence-list { display: flex; flex-direction: column; gap: 4px; }
.evidence-item { font-size: 12px; color: var(--primary); text-decoration: none; padding: 4px 0; }
.evidence-item:hover { text-decoration: underline; }

/* Severity chips */
.sev-chip { padding: 2px 6px; border-radius: 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.sev-low      { background: #dcfce7; color: #166534; }
.sev-medium   { background: #fef9c3; color: #713f12; }
.sev-high     { background: #ffedd5; color: #9a3412; }
.sev-critical { background: #fee2e2; color: #991b1b; }

/* Wide modal */
.modal-wide { min-width: min(560px, 95vw); }

/* ── User Details three-column layout ────────────────────────────── */
.ud-pane { padding: 0; }

/* 3-column grid */
.ud3-grid { display: grid; grid-template-columns: 140px 1fr 1fr; gap: 0; }

/* Left column */
.ud3-left { padding: 20px 16px; border-right: 1px solid var(--card-border); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.ud3-avatar {
  width: 120px; height: 120px; border-radius: 8px;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 42px; font-weight: 700; overflow: hidden;
  position: relative; cursor: pointer; flex-shrink: 0;
}
.ud3-avatar:hover::after {
  content: '📷'; position: absolute; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; font-size: 18px; border-radius: 8px;
}
.ud3-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.ud3-actions { width: 100%; display: flex; flex-direction: column; gap: 5px; }
.ud3-btn { width: 100%; padding: 5px 6px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 11.5px; font-weight: 600; cursor: pointer; text-align: center; transition: background 0.12s; }
.ud3-btn:hover:not(:disabled) { background: var(--primary-dark); }
.ud3-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Middle column */
.ud3-mid { padding: 20px 18px; border-right: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 7px; }
.ud3-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ud3-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.ud3-status-pill { padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.ud3-pill-normal { background: #d1fae5; color: #065f46; }
.ud3-pill-banned { background: #fee2e2; color: #991b1b; }

/* Right column */
.ud3-right { padding: 20px 18px; display: flex; flex-direction: column; gap: 7px; }
.ud3-role-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ud3-info-label { font-size: 13px; font-weight: 600; color: var(--text-primary); flex-shrink: 0; }

/* Shared info text */
.ud3-info { font-size: 13px; color: var(--text-primary); line-height: 1.4; word-break: break-all; }

/* Role chips */
.ud-role-chips { display: flex; gap: 4px; flex-wrap: wrap; }

/* Tags below 3-column grid */
.ud3-tags-wrap { padding: 16px 20px; border-top: 1px solid var(--card-border); }

/* Footer */
.user-modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 24px; border-top: 1px solid var(--card-border);
  flex-shrink: 0; background: var(--card-bg);
}

/* Tags section */
.ud-section-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
.tags-panel { display: flex; flex-direction: column; gap: 10px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tag-badge-wrap { position: relative; display: inline-flex; align-items: center; }
.tag-badge-img { height: 22px; width: auto; display: block; }
.tag-badge-fallback { display: inline-flex; align-items: center; height: 22px; padding: 0 10px; border-radius: 999px; color: #fff; font-size: 12px; font-weight: 600; }
.tag-remove-floating { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border-radius: 50%; background: #fff; color: #333; border: 1px solid var(--card-border); font-size: 11px; line-height: 1; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.tag-remove-floating:hover { background: #fee; color: #c00; }
.tag-assign-row { display: flex; gap: 8px; align-items: center; }
.tag-assign-row .form-input { flex: 1; }
.tag-note { font-size: 12px; color: var(--text-muted); margin: 0; }

/* ── Room Details tab ─────────────────────────────────────────────── */
.rd-pane { padding: 0; }
.rd2-grid { display: grid; grid-template-columns: 140px 1fr; }
.rd2-left { padding: 20px 16px; border-right: 1px solid var(--card-border); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.rd2-avatar { width: 120px; height: 120px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: 700; overflow: hidden; flex-shrink: 0; }
.rd2-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.rd2-right { padding: 20px 18px; display: flex; flex-direction: column; gap: 7px; }

/* ── Same Device Account tab ─────────────────────────────────────── */
.sd-pane { padding: 0; }
.sd-banner { background: #FFF5F5; border: 1px solid #FFCDD2; padding: 10px 16px; font-size: 13px; color: #9e2a2b; margin: 16px; border-radius: 4px; }
.sd-banner strong { color: #c1121f; }
.sd-section-title { margin: 0 16px 10px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.sd-table { width: calc(100% - 32px); margin: 0 16px 16px; border-collapse: collapse; font-size: 13px; }
.sd-table th { padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--card-border); }
.sd-table td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: var(--text-primary); }
.sd-row { cursor: pointer; }
.sd-row:hover td { background: #FFF5F5; }
.sd-row-static { cursor: default; }
.sd-row-static:hover td { background: transparent; }
.sd-row-self td { background: #f0f7ff; }
.sd-row-self:hover td { background: #e6f1ff; }
.sd-self-pill { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #1d4ed8; background: #dbeafe; border: 1px solid #bfdbfe; }
.sd-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; }
.sd-role-chips { display: flex; gap: 4px; flex-wrap: wrap; }

/* ── Moderation Details tab ──────────────────────────────────────── */
.md-pane { padding: 20px; }
.md-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.md-table th { padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--card-border); }
.md-table td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: var(--text-primary); }
.md-row:hover td { background: #f8fafc; }
.md-actions { display: flex; gap: 6px; align-items: center; }
.md-btn { padding: 3px 10px; border: none; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; }
.md-btn-bind { background: #22C97A; color: #fff; }
.md-btn-bind:hover { background: #18a864; }
.md-btn-transfer { background: #FF5500; color: #fff; }
.md-btn-transfer:hover { background: #e04600; }
.editable-pencil-inline { border: none; background: transparent; cursor: pointer; margin-left: 4px; }
.ud3-otp-row { margin-top: 8px; }
.ud3-btn-otp { font-size: 12px; }
.form-error { color: #ef4444; font-size: 12px; margin-top: 8px; }
.btn-sm { padding: 4px 10px; font-size: 12px; height: auto; }

/* ── Recharge Record tab ─────────────────────────────────────────── */
.rc-pane { padding: 0; }
.rc-banner {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; margin: 16px;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; overflow: hidden;
}
.rc-banner-label { padding: 10px 16px; font-size: 13px; font-weight: 700; color: #166534; background: #dcfce7; white-space: nowrap; }
.rc-banner-value { padding: 10px 16px; font-size: 15px; font-weight: 700; color: #166534; text-align: center; }
.rc-banner-count { padding: 10px 16px; font-size: 13px; color: #16a34a; background: #dcfce7; white-space: nowrap; }

.rc-table { width: calc(100% - 32px); margin: 0 16px 16px; border-collapse: collapse; font-size: 13px; }
.rc-table th { padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--card-border); }
.rc-table th:last-child { text-align: right; }
.rc-table td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: var(--text-primary); }
.rc-row:hover td { background: #f8fafc; }
.rc-time { display: flex; gap: 12px; align-items: center; }
.rc-date { color: var(--text-primary); }
.rc-hour { color: var(--text-muted); }
.rc-order { color: var(--text-primary); text-align: center; }
.rc-amount-val { text-align: right; font-weight: 500; }
.rc-empty { text-align: center; color: var(--text-muted); padding: 24px; }

/* Mobile: stack columns */
@media (max-width: 640px) {
  .ud-grid { grid-template-columns: 1fr; }
  .ud-left { border-right: none; border-bottom: 1px solid var(--card-border); }
  .ud-avatar { max-width: 100px; }
}
</style>
