<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as usersApi from '@/api/users'
import * as modApi from '@/api/moderation'
import * as riskApi from '@/api/riskControl'
import * as tagsApi from '@/api/tags'
import * as commissionApi from '@/api/commissionConfig'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { resolveTagIconUrl } from '@/lib/tagIconUrl'

const toast = useToastStore()
const auth  = useAuthStore()

const route = useRoute()
const router = useRouter()
const user = ref<any>(null)
const loading = ref(true)
const activeTab = ref('details')

// Dialog state — used for plain unban confirmation
const dialog = ref({ show: false, title: '', message: '', action: '' as string, confirmColor: '' })

// ── Ban modal ────────────────────────────────────────────────────────────────
const showBanModal = ref(false)
const banSaving = ref(false)
const banForm = ref({
  reason: 'Banned by admin',
  banType: 'permanent' as 'permanent' | 'temporary',
  duration: '24h' as '1h' | '24h' | '7d' | '30d' | 'custom',
  expiresAt: '',
})

function openBanModal() {
  banForm.value = { reason: 'Banned by admin', banType: 'permanent', duration: '24h', expiresAt: '' }
  showBanModal.value = true
}

function presetExpiry(): string | undefined {
  if (banForm.value.banType === 'permanent') return undefined
  if (banForm.value.duration === 'custom') {
    if (!banForm.value.expiresAt) return undefined
    return new Date(banForm.value.expiresAt).toISOString()
  }
  const now = Date.now()
  const ms =
    banForm.value.duration === '1h'  ? 60 * 60 * 1000 :
    banForm.value.duration === '24h' ? 24 * 60 * 60 * 1000 :
    banForm.value.duration === '7d'  ? 7 * 24 * 60 * 60 * 1000 :
    banForm.value.duration === '30d' ? 30 * 24 * 60 * 60 * 1000 : 0
  return new Date(now + ms).toISOString()
}

async function submitBan() {
  banSaving.value = true
  try {
    const expiresAt = banForm.value.banType === 'temporary' ? presetExpiry() : undefined
    if (banForm.value.banType === 'temporary' && !expiresAt) {
      toast.error('Invalid Duration', 'Pick a duration or custom expiry for a temporary ban.')
      banSaving.value = false
      return
    }
    await usersApi.banUser(user.value.id, {
      reason: banForm.value.reason.trim() || 'Banned by admin',
      banType: banForm.value.banType,
      expiresAt,
    })
    toast.success('User Banned', `${user.value.displayName} can no longer access the platform.`)
    showBanModal.value = false
    await fetchUser()
  } catch (e: any) {
    toast.error('Ban Failed', e?.message)
  }
  banSaving.value = false
}

// ── Host ban modal ──────────────────────────────────────────────────────────
const showHostBanModal = ref(false)
const hostBanSaving = ref(false)
const hostBanForm = ref({
  reason: 'Host banned by admin',
  banType: 'permanent' as 'permanent' | 'temporary',
  duration: '24h' as '1h' | '24h' | '7d' | '30d' | 'custom',
  expiresAt: '',
})

function openHostBanModal() {
  hostBanForm.value = { reason: 'Host banned by admin', banType: 'permanent', duration: '24h', expiresAt: '' }
  showHostBanModal.value = true
}

function presetHostExpiry(): string | undefined {
  if (hostBanForm.value.banType === 'permanent') return undefined
  if (hostBanForm.value.duration === 'custom') {
    if (!hostBanForm.value.expiresAt) return undefined
    return new Date(hostBanForm.value.expiresAt).toISOString()
  }
  const ms =
    hostBanForm.value.duration === '1h'  ? 60 * 60 * 1000 :
    hostBanForm.value.duration === '24h' ? 24 * 60 * 60 * 1000 :
    hostBanForm.value.duration === '7d'  ? 7 * 24 * 60 * 60 * 1000 :
    hostBanForm.value.duration === '30d' ? 30 * 24 * 60 * 60 * 1000 : 0
  return new Date(Date.now() + ms).toISOString()
}

async function submitHostBan() {
  hostBanSaving.value = true
  try {
    const expiresAt = hostBanForm.value.banType === 'temporary' ? presetHostExpiry() : undefined
    if (hostBanForm.value.banType === 'temporary' && !expiresAt) {
      toast.error('Invalid Duration', 'Pick a duration or custom expiry for a temporary host ban.')
      hostBanSaving.value = false
      return
    }
    const result: any = await usersApi.hostBanUser(user.value.id, {
      reason: hostBanForm.value.reason.trim() || 'Host banned by admin',
      banType: hostBanForm.value.banType,
      expiresAt,
    })
    toast.success(
      'Host Banned',
      result?.roomsTouched
        ? `${user.value.displayName} can no longer host. Removed from mic in ${result.roomsTouched} active room(s); rooms stay open for others.`
        : `${user.value.displayName} can no longer host rooms.`,
    )
    showHostBanModal.value = false
    await fetchUser()
  } catch (e: any) {
    toast.error('Host Ban Failed', e?.message)
  }
  hostBanSaving.value = false
}

async function handleHostUnban() {
  try {
    await usersApi.hostUnbanUser(user.value.id)
    toast.success('Host Unbanned', `${user.value.displayName} can host rooms again.`)
    await fetchUser()
  } catch (e: any) {
    toast.error('Action Failed', e?.message)
  }
}

/** BigInt from API may serialize as string */
function formatBigNum(v: unknown): string {
  if (v === undefined || v === null) return '—'
  try {
    const n = typeof v === 'bigint' ? v : BigInt(String(v))
    return n.toLocaleString()
  } catch {
    return String(v)
  }
}

const agentCommissionPct = ref('')
const agentGiftBonusPct = ref('')
const agentCommissionValidUntil = ref('')
const agentGiftBonusValidUntil = ref('')
const agentOverrideSaving = ref<'commission' | 'gift_bonus' | null>(null)

function pctInputFromRate(v: unknown): string {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  const p = Math.round(n * 1e6) / 1e4
  if (Number.isInteger(p)) return String(p)
  return String(p)
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIsoUtc(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function syncAgentOwnedCommissionForm() {
  const oa = user.value?.ownedAgency
  if (!oa || user.value?.role !== 'agent') {
    agentCommissionPct.value = ''
    agentGiftBonusPct.value = ''
    agentCommissionValidUntil.value = ''
    agentGiftBonusValidUntil.value = ''
    return
  }
  agentCommissionPct.value = pctInputFromRate(oa.commissionRateOverride)
  agentGiftBonusPct.value = pctInputFromRate(oa.giftBonusRateOverride)
  agentCommissionValidUntil.value = isoToDatetimeLocal(oa.commissionRateOverrideValidUntil)
  agentGiftBonusValidUntil.value = isoToDatetimeLocal(oa.giftBonusRateOverrideValidUntil)
}

function agentOverridePromoHint(rate: unknown, validUntilIso: string | null | undefined): string {
  if (rate == null || rate === '') return ''
  if (!validUntilIso) return 'No end date — override applies until cleared.'
  const until = new Date(validUntilIso).getTime()
  if (Number.isNaN(until)) return ''
  if (Date.now() > until) return 'End date passed — new gifts use tier tables.'
  return `Active through ${new Date(validUntilIso).toLocaleString()}.`
}

function parsePctInputToRate(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  if (Number.isNaN(n) || n < 0 || n > 100) return null
  return n / 100
}

function fmtRatePctUser(n: unknown): string {
  const x = Number(n)
  if (Number.isNaN(x)) return '—'
  return `${(x * 100).toFixed(2)}%`
}

async function saveAgentCommissionOverride() {
  const oa = user.value?.ownedAgency
  if (!oa) return
  const rate = parsePctInputToRate(agentCommissionPct.value)
  if (rate === null) {
    toast.error('Invalid percentage', 'Enter 0–100 or use Clear.')
    return
  }
  agentOverrideSaving.value = 'commission'
  try {
    await commissionApi.setAgencyCommissionOverride(oa.id, rate, datetimeLocalToIsoUtc(agentCommissionValidUntil.value))
    toast.success('Commission override saved')
    await fetchUser()
  } catch (e: any) {
    toast.error('Save failed', e?.message)
  } finally {
    agentOverrideSaving.value = null
  }
}

async function clearAgentCommissionOverride() {
  const oa = user.value?.ownedAgency
  if (!oa) return
  agentOverrideSaving.value = 'commission'
  try {
    await commissionApi.setAgencyCommissionOverride(oa.id, null)
    toast.success('Commission override cleared')
    await fetchUser()
  } catch (e: any) {
    toast.error('Clear failed', e?.message)
  } finally {
    agentOverrideSaving.value = null
  }
}

async function saveAgentGiftBonusOverride() {
  const oa = user.value?.ownedAgency
  if (!oa) return
  const rate = parsePctInputToRate(agentGiftBonusPct.value)
  if (rate === null) {
    toast.error('Invalid percentage', 'Enter 0–100 or use Clear.')
    return
  }
  agentOverrideSaving.value = 'gift_bonus'
  try {
    await commissionApi.setAgencyGiftBonusOverride(oa.id, rate, datetimeLocalToIsoUtc(agentGiftBonusValidUntil.value))
    toast.success('Gift bonus override saved')
    await fetchUser()
  } catch (e: any) {
    toast.error('Save failed', e?.message)
  } finally {
    agentOverrideSaving.value = null
  }
}

async function clearAgentGiftBonusOverride() {
  const oa = user.value?.ownedAgency
  if (!oa) return
  agentOverrideSaving.value = 'gift_bonus'
  try {
    await commissionApi.setAgencyGiftBonusOverride(oa.id, null)
    toast.success('Gift bonus override cleared')
    await fetchUser()
  } catch (e: any) {
    toast.error('Clear failed', e?.message)
  } finally {
    agentOverrideSaving.value = null
  }
}

async function fetchUser() {
  loading.value = true
  try {
    user.value = await usersApi.getUserDetail(route.params.id as string)
    syncAgentOwnedCommissionForm()
  } catch { router.push('/users') }
  loading.value = false
}

function showBanDialog() {
  if (user.value.isActive) {
    // Banning — open the structured modal that captures reason + duration.
    openBanModal()
    return
  }
  dialog.value = {
    show: true,
    title: 'Unban User',
    message: `Unban ${user.value.displayName}? They will regain access.`,
    action: 'unban',
    confirmColor: 'var(--success)',
  }
}

async function handleConfirm() {
  dialog.value.show = false
  try {
    if (dialog.value.action === 'unban') {
      await usersApi.unbanUser(user.value.id)
    }
    await fetchUser()
  } catch { /* handled by interceptor */ }
}

const kycLoading = ref(false)

async function toggleVerify() {
  kycLoading.value = true
  try {
    if (user.value.isVerified) {
      await modApi.unverifyUser(user.value.id)
      toast.info('Verification Removed')
    } else {
      await modApi.verifyUser(user.value.id)
      toast.success('User Verified')
    }
    await fetchUser()
  } catch (e: any) {
    toast.error('Action Failed', e?.message)
  }
  kycLoading.value = false
}

// ── Risk Control ────────────────────────────────────────────────────────────

const activeRisk   = ref<any>(null)
const riskHistory  = ref<any[]>([])
const riskLoading  = ref(false)
const riskModal    = ref(false)
const releaseConfirm = ref(false)
const releaseLoading = ref(false)

const riskForm = ref({
  freezeCoins:  false,
  freezeBeans:  false,
  disableGames: false,
  disableGifts: false,
  blockChat:    false,
  reason:       'fraud_activity',
  severity:     'medium',
  duration:     'permanent',
  notes:        '',
})

const REASON_LABELS: Record<string, string> = {
  fraud_activity:           'Fraud Activity',
  suspicious_transactions:  'Suspicious Transactions',
  multiple_accounts:        'Multiple Accounts',
  chargeback:               'Chargeback',
  manual_review:            'Manual Review',
}

const SEV_CLASS: Record<string, string> = {
  critical: 'sev-critical',
  high:     'sev-high',
  medium:   'sev-medium',
  low:      'sev-low',
}

async function fetchRisk() {
  riskLoading.value = true
  try {
    const res = await riskApi.getUserRisk(route.params.id as string)
    activeRisk.value  = res.active
    riskHistory.value = res.history
  } catch {}
  riskLoading.value = false
}

function openRiskModal(edit = false) {
  if (edit && activeRisk.value) {
    riskForm.value = {
      freezeCoins:  activeRisk.value.freezeCoins,
      freezeBeans:  activeRisk.value.freezeBeans,
      disableGames: activeRisk.value.disableGames,
      disableGifts: activeRisk.value.disableGifts,
      blockChat:    activeRisk.value.blockChat,
      reason:       activeRisk.value.reason,
      severity:     activeRisk.value.severity,
      duration:     activeRisk.value.expiresAt ? 'permanent' : 'permanent',
      notes:        activeRisk.value.notes,
    }
  } else {
    riskForm.value = { freezeCoins: true, freezeBeans: true, disableGames: true, disableGifts: true, blockChat: false, reason: 'fraud_activity', severity: 'medium', duration: 'permanent', notes: '' }
  }
  riskModal.value = true
}

async function submitRisk() {
  riskLoading.value = true
  try {
    if (activeRisk.value) {
      await riskApi.updateRisk(user.value.id, riskForm.value)
      toast.success('Risk Control Updated')
    } else {
      await riskApi.applyRisk(user.value.id, riskForm.value)
      toast.warning('Risk Control Applied', `${user.value.displayName}'s account has been frozen.`)
    }
    riskModal.value = false
    await fetchRisk()
  } catch (e: any) { toast.error('Action Failed', e?.message) }
  riskLoading.value = false
}

async function confirmRelease() {
  releaseLoading.value = true
  try {
    await riskApi.releaseRisk(user.value.id)
    toast.success('Account Released', `${user.value.displayName} can now transact normally.`)
    releaseConfirm.value = false
    await fetchRisk()
  } catch (e: any) { toast.error('Release Failed', e?.message) }
  releaseLoading.value = false
}

function fmtExpiry(d: string | null) {
  if (!d) return 'Permanent'
  const dt = new Date(d)
  return dt < new Date() ? 'Expired' : dt.toLocaleString()
}

// ── Same Device ─────────────────────────────────────────────────────────────

const deviceData      = ref<{ devices: any[]; linkedAccounts: any[] }>({ devices: [], linkedAccounts: [] })
const deviceLoading   = ref(false)

async function fetchDevices() {
  deviceLoading.value = true
  try {
    deviceData.value = await usersApi.getSameDeviceUsers(route.params.id as string)
  } catch {}
  deviceLoading.value = false
}

function platformIcon(platform: string) {
  if (platform === 'ios')     return '🍎'
  if (platform === 'android') return '🤖'
  return '📱'
}


// ── Tags ────────────────────────────────────────────────────────────────────

const allTags       = ref<tagsApi.AdminTag[]>([])
const userTags      = ref<tagsApi.UserTagRow[]>([])
const tagsLoading   = ref(false)
const selectedTagId = ref('')

async function fetchTags() {
  tagsLoading.value = true
  try {
    const [all, mine] = await Promise.all([
      tagsApi.listTags(),
      tagsApi.listUserTags(route.params.id as string),
    ])
    allTags.value  = all
    userTags.value = mine
  } catch (e) {
    console.error('[tags] fetch failed', e)
  }
  tagsLoading.value = false
}

async function assignSelectedTag() {
  if (!selectedTagId.value) return
  try {
    await tagsApi.assignTag(user.value.id, selectedTagId.value)
    toast.success('Tag Assigned', 'The user has been logged out to apply the new permissions.')
    selectedTagId.value = ''
    await fetchTags()
  } catch (e: any) { toast.error('Assign Failed', e?.message) }
}

async function revokeUserTag(tagId: string, name: string) {
  try {
    await tagsApi.revokeTag(user.value.id, tagId)
    toast.info('Tag Removed', `${name} has been removed.`)
    await fetchTags()
  } catch (e: any) { toast.error('Remove Failed', e?.message) }
}

// ── Force Level ─────────────────────────────────────────────────────────────

const showLevelModal = ref(false)
const levelForm = ref({ richLevel: 1, richXp: 0, charmLevel: 1, charmXp: 0 })
const levelSaving = ref(false)
const levelError = ref('')

async function handleSetLevel() {
  levelSaving.value = true
  levelError.value = ''
  try {
    await usersApi.forceSetLevel(user.value.id, levelForm.value)
    showLevelModal.value = false
    fetchUser()
  } catch (e: any) {
    levelError.value = e?.message || 'Failed to update level'
  } finally {
    levelSaving.value = false
  }
}

// ── Special HAKA ID tier (SSS–B badge for active 6-digit ID) ─────────────────

const showHakaIdTierModal = ref(false)
const hakaIdTierForm = ref<'SSS' | 'SS' | 'S' | 'A' | 'B'>('B')
const hakaIdTierSaving = ref(false)
const hakaIdTierError = ref('')

const HAKA_ID_TIERS: { value: 'SSS' | 'SS' | 'S' | 'A' | 'B'; label: string }[] = [
  { value: 'SSS', label: 'SSS (highest)' },
  { value: 'SS', label: 'SS' },
  { value: 'S', label: 'S' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
]

function openHakaIdTierModal() {
  const cur = user.value?.activeSpecialIdLevel
  hakaIdTierForm.value =
    cur === 'SSS' || cur === 'SS' || cur === 'S' || cur === 'A' || cur === 'B' ? cur : 'B'
  hakaIdTierError.value = ''
  showHakaIdTierModal.value = true
}

async function handleSetHakaIdTier() {
  hakaIdTierSaving.value = true
  hakaIdTierError.value = ''
  try {
    await usersApi.setSpecialHakaIdLevel(user.value.id, hakaIdTierForm.value)
    showHakaIdTierModal.value = false
    toast.success('HAKA ID tier updated')
    await fetchUser()
  } catch (e: any) {
    hakaIdTierError.value = e?.message || 'Failed to update tier'
  } finally {
    hakaIdTierSaving.value = false
  }
}

async function toggleVerifiedHost() {
  try {
    await usersApi.setHostStatus(user.value.id, { isVerifiedHost: !(user.value.isVerifiedHost ?? false) })
    await fetchUser()
    toast.success('Updated', 'Verified host status changed.')
  } catch (e: any) { toast.error('Action Failed', e?.message) }
}

async function togglePremiumHost() {
  try {
    await usersApi.setHostStatus(user.value.id, { isPremiumHost: !(user.value.isPremiumHost ?? false) })
    await fetchUser()
    toast.success('Updated', 'Premium host status changed.')
  } catch (e: any) { toast.error('Action Failed', e?.message) }
}

// ── Reset Password ───────────────────────────────────────────────────────────

const showResetPassword = ref(false)
const newPassword = ref('')
const resetSaving = ref(false)
const resetError = ref('')

async function handleResetPassword() {
  resetSaving.value = true
  resetError.value = ''
  try {
    await usersApi.resetUserPassword(user.value.id, newPassword.value)
    showResetPassword.value = false
    newPassword.value = ''
    await fetchUser()
    toast.success('Password Reset', 'Password updated. Display refreshed.')
  } catch (e: any) {
    resetError.value = e?.message || 'Failed to reset password'
  } finally {
    resetSaving.value = false
  }
}

function copyPassword() {
  const text = user.value?.loginPasswordPlaintext || user.value?.loginPasswordDisplay
  if (!text || !user.value?.loginPasswordCopyable) return
  navigator.clipboard.writeText(text).then(() => {
    toast.success('Copied', 'Password copied to clipboard')
  }).catch(() => toast.error('Copy failed'))
}

const otpSending = ref(false)
async function handleSendLoginOtp() {
  if (!user.value?.phone || otpSending.value) return
  if (!confirm(`Send login OTP to ${user.value.phone}?`)) return
  otpSending.value = true
  try {
    const res = await usersApi.sendLoginOtp(user.value.id)
    toast.success('OTP Sent', res?.message || `OTP sent to ${res?.phoneMasked || 'user phone'}`)
  } catch (e: any) {
    toast.error('OTP failed', e?.message || 'Could not send OTP')
  } finally {
    otpSending.value = false
  }
}

const faceResetLoading = ref(false)
async function handleResetFaceVerification() {
  if (faceResetLoading.value) return
  if (!confirm('Reset face verification? User must complete liveness again.')) return
  faceResetLoading.value = true
  try {
    await usersApi.resetFaceVerification(user.value.id)
    await fetchUser()
    toast.success('Face Reset', 'Face verification cleared.')
  } catch (e: any) {
    toast.error('Reset failed', e?.message || 'Could not reset face verification')
  } finally {
    faceResetLoading.value = false
  }
}

const superAdminPowerSaving = ref(false)
async function toggleSuperAdminPower() {
  if (!auth.isSuperAdmin || superAdminPowerSaving.value || !user.value) return
  const next = !user.value.superAdminPower
  if (!confirm(next ? 'Grant Super Admin Power to this user?' : 'Remove Super Admin Power?')) return
  superAdminPowerSaving.value = true
  try {
    await usersApi.setSuperAdminPower(user.value.id, next)
    user.value.superAdminPower = next
    toast.success('Updated', next ? 'Super Admin Power enabled' : 'Super Admin Power disabled')
  } catch (e: any) {
    toast.error('Update failed', e?.message)
  } finally {
    superAdminPowerSaving.value = false
  }
}

onMounted(async () => {
  await fetchUser()
  await Promise.all([fetchRisk(), fetchDevices(), fetchTags()])
})
</script>

<template>
  <div v-if="loading" class="loading">Loading user...</div>

  <div v-else-if="user" class="user-detail">
    <!-- Header -->
    <div class="detail-header">
      <button class="back-btn" @click="router.push('/users')">&larr; Back to Users</button>
      <div class="header-actions">
        <button
          class="btn-action"
          :class="user.isVerified ? 'btn-secondary' : 'btn-primary'"
          :disabled="kycLoading"
          @click="toggleVerify"
        >
          {{ user.isVerified ? '✅ Verified (Remove KYC)' : '🔵 Verify User (KYC)' }}
        </button>
        <template v-if="user?.role === 'host'">
          <button
            class="btn-action"
            :class="user.isVerifiedHost ? 'btn-success' : 'btn-secondary'"
            @click="toggleVerifiedHost"
          >
            {{ user.isVerifiedHost ? '✅ Verified Host' : 'Mark Verified' }}
          </button>
          <button
            class="btn-action"
            :class="user.isPremiumHost ? 'btn-success' : 'btn-secondary'"
            @click="togglePremiumHost"
          >
            {{ user.isPremiumHost ? '🔥 Premium Host' : 'Mark Premium' }}
          </button>
          <router-link
            class="btn-action btn-secondary"
            style="text-decoration: none"
            :to="{ path: '/level-tasks', query: { userId: user.id } }"
          >
            Level tasks
          </router-link>
          <button
            class="btn-action"
            :class="user.isHostBanned ? 'btn-success' : 'btn-danger'"
            @click="user.isHostBanned ? handleHostUnban() : openHostBanModal()"
          >
            {{ user.isHostBanned ? 'Unban Host' : 'Ban Host' }}
          </button>
        </template>
        <button class="btn-action btn-secondary" @click="showLevelModal = true">
          Force Level
        </button>
        <button
          class="btn-action btn-secondary"
          :disabled="!user.activeSpecialId"
          :title="user.activeSpecialId ? 'Change SSS–B tier for the displayed special ID' : 'User needs an active special HAKA ID first'"
          @click="openHakaIdTierModal"
        >
          HAKA ID tier
        </button>
        <button class="btn-action btn-danger" @click="showResetPassword = true">
          Reset Password
        </button>
        <button
          v-if="user.phone && auth.hasPermission('user.send_otp')"
          class="btn-action btn-secondary"
          :disabled="otpSending"
          @click="handleSendLoginOtp"
        >
          {{ otpSending ? 'Sending OTP…' : 'Send Login OTP' }}
        </button>
        <button
          v-if="auth.hasPermission('user.edit')"
          class="btn-action btn-secondary"
          :disabled="faceResetLoading"
          @click="handleResetFaceVerification"
        >
          {{ faceResetLoading ? 'Resetting…' : 'Reset Face Auth' }}
        </button>
        <button class="btn-action" :class="user.isActive ? 'btn-danger' : 'btn-success'" @click="showBanDialog">
          {{ user.isActive ? 'Ban User' : 'Unban User' }}
        </button>
      </div>
    </div>

    <!-- Profile card -->
    <div class="profile-card">
      <div class="profile-avatar">
        <div class="avatar-lg">{{ user.displayName?.charAt(0) || '?' }}</div>
      </div>
      <div class="profile-grid">
        <div class="field">
          <span class="field-label">Display Name</span>
          <span class="field-value">{{ user.displayName || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Username</span>
          <span class="field-value">{{ user.username || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Haka ID</span>
          <span class="field-value haka-id">{{ user.hakaId || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Special HAKA ID</span>
          <span class="field-value haka-id">{{ user.activeSpecialId || '—' }}</span>
        </div>
        <div v-if="user.activeSpecialId" class="field">
          <span class="field-label">Special ID tier</span>
          <span class="field-value">{{ user.activeSpecialIdLevel || '—' }}</span>
        </div>
        <div v-if="user.activeSpecialId && user.activeSpecialIdExpiresAt" class="field">
          <span class="field-label">Special ID expires</span>
          <span class="field-value">{{ new Date(user.activeSpecialIdExpiresAt).toLocaleString() }}</span>
        </div>
        <div class="field">
          <span class="field-label">Phone</span>
          <span class="field-value">{{ user.phone || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Email</span>
          <span class="field-value">{{ user.email || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Password</span>
          <span class="field-value password-row">
            {{ user.loginPasswordDisplay || (user.hasPassword ? '••••••' : 'Not set') }}
            <button
              v-if="user.loginPasswordCopyable"
              type="button"
              class="copy-link"
              @click="copyPassword"
            >Copy</button>
          </span>
        </div>
        <div class="field">
          <span class="field-label">Face verification</span>
          <span class="field-value">{{ user.faceVerificationStatus || 'none' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Country</span>
          <span class="field-value">{{ user.country || '—' }}</span>
        </div>
        <div class="field">
          <span class="field-label">Gender</span>
          <span class="field-value">{{
            user.gender === 'male' ? 'Boy' : user.gender === 'female' ? 'Girl' : '—'
          }}</span>
        </div>
        <div class="field">
          <span class="field-label">Role</span>
          <StatusBadge :value="user.role" />
        </div>
        <div class="field">
          <span class="field-label">Status</span>
          <StatusBadge :value="user.isActive ? 'active' : 'banned'" />
        </div>
        <div class="field">
          <span class="field-label">Onboarded</span>
          <StatusBadge :value="user.onboardingComplete ? 'completed' : 'pending'" />
        </div>
        <div class="field">
          <span class="field-label">KYC Verified</span>
          <StatusBadge :value="user.isVerified ? 'verified' : 'unverified'" />
        </div>
        <div class="field">
          <span class="field-label">Host Type</span>
          <span class="field-value">{{ user.hostType || '—' }}</span>
        </div>
        <div v-if="user.role === 'host'" class="field">
          <span class="field-label">Verified Host</span>
          <StatusBadge :value="user.isVerifiedHost ? 'verified' : 'unverified'" />
        </div>
        <div v-if="user.role === 'host'" class="field">
          <span class="field-label">Premium Host</span>
          <StatusBadge :value="user.isPremiumHost ? 'active' : 'inactive'" />
        </div>
        <div class="field">
          <span class="field-label">Agent</span>
          <span class="field-value">{{ user.agent?.displayName || '—' }}</span>
        </div>
        <div v-if="user.agent?.ownedAgency" class="field">
          <span class="field-label">Agency</span>
          <span class="field-value">{{ user.agent.ownedAgency.name }} ({{ user.agent.ownedAgency.status }})</span>
        </div>
        <div v-if="user.role === 'host'" class="field">
          <span class="field-label">Lifetime beans earned</span>
          <span class="field-value">{{ formatBigNum(user.cumulativeBeansEarned) }}</span>
        </div>
        <div class="field">
          <span class="field-label">Registered</span>
          <span class="field-value">{{ new Date(user.createdAt).toLocaleString() }}</span>
        </div>

        <div
          v-if="user.role === 'agent' && user.ownedAgency && auth.hasPermission('gift.manage')"
          class="agent-commission-panel"
        >
          <div class="agent-commission-title">Owned agency — commission overrides</div>
          <p class="agent-commission-intro">
            <strong>{{ user.ownedAgency.name }}</strong>
            <span v-if="user.ownedAgency.parentAgency"> · Parent: {{ user.ownedAgency.parentAgency.name }}</span>
          </p>
          <div class="agent-commission-row">
            <div class="agent-commission-block">
              <div class="agent-commission-head">
                <span>Agency commission %</span>
                <span class="agent-commission-meta">Effective: {{ fmtRatePctUser(user.ownedAgency.effectiveCommissionRate) }}</span>
              </div>
              <div class="agent-commission-controls">
                <input v-model="agentCommissionPct" class="agent-commission-input" type="text" inputmode="decimal" placeholder="e.g. 8" />
                <button
                  class="btn-sm btn-primary"
                  :disabled="agentOverrideSaving === 'commission'"
                  @click="saveAgentCommissionOverride"
                >{{ agentOverrideSaving === 'commission' ? '…' : 'Save' }}</button>
                <button
                  class="btn-sm"
                  :disabled="agentOverrideSaving === 'commission'"
                  @click="clearAgentCommissionOverride"
                >Clear</button>
              </div>
              <label class="agent-dt-label">Valid until (local, optional)</label>
              <input v-model="agentCommissionValidUntil" class="agent-commission-dt" type="datetime-local" />
              <p class="agent-commission-hint">
                {{ agentOverridePromoHint(user.ownedAgency.commissionRateOverride, user.ownedAgency.commissionRateOverrideValidUntil) }}
              </p>
            </div>
            <div class="agent-commission-block">
              <div class="agent-commission-head">
                <span>Gift bonus %</span>
                <span class="agent-commission-meta">Effective: {{ fmtRatePctUser(user.ownedAgency.effectiveGiftBonusRate) }}</span>
              </div>
              <div class="agent-commission-controls">
                <input v-model="agentGiftBonusPct" class="agent-commission-input" type="text" inputmode="decimal" placeholder="e.g. 3" />
                <button
                  class="btn-sm btn-primary"
                  :disabled="agentOverrideSaving === 'gift_bonus'"
                  @click="saveAgentGiftBonusOverride"
                >{{ agentOverrideSaving === 'gift_bonus' ? '…' : 'Save' }}</button>
                <button
                  class="btn-sm"
                  :disabled="agentOverrideSaving === 'gift_bonus'"
                  @click="clearAgentGiftBonusOverride"
                >Clear</button>
              </div>
              <label class="agent-dt-label">Valid until (local, optional)</label>
              <input v-model="agentGiftBonusValidUntil" class="agent-commission-dt" type="datetime-local" />
              <p class="agent-commission-hint">
                {{ agentOverridePromoHint(user.ownedAgency.giftBonusRateOverride, user.ownedAgency.giftBonusRateOverrideValidUntil) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" :class="{ active: activeTab === 'details' }" @click="activeTab = 'details'">Wallet</button>
      <button class="tab" :class="{ active: activeTab === 'rooms' }"   @click="activeTab = 'rooms'">Rooms</button>
      <button class="tab" :class="{ active: activeTab === 'gifts' }"   @click="activeTab = 'gifts'">Gifts</button>
      <button class="tab" :class="{ active: activeTab === 'stats' }"   @click="activeTab = 'stats'">Stats</button>
      <button
        v-if="auth.hasPermission('risk.view')"
        class="tab"
        :class="{ active: activeTab === 'risk' }"
        @click="activeTab = 'risk'"
      >
        <span v-if="activeRisk" class="risk-dot">⚠️</span> Risk Control
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'devices' }"
        @click="activeTab = 'devices'"
      >
        <span v-if="deviceData.linkedAccounts.length" class="device-dot">📱</span>
        Same Device
        <span v-if="deviceData.linkedAccounts.length" class="tab-count">{{ deviceData.linkedAccounts.length }}</span>
      </button>
      <button class="tab" :class="{ active: activeTab === 'tags' }" @click="activeTab = 'tags'">
        Tags
        <span v-if="userTags.length" class="tab-count">{{ userTags.length }}</span>
      </button>
      <button
        v-if="auth.isSuperAdmin"
        class="tab"
        :class="{ active: activeTab === 'power' }"
        @click="activeTab = 'power'"
      >
        Super Admin Power
      </button>
    </div>

    <!-- Super Admin Power tab (not a tag) -->
    <div v-if="activeTab === 'power' && auth.isSuperAdmin" class="tab-content">
      <div class="power-panel">
        <p class="power-note">
          <strong>Super Admin Power</strong> is separate from staff tags. Grants in-app moderation immunity,
          ability to kick anyone, and invisible room entry.
        </p>
        <button
          class="btn-action"
          :class="user.superAdminPower ? 'btn-danger' : 'btn-primary'"
          :disabled="superAdminPowerSaving"
          @click="toggleSuperAdminPower"
        >
          {{ superAdminPowerSaving ? 'Saving…' : (user.superAdminPower ? 'Disable Super Admin Power' : 'Enable Super Admin Power') }}
        </button>
        <p class="power-status">Current: <strong>{{ user.superAdminPower ? 'Enabled' : 'Disabled' }}</strong></p>
        <ul class="power-list">
          <li>Cannot be kicked, muted, banned, removed, or blocked in rooms</li>
          <li>Can kick hosts, moderators, and room admins</li>
          <li>Joins voice/live rooms invisibly (hidden from roster)</li>
        </ul>
      </div>
    </div>

    <!-- Tags tab -->
    <div v-if="activeTab === 'tags'" class="tab-content">
      <div class="tags-panel">
        <div v-if="userTags.length === 0" class="empty-state">No tags assigned.</div>
        <div v-else class="tag-list">
          <div v-for="ut in userTags" :key="ut.id" class="tag-badge-wrap">
            <div class="tag-badge-inner">
              <img
                v-if="ut.tag.iconUrl"
                :src="resolveTagIconUrl(ut.tag.iconUrl)"
                :alt="ut.tag.displayName"
                class="tag-badge-img"
              />
              <span v-else class="tag-badge-fallback" :style="{ background: ut.tag.color }">
                {{ ut.tag.displayName }}
              </span>
              <button class="tag-remove-floating" @click="revokeUserTag(ut.tagId, ut.tag.displayName)" title="Remove">×</button>
            </div>
            <div class="tag-badge-meta">
              by <strong>{{ ut.assigner?.displayName || 'Unknown' }}</strong>
              · {{ new Date(ut.createdAt).toLocaleDateString() }}
            </div>
          </div>
        </div>

        <div class="tag-assign-row">
          <select v-model="selectedTagId" class="tag-select">
            <option value="">Select a tag to assign…</option>
            <option
              v-for="t in allTags.filter(t => !userTags.find(u => u.tagId === t.id))"
              :key="t.id"
              :value="t.id"
            >
              {{ t.displayName }}
            </option>
          </select>
          <button class="btn-action btn-primary" :disabled="!selectedTagId || tagsLoading" @click="assignSelectedTag">
            Assign Tag
          </button>
        </div>
        <p class="tag-note">Assigning or removing a tag logs the user out so the new permissions take effect immediately.</p>
      </div>
    </div>

    <!-- Wallet tab -->
    <div v-if="activeTab === 'details'" class="tab-content">
      <div class="wallet-cards" v-if="user.wallet">
        <div class="wallet-card coin">
          <span class="wallet-icon">🪙</span>
          <span class="wallet-amount">{{ user.wallet.coinBalance.toLocaleString() }}</span>
          <span class="wallet-label">Coins</span>
        </div>
        <div class="wallet-card bean">
          <span class="wallet-icon">🫘</span>
          <span class="wallet-amount">{{ user.wallet.beanBalance.toLocaleString() }}</span>
          <span class="wallet-label">Beans</span>
        </div>
      </div>
      <div v-else class="empty-state">No wallet yet</div>
    </div>

    <!-- Rooms tab -->
    <div v-if="activeTab === 'rooms'" class="tab-content">
      <table v-if="user.hostedRooms?.length" class="data-table">
        <thead><tr><th>Title</th><th>Status</th><th>MIC Config</th><th>Created</th></tr></thead>
        <tbody>
          <tr v-for="room in user.hostedRooms" :key="room.id">
            <td class="cell-primary">{{ room.title }}</td>
            <td><StatusBadge :value="room.status" /></td>
            <td>{{ room.micConfig }}-mic</td>
            <td class="cell-secondary">{{ new Date(room.createdAt).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">No rooms yet</div>
    </div>

    <!-- Gifts tab -->
    <div v-if="activeTab === 'gifts'" class="tab-content">
      <h3 class="section-title">Gifts Sent</h3>
      <table v-if="user.giftsSent?.length" class="data-table">
        <thead><tr><th>Gift</th><th>To</th><th>Cost</th><th>Date</th></tr></thead>
        <tbody>
          <tr v-for="tx in user.giftsSent" :key="tx.id">
            <td>{{ tx.gift.name }}</td>
            <td>{{ tx.recipient.displayName }}</td>
            <td>{{ tx.coinCost }} coins</td>
            <td class="cell-secondary">{{ new Date(tx.createdAt).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">No gifts sent</div>

      <h3 class="section-title" style="margin-top: 24px">Gifts Received</h3>
      <table v-if="user.giftsReceived?.length" class="data-table">
        <thead><tr><th>Gift</th><th>From</th><th>Value</th><th>Date</th></tr></thead>
        <tbody>
          <tr v-for="tx in user.giftsReceived" :key="tx.id">
            <td>{{ tx.gift.name }}</td>
            <td>{{ tx.sender.displayName }}</td>
            <td>{{ tx.beanValue }} beans</td>
            <td class="cell-secondary">{{ new Date(tx.createdAt).toLocaleDateString() }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">No gifts received</div>
    </div>

    <!-- Stats tab -->
    <div v-if="activeTab === 'stats'" class="tab-content">
      <div class="stats-row" v-if="user._count">
        <div class="mini-stat"><span class="mini-val">{{ user._count.following }}</span><span class="mini-label">Following</span></div>
        <div class="mini-stat"><span class="mini-val">{{ user._count.followedBy }}</span><span class="mini-label">Followers</span></div>
        <div class="mini-stat"><span class="mini-val">{{ user._count.hostedRooms }}</span><span class="mini-label">Rooms Hosted</span></div>
        <div class="mini-stat"><span class="mini-val">{{ user._count.giftsSent }}</span><span class="mini-label">Gifts Sent</span></div>
        <div class="mini-stat"><span class="mini-val">{{ user._count.giftsReceived }}</span><span class="mini-label">Gifts Received</span></div>
      </div>
    </div>

    <!-- ── Same Device tab ────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'devices'" class="tab-content">
      <div v-if="deviceLoading" class="empty-state">Loading device data…</div>
      <template v-else>

        <!-- Devices registered to this user -->
        <div class="section-block">
          <h4 class="section-title">Registered Devices</h4>
          <div v-if="deviceData.devices.length === 0" class="empty-state">No device data yet — device info is recorded from the mobile app on each login.</div>
          <div v-else class="device-cards">
            <div v-for="d in deviceData.devices" :key="d.deviceId" class="device-card">
              <div class="device-card-icon">{{ platformIcon(d.platform) }}</div>
              <div class="device-card-info">
                <div class="device-name">{{ d.deviceModel || 'Unknown Device' }}</div>
                <div class="device-meta">
                  <span class="device-tag">{{ d.platform || 'Unknown' }}</span>
                  <span v-if="d.appVersion" class="device-tag">v{{ d.appVersion }}</span>
                  <span class="device-id-short">ID: {{ d.deviceId.slice(0, 12) }}…</span>
                </div>
                <div class="device-last">Last login: {{ new Date(d.lastLoginAt).toLocaleString() }}</div>
              </div>
              <div class="device-card-badge" v-if="d.otherAccounts > 0">
                <span class="other-badge">+{{ d.otherAccounts }} other account{{ d.otherAccounts !== 1 ? 's' : '' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Linked accounts on same devices -->
        <div class="section-block" style="margin-top: 20px">
          <h4 class="section-title">
            Accounts on Same Device{{ deviceData.linkedAccounts.length ? ` (${deviceData.linkedAccounts.length})` : '' }}
          </h4>
          <div v-if="deviceData.linkedAccounts.length === 0" class="empty-state">
            No accounts found for this device.
          </div>
          <table v-else class="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Device</th>
                <th>Platform</th>
                <th>Last Seen</th>
                <th>Wallet</th>
                <th>Flags</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="acc in deviceData.linkedAccounts" :key="acc.id" :class="{ 'row-self': !!acc.isSelf }">
                <td>
                  <div class="user-cell">
                    <div class="user-avatar-sm">{{ acc.displayName?.charAt(0) || '?' }}</div>
                    <div>
                      <div class="fw">
                        {{ acc.displayName }}
                        <span v-if="acc.isSelf" class="self-pill">This account</span>
                      </div>
                      <div class="dim">{{ acc.hakaId || acc.username || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="role-chip" :class="`role-${acc.role}`">{{ acc.role }}</span>
                </td>
                <td class="dim">{{ acc.sharedDeviceModel || 'Unknown' }}</td>
                <td class="dim">{{ platformIcon(acc.sharedPlatform) }} {{ acc.sharedPlatform || '—' }}</td>
                <td class="dim">{{ new Date(acc.lastSeenAt).toLocaleDateString() }}</td>
                <td>
                  <div class="wallet-mini" v-if="acc.wallet">
                    <span class="coin-val">🪙 {{ acc.wallet.coinBalance.toLocaleString() }}</span>
                    <span class="bean-val">🫘 {{ acc.wallet.beanBalance.toLocaleString() }}</span>
                  </div>
                  <span v-else class="dim">—</span>
                </td>
                <td>
                  <div class="flags-cell">
                    <span v-if="!acc.isActive" class="flag-chip flag-banned">Banned</span>
                    <span v-if="acc.riskControls?.length" class="flag-chip flag-risk">⚠️ Risk</span>
                    <span v-if="!acc.riskControls?.length && acc.isActive" class="dim">—</span>
                  </div>
                </td>
                <td class="actions-td">
                  <RowActionMenu>
                    <RowActionMenuItem @click="router.push(`/users/${acc.id}`)">View Profile</RowActionMenuItem>
                  </RowActionMenu>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </template>
    </div>

    <!-- ── Risk Control tab ───────────────────────────────────────────────── -->
    <div v-if="activeTab === 'risk'" class="tab-content">
      <div v-if="riskLoading" class="empty-state">Loading risk status…</div>

      <template v-else>
        <!-- Active risk banner -->
        <div v-if="activeRisk" class="risk-banner">
          <div class="risk-banner-left">
            <span :class="['sev-badge', SEV_CLASS[activeRisk.severity]]">{{ activeRisk.severity.toUpperCase() }}</span>
            <div class="risk-banner-info">
              <div class="risk-banner-title">⚠️ Account Under Risk Control</div>
              <div class="risk-banner-sub">
                Reason: <strong>{{ REASON_LABELS[activeRisk.reason] }}</strong> ·
                Applied: {{ new Date(activeRisk.createdAt).toLocaleDateString() }} ·
                Expires: {{ fmtExpiry(activeRisk.expiresAt) }}
              </div>
              <div v-if="activeRisk.notes" class="risk-banner-notes">📝 {{ activeRisk.notes }}</div>
            </div>
          </div>
          <div v-if="auth.hasPermission('risk.manage')" class="risk-banner-actions">
            <button class="btn-sm btn-outline" @click="openRiskModal(true)">Edit</button>
            <button class="btn-sm btn-success" @click="releaseConfirm = true">Release</button>
          </div>
        </div>

        <!-- No risk — clean state -->
        <div v-else class="risk-clean">
          <div class="risk-clean-icon">✅</div>
          <div class="risk-clean-text">No active risk control</div>
          <div class="risk-clean-sub">This account has full access to all features.</div>
          <button
            v-if="auth.hasPermission('risk.manage')"
            class="btn btn-warning"
            @click="openRiskModal(false)"
          >Apply Risk Control</button>
        </div>

        <!-- Active controls breakdown -->
        <div v-if="activeRisk" class="controls-grid">
          <div class="control-card" :class="{ frozen: activeRisk.freezeCoins }">
            <div class="ctrl-icon">🪙</div>
            <div class="ctrl-label">Coin Spending</div>
            <div :class="activeRisk.freezeCoins ? 'ctrl-frozen' : 'ctrl-ok'">
              {{ activeRisk.freezeCoins ? 'FROZEN' : 'Allowed' }}
            </div>
          </div>
          <div class="control-card" :class="{ frozen: activeRisk.freezeBeans }">
            <div class="ctrl-icon">🫘</div>
            <div class="ctrl-label">Bean Usage</div>
            <div :class="activeRisk.freezeBeans ? 'ctrl-frozen' : 'ctrl-ok'">
              {{ activeRisk.freezeBeans ? 'FROZEN' : 'Allowed' }}
            </div>
          </div>
          <div class="control-card" :class="{ frozen: activeRisk.disableGames }">
            <div class="ctrl-icon">🎮</div>
            <div class="ctrl-label">Games</div>
            <div :class="activeRisk.disableGames ? 'ctrl-frozen' : 'ctrl-ok'">
              {{ activeRisk.disableGames ? 'DISABLED' : 'Allowed' }}
            </div>
          </div>
          <div class="control-card" :class="{ frozen: activeRisk.disableGifts }">
            <div class="ctrl-icon">🎁</div>
            <div class="ctrl-label">Gift Sending</div>
            <div :class="activeRisk.disableGifts ? 'ctrl-frozen' : 'ctrl-ok'">
              {{ activeRisk.disableGifts ? 'DISABLED' : 'Allowed' }}
            </div>
          </div>
          <div class="control-card" :class="{ frozen: activeRisk.blockChat }">
            <div class="ctrl-icon">💬</div>
            <div class="ctrl-label">Chat</div>
            <div :class="activeRisk.blockChat ? 'ctrl-frozen' : 'ctrl-ok'">
              {{ activeRisk.blockChat ? 'BLOCKED' : 'Allowed' }}
            </div>
          </div>
        </div>

        <!-- History -->
        <div v-if="riskHistory.length" class="risk-history">
          <h4 class="section-title">Past Risk Controls</h4>
          <table class="data-table">
            <thead><tr><th>Severity</th><th>Reason</th><th>Applied</th><th>Released</th></tr></thead>
            <tbody>
              <tr v-for="h in riskHistory" :key="h.id">
                <td><span :class="['sev-badge', SEV_CLASS[h.severity]]">{{ h.severity.toUpperCase() }}</span></td>
                <td class="cell-secondary">{{ REASON_LABELS[h.reason] }}</td>
                <td class="cell-secondary">{{ new Date(h.createdAt).toLocaleDateString() }}</td>
                <td class="cell-secondary">{{ h.releasedAt ? new Date(h.releasedAt).toLocaleDateString() : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>

  <!-- ── Confirm ban/unban ─────────────────────────────────────────────────── -->
  <ConfirmDialog
    :show="dialog.show"
    :title="dialog.title"
    :message="dialog.message"
    :confirm-text="dialog.action === 'ban' ? 'Ban User' : 'Unban User'"
    :confirm-color="dialog.confirmColor"
    @confirm="handleConfirm"
    @cancel="dialog.show = false"
  />

  <Teleport to="body">
    <!-- ── Apply / Edit Risk Control Modal ────────────────────────────────── -->
    <div v-if="riskModal" class="modal-overlay" @click.self="riskModal = false">
      <div class="modal-box modal-risk">
        <div class="modal-header">
          <h3>{{ activeRisk ? 'Edit Risk Control' : 'Apply Risk Control' }} — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="riskModal = false">✕</button>
        </div>
        <div class="modal-body">
          <!-- Controls checkboxes -->
          <div class="risk-section-label">Freeze / Disable</div>
          <div class="risk-checks">
            <label class="risk-check">
              <input type="checkbox" v-model="riskForm.freezeCoins" />
              <div class="risk-check-body">
                <span class="risk-check-icon">🪙</span>
                <div>
                  <div class="risk-check-title">Freeze Coin Spending</div>
                  <div class="risk-check-sub">Cannot send gifts or play games with coins</div>
                </div>
              </div>
            </label>
            <label class="risk-check">
              <input type="checkbox" v-model="riskForm.freezeBeans" />
              <div class="risk-check-body">
                <span class="risk-check-icon">🫘</span>
                <div>
                  <div class="risk-check-title">Freeze Bean Usage</div>
                  <div class="risk-check-sub">Cannot withdraw or exchange beans</div>
                </div>
              </div>
            </label>
            <label class="risk-check">
              <input type="checkbox" v-model="riskForm.disableGames" />
              <div class="risk-check-body">
                <span class="risk-check-icon">🎮</span>
                <div>
                  <div class="risk-check-title">Disable Games</div>
                  <div class="risk-check-sub">Cannot participate in any games</div>
                </div>
              </div>
            </label>
            <label class="risk-check">
              <input type="checkbox" v-model="riskForm.disableGifts" />
              <div class="risk-check-body">
                <span class="risk-check-icon">🎁</span>
                <div>
                  <div class="risk-check-title">Disable Gift Sending</div>
                  <div class="risk-check-sub">Cannot send virtual gifts to other users</div>
                </div>
              </div>
            </label>
            <label class="risk-check">
              <input type="checkbox" v-model="riskForm.blockChat" />
              <div class="risk-check-body">
                <span class="risk-check-icon">💬</span>
                <div>
                  <div class="risk-check-title">Block Chat (Optional)</div>
                  <div class="risk-check-sub">Restrict messaging in rooms and DMs</div>
                </div>
              </div>
            </label>
          </div>

          <!-- Reason + Severity row -->
          <div class="form-row">
            <div class="form-group">
              <label>Reason</label>
              <select v-model="riskForm.reason" class="form-input">
                <option value="fraud_activity">Fraud Activity</option>
                <option value="suspicious_transactions">Suspicious Transactions</option>
                <option value="multiple_accounts">Multiple Accounts</option>
                <option value="chargeback">Chargeback</option>
                <option value="manual_review">Manual Review</option>
              </select>
            </div>
            <div class="form-group">
              <label>Severity Level</label>
              <select v-model="riskForm.severity" class="form-input">
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🔴 High</option>
                <option value="critical">🚨 Critical</option>
              </select>
            </div>
          </div>

          <!-- Duration -->
          <div class="form-group">
            <label>Duration</label>
            <div class="duration-grid">
              <label v-for="d in [{ v:'24h', l:'24 Hours' }, { v:'7d', l:'7 Days' }, { v:'30d', l:'30 Days' }, { v:'permanent', l:'Permanent' }]" :key="d.v" :class="['duration-opt', { active: riskForm.duration === d.v }]">
                <input type="radio" v-model="riskForm.duration" :value="d.v" style="display:none" />
                {{ d.l }}
              </label>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label>Notes (Internal)</label>
            <textarea v-model="riskForm.notes" class="form-textarea" rows="2" placeholder="Optional — internal notes for this action…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="riskModal = false">Cancel</button>
          <button class="btn btn-warning" :disabled="riskLoading" @click="submitRisk">
            {{ riskLoading ? 'Saving…' : activeRisk ? 'Update Controls' : 'Apply Risk Control' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Release confirm ─────────────────────────────────────────────────── -->
    <div v-if="releaseConfirm" class="modal-overlay" @click.self="releaseConfirm = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Release Risk Control</h3>
          <button class="btn-close" @click="releaseConfirm = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Remove all restrictions from <strong>{{ user?.displayName }}</strong>?<br />
            They will immediately regain full access to coins, beans, gifts, and games.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="releaseConfirm = false">Cancel</button>
          <button class="btn btn-success" :disabled="releaseLoading" @click="confirmRelease">
            {{ releaseLoading ? 'Releasing…' : 'Release Account' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── HAKA ID tier (special ID badge level) ───────────────────────────── -->
    <div v-if="showHakaIdTierModal" class="modal-overlay" @click.self="showHakaIdTierModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>HAKA ID tier — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="showHakaIdTierModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            Sets the <strong>SSS–B</strong> badge tier for this user’s active special 6-digit ID
            (<strong>{{ user?.activeSpecialId }}</strong>). This overrides the visual tier in the app
            (and updates the linked special ID record when inventory matches).
          </p>
          <div class="form-group">
            <label>Tier</label>
            <select v-model="hakaIdTierForm" class="form-input">
              <option v-for="t in HAKA_ID_TIERS" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <p v-if="hakaIdTierError" class="modal-sub" style="color: var(--danger);">{{ hakaIdTierError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showHakaIdTierModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="hakaIdTierSaving || !user?.activeSpecialId" @click="handleSetHakaIdTier">
            {{ hakaIdTierSaving ? 'Saving…' : 'Apply tier' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Force Level Modal ──────────────────────────────────────────────── -->
    <div v-if="showLevelModal" class="modal-overlay" @click.self="showLevelModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Force Set Level — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="showLevelModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Rich Level (1–21)</label>
              <input v-model.number="levelForm.richLevel" type="number" min="1" max="100" class="form-input" />
            </div>
            <div class="form-group">
              <label>Rich XP</label>
              <input v-model.number="levelForm.richXp" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label>Charm Level (1–21)</label>
              <input v-model.number="levelForm.charmLevel" type="number" min="1" max="100" class="form-input" />
            </div>
            <div class="form-group">
              <label>Charm XP</label>
              <input v-model.number="levelForm.charmXp" type="number" min="0" class="form-input" />
            </div>
          </div>
          <p v-if="levelError" class="modal-sub" style="color: var(--danger);">{{ levelError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showLevelModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="levelSaving" @click="handleSetLevel">
            {{ levelSaving ? 'Saving…' : 'Apply' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Ban User Modal (reason + duration) ──────────────────────────────── -->
    <div v-if="showBanModal" class="modal-overlay" @click.self="showBanModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Ban User — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="showBanModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            They will be logged out immediately and blocked from logging back in,
            joining rooms, sending messages, and gifting.
          </p>
          <div class="form-group">
            <label>Reason</label>
            <input
              v-model="banForm.reason"
              type="text"
              class="form-input"
              maxlength="500"
              placeholder="Why is this user being banned?"
            />
          </div>
          <div class="form-group">
            <label>Type</label>
            <div class="duration-grid" style="grid-template-columns: 1fr 1fr">
              <label :class="['duration-opt', { active: banForm.banType === 'permanent' }]">
                <input type="radio" v-model="banForm.banType" value="permanent" style="display:none" />
                Permanent
              </label>
              <label :class="['duration-opt', { active: banForm.banType === 'temporary' }]">
                <input type="radio" v-model="banForm.banType" value="temporary" style="display:none" />
                Temporary
              </label>
            </div>
          </div>
          <div v-if="banForm.banType === 'temporary'" class="form-group">
            <label>Duration</label>
            <div class="duration-grid">
              <label
                v-for="d in [{v:'1h',l:'1 Hour'},{v:'24h',l:'24 Hours'},{v:'7d',l:'7 Days'},{v:'30d',l:'30 Days'}] as const"
                :key="d.v"
                :class="['duration-opt', { active: banForm.duration === d.v }]"
              >
                <input type="radio" v-model="banForm.duration" :value="d.v" style="display:none" />
                {{ d.l }}
              </label>
              <label :class="['duration-opt', { active: banForm.duration === 'custom' }]" style="grid-column: span 4">
                <input type="radio" v-model="banForm.duration" value="custom" style="display:none" />
                Custom expiry
              </label>
            </div>
            <input
              v-if="banForm.duration === 'custom'"
              v-model="banForm.expiresAt"
              type="datetime-local"
              class="form-input"
              style="margin-top: 8px"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showBanModal = false">Cancel</button>
          <button class="btn btn-danger" :disabled="banSaving" @click="submitBan">
            {{ banSaving ? 'Banning…' : 'Ban User' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Host Ban Modal (reason + duration) ──────────────────────────────── -->
    <div v-if="showHostBanModal" class="modal-overlay" @click.self="showHostBanModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Ban Host — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="showHostBanModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            All active rooms hosted by this user will be closed immediately,
            and they will be blocked from going live again.
          </p>
          <div class="form-group">
            <label>Reason</label>
            <input
              v-model="hostBanForm.reason"
              type="text"
              class="form-input"
              maxlength="500"
              placeholder="Why is this host being banned?"
            />
          </div>
          <div class="form-group">
            <label>Type</label>
            <div class="duration-grid" style="grid-template-columns: 1fr 1fr">
              <label :class="['duration-opt', { active: hostBanForm.banType === 'permanent' }]">
                <input type="radio" v-model="hostBanForm.banType" value="permanent" style="display:none" />
                Permanent
              </label>
              <label :class="['duration-opt', { active: hostBanForm.banType === 'temporary' }]">
                <input type="radio" v-model="hostBanForm.banType" value="temporary" style="display:none" />
                Temporary
              </label>
            </div>
          </div>
          <div v-if="hostBanForm.banType === 'temporary'" class="form-group">
            <label>Duration</label>
            <div class="duration-grid">
              <label
                v-for="d in [{v:'1h',l:'1 Hour'},{v:'24h',l:'24 Hours'},{v:'7d',l:'7 Days'},{v:'30d',l:'30 Days'}] as const"
                :key="d.v"
                :class="['duration-opt', { active: hostBanForm.duration === d.v }]"
              >
                <input type="radio" v-model="hostBanForm.duration" :value="d.v" style="display:none" />
                {{ d.l }}
              </label>
              <label :class="['duration-opt', { active: hostBanForm.duration === 'custom' }]" style="grid-column: span 4">
                <input type="radio" v-model="hostBanForm.duration" value="custom" style="display:none" />
                Custom expiry
              </label>
            </div>
            <input
              v-if="hostBanForm.duration === 'custom'"
              v-model="hostBanForm.expiresAt"
              type="datetime-local"
              class="form-input"
              style="margin-top: 8px"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showHostBanModal = false">Cancel</button>
          <button class="btn btn-danger" :disabled="hostBanSaving" @click="submitHostBan">
            {{ hostBanSaving ? 'Banning…' : 'Ban Host' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Reset Password Modal ───────────────────────────────────────────── -->
    <div v-if="showResetPassword" class="modal-overlay" @click.self="showResetPassword = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Reset Password — {{ user?.displayName }}</h3>
          <button class="btn-close" @click="showResetPassword = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">
            This will update the user's Firebase password. They will need to use the new password on next login.
          </p>
          <div class="form-group">
            <label>New Password (min 8 characters)</label>
            <input
              v-model="newPassword"
              type="password"
              class="form-input"
              placeholder="Enter new password…"
              minlength="8"
            />
          </div>
          <p v-if="resetError" class="modal-sub" style="color: var(--danger);">{{ resetError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showResetPassword = false">Cancel</button>
          <button
            class="btn btn-danger"
            :disabled="resetSaving || newPassword.length < 8"
            @click="handleResetPassword"
          >
            {{ resetSaving ? 'Resetting…' : 'Reset Password' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.loading { padding: 60px; text-align: center; color: var(--text-muted); }
.user-detail { display: flex; flex-direction: column; gap: 16px; }
.detail-header { display: flex; align-items: center; justify-content: space-between; }

.back-btn { background: none; border: none; color: var(--primary); font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; }
.header-actions { display: flex; gap: 8px; }
.btn-action { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #fff; }
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger   { background: var(--danger); color: #fff; }
.btn-success  { background: var(--success); }
.btn-primary  { background: var(--primary); }
.btn-secondary { background: #6c757d; }

.profile-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 24px; }
.profile-avatar { display: flex; justify-content: center; margin-bottom: 20px; }
.avatar-lg { width: 80px; height: 80px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.agent-commission-panel {
  grid-column: 1 / -1;
  margin-top: 8px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid var(--card-border);
  border-radius: 10px;
}
.agent-commission-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.agent-commission-intro { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); }
.agent-commission-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 900px) { .agent-commission-row { grid-template-columns: 1fr; } }
.agent-commission-block { display: flex; flex-direction: column; gap: 6px; }
.agent-commission-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 600; }
.agent-commission-meta { font-size: 11px; font-weight: 500; color: var(--text-muted); }
.agent-commission-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.agent-commission-input { flex: 1; min-width: 80px; max-width: 140px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
.agent-dt-label { font-size: 11px; font-weight: 600; color: var(--text-muted); }
.agent-commission-dt { max-width: 280px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
.agent-commission-hint { margin: 0; font-size: 11px; color: var(--text-muted); line-height: 1.35; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.field-value { font-size: 14px; color: var(--text-primary); }
.haka-id { color: var(--primary); font-weight: 700; }

.tabs { display: flex; gap: 0; border-bottom: 2px solid var(--card-border); background: var(--card-bg); border-radius: 12px 12px 0 0; }
.tab { padding: 12px 20px; border: none; background: none; font-size: 14px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; display: flex; align-items: center; gap: 4px; }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.risk-dot { font-size: 12px; }

.tab-content { background: var(--card-bg); border: 1px solid var(--card-border); border-top: none; border-radius: 0 0 12px 12px; padding: 20px; }

/* Wallet */
.wallet-cards { display: flex; gap: 16px; }
.wallet-card { flex: 1; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wallet-card.coin { background: var(--warning-soft); }
.wallet-card.bean { background: var(--success-soft); }
.wallet-icon   { font-size: 32px; }
.wallet-amount { font-size: 28px; font-weight: 700; color: var(--text-primary); }
.wallet-label  { font-size: 13px; color: var(--text-muted); }

/* Tables */
.section-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 12px; font-size: 13px; border-top: 1px solid #F1F5F9; }
.cell-primary   { font-weight: 500; color: var(--text-primary); }
.cell-secondary { color: var(--text-muted); font-size: 12px; }
.empty-state { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* Stats */
.stats-row { display: flex; gap: 16px; flex-wrap: wrap; }
.mini-stat { flex: 1; min-width: 120px; padding: 16px; border-radius: 12px; background: var(--content-bg); text-align: center; display: flex; flex-direction: column; gap: 4px; }
.mini-val   { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.mini-label { font-size: 12px; color: var(--text-muted); }

/* Risk Control tab */
.risk-banner {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px;
  padding: 14px 16px; margin-bottom: 16px;
}
.risk-banner-left    { display: flex; align-items: flex-start; gap: 12px; }
.risk-banner-info    { display: flex; flex-direction: column; gap: 3px; }
.risk-banner-title   { font-size: 14px; font-weight: 700; color: #92400e; }
.risk-banner-sub     { font-size: 12px; color: #92400e; opacity: 0.8; }
.risk-banner-notes   { font-size: 12px; color: #78350f; margin-top: 2px; }
.risk-banner-actions { display: flex; gap: 8px; flex-shrink: 0; }

.risk-clean { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; text-align: center; }
.risk-clean-icon { font-size: 36px; }
.risk-clean-text { font-size: 16px; font-weight: 700; color: var(--success); }
.risk-clean-sub  { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }

.controls-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px;
}
.control-card {
  background: #f8fafc; border: 1px solid var(--card-border); border-radius: 10px;
  padding: 14px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.control-card.frozen { background: #fff1f2; border-color: #fca5a5; }
.ctrl-icon  { font-size: 24px; }
.ctrl-label { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.ctrl-frozen { font-size: 11px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px; }
.ctrl-ok     { font-size: 11px; font-weight: 700; color: var(--success); }

.risk-history { margin-top: 16px; }

/* Buttons */
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-warning  { background: #F59E0B; color: #fff; }
.btn-warning:hover { background: #D97706; }
.btn-sm       { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; }
.btn-outline  { background: transparent; border: 1px solid var(--card-border); color: var(--text-primary); }
.btn-success  { background: var(--success); color: #fff; }

.sev-badge { padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; }
.sev-critical { background: #fee2e2; color: #991b1b; }
.sev-high     { background: #fef3c7; color: #92400e; }
.sev-medium   { background: #fef9c3; color: #713f12; }
.sev-low      { background: #dcfce7; color: #14532d; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box     { background: var(--card-bg); border-radius: 16px; width: min(480px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-risk    { width: min(600px, 100%); }
.modal-header  { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.btn-close     { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.modal-body    { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.modal-footer  { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub     { margin: 0; font-size: 14px; color: var(--text-muted); line-height: 1.6; }

.risk-section-label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

.risk-checks { display: flex; flex-direction: column; gap: 8px; }
.risk-check  { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border: 1px solid var(--card-border); border-radius: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.risk-check:has(input:checked) { border-color: var(--primary); background: var(--primary-soft); }
.risk-check input { margin-top: 2px; accent-color: var(--primary); flex-shrink: 0; }
.risk-check-body  { display: flex; align-items: flex-start; gap: 10px; }
.risk-check-icon  { font-size: 20px; }
.risk-check-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.risk-check-sub   { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

.form-row  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-textarea { padding: 8px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; resize: vertical; font-family: inherit; }
.form-textarea:focus { border-color: var(--primary); }

.duration-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.duration-opt  { padding: 8px; border: 1px solid var(--card-border); border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; color: var(--text-muted); }
.duration-opt.active { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
.duration-opt:hover:not(.active) { border-color: var(--primary); }

/* Same Device tab */
.section-block { display: flex; flex-direction: column; gap: 12px; }
.device-dot { font-size: 12px; }
.tab-count {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--primary); color: #fff;
  font-size: 10px; font-weight: 700; border-radius: 10px;
  padding: 1px 6px; margin-left: 4px;
}

.device-cards { display: flex; flex-direction: column; gap: 8px; }
.device-card {
  display: flex; align-items: center; gap: 14px;
  background: #F8FAFC; border: 1px solid var(--card-border); border-radius: 10px; padding: 14px 16px;
}
.device-card-icon { font-size: 28px; flex-shrink: 0; }
.device-card-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.device-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.device-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.device-tag { padding: 2px 7px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 11px; font-weight: 600; }
.device-id-short { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.device-last { font-size: 12px; color: var(--text-muted); }
.other-badge { padding: 3px 10px; background: var(--warning-soft); color: var(--warning); border-radius: 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.user-avatar-sm { width: 32px; height: 32px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }

.role-chip { padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.role-normal_user { background: #f1f5f9; color: #475569; }
.role-host  { background: var(--primary-soft); color: var(--primary); }
.role-agent { background: #fef3c7; color: #92400e; }

.wallet-mini { display: flex; flex-direction: column; gap: 1px; }
.coin-val { font-size: 11px; color: var(--warning); font-weight: 600; }
.bean-val { font-size: 11px; color: var(--success); font-weight: 600; }

.flags-cell { display: flex; flex-direction: column; gap: 3px; }
.flag-chip  { padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 700; }
.flag-banned { background: #fee2e2; color: #991b1b; }
.flag-risk   { background: #fef3c7; color: #92400e; }

.row-self td { background: #eef2ff; }
.row-self:hover td { background: #e0e7ff; }
.self-pill { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; color: #3730a3; background: #e0e7ff; border: 1px solid #c7d2fe; }

/* Tags panel */
.tags-panel { display: flex; flex-direction: column; gap: 16px; }
.tag-list   { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.tag-badge-wrap { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.tag-badge-inner { position: relative; display: inline-block; }
.tag-badge-meta { font-size: 11px; color: var(--text-secondary); line-height: 1.3; }
.tag-badge-img {
  height: 22px; width: auto; display: block;
  object-fit: contain;
}
.tag-badge-fallback {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  color: #fff; font-weight: 700; font-size: 13px;
}
.tag-remove-floating {
  position: absolute; top: -6px; right: -6px;
  width: 18px; height: 18px;
  background: #ef4444; color: #fff; border: 2px solid #fff;
  border-radius: 50%;
  cursor: pointer; font-size: 12px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
}
.tag-assign-row { display: flex; gap: 8px; align-items: center; }
.tag-select {
  flex: 1; max-width: 320px;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff;
}
.tag-note    { font-size: 12px; color: var(--text-secondary); margin: 0; }
.empty-state { color: var(--text-secondary); font-style: italic; }
.password-row { display: flex; align-items: center; gap: 8px; }
.copy-link { background: none; border: none; color: var(--primary, #7B4FFF); cursor: pointer; font-size: 13px; padding: 0; }
.power-panel { padding: 16px; background: var(--surface, #f9fafb); border-radius: 12px; border: 1px solid var(--border); max-width: 560px; }
.power-note { font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }
.power-list { margin: 12px 0 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); }
.power-status { font-size: 13px; margin-top: 12px; }
</style>
