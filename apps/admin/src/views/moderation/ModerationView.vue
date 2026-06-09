<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as modApi from '@/api/moderation'
import * as supportApi from '@/api/support'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAdminRealtime } from '@/composables/useAdminRealtime'
import SupportScreenshotGallery from '@/components/support/SupportScreenshotGallery.vue'

const toast = useToastStore()

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref<'reports' | 'bans' | 'deviceBans' | 'tickets'>('reports')

// ── Reports ───────────────────────────────────────────────────────────────────
const reports = ref<any[]>([])
const reportPagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const reportStatusFilter = ref('')
const reportLoading = ref(true)
const reportActionLoading = ref<string | null>(null)

async function fetchReports() {
  reportLoading.value = true
  try {
    const params: Record<string, any> = {
      page: reportPagination.value.page,
      limit: reportPagination.value.limit,
    }
    if (reportStatusFilter.value) params.status = reportStatusFilter.value
    const result = await modApi.listReports(params)
    reports.value = result.items
    reportPagination.value = result.pagination
  } catch {}
  reportLoading.value = false
}

async function reviewReport(id: string, status: 'reviewed' | 'dismissed') {
  reportActionLoading.value = id
  try {
    await modApi.reviewReport(id, status)
    toast.success('Report Updated', `Marked as ${status}.`)
    await fetchReports()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  reportActionLoading.value = null
}

// ── Bans ──────────────────────────────────────────────────────────────────────
const bans = ref<any[]>([])
const banPagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const showActiveBansOnly = ref(true)
const banLoading = ref(true)
const banActionLoading = ref<string | null>(null)
const banModal = ref(false)
const liftConfirm = ref<any>(null)
const banForm = ref({ userId: '', reason: '', banType: 'permanent' as 'permanent' | 'temporary', expiresAt: '', scope: 'platform' as 'platform' | 'room', roomId: '' })
const banFormLoading = ref(false)

async function fetchBans() {
  banLoading.value = true
  try {
    const params: Record<string, any> = {
      page: banPagination.value.page,
      limit: banPagination.value.limit,
    }
    if (showActiveBansOnly.value) params.isActive = 'true'
    const result = await modApi.listBans(params)
    bans.value = result.items
    banPagination.value = result.pagination
  } catch {}
  banLoading.value = false
}

async function executeLiftBan() {
  if (!liftConfirm.value) return
  const id = liftConfirm.value.id
  liftConfirm.value = null
  banActionLoading.value = id
  try {
    await modApi.liftBan(id)
    toast.success('Ban Lifted')
    await fetchBans()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  banActionLoading.value = null
}

async function submitBan() {
  if (!banForm.value.userId || !banForm.value.reason) return
  if (banForm.value.scope === 'room' && !banForm.value.roomId) {
    toast.error('Room ID required', 'Enter the roomId to apply a room-scoped ban.')
    return
  }
  banFormLoading.value = true
  try {
    if (banForm.value.scope === 'room') {
      await modApi.createRoomBan({
        userId: banForm.value.userId,
        roomId: banForm.value.roomId,
        reason: banForm.value.reason,
      })
      toast.success('User Banned from Room')
    } else {
      const data: any = {
        userId: banForm.value.userId,
        reason: banForm.value.reason,
        banType: banForm.value.banType,
      }
      if (banForm.value.banType === 'temporary' && banForm.value.expiresAt) {
        data.expiresAt = new Date(banForm.value.expiresAt).toISOString()
      }
      await modApi.createBan(data)
      toast.success('User Banned')
    }
    banModal.value = false
    banForm.value = { userId: '', reason: '', banType: 'permanent', expiresAt: '', scope: 'platform', roomId: '' }
    await fetchBans()
  } catch (e: any) {
    toast.error('Ban Failed', e?.message)
  }
  banFormLoading.value = false
}

// ── Device Bans ──────────────────────────────────────────────────────────────
const deviceBans = ref<any[]>([])
const deviceBanPagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const deviceBanLoading = ref(true)
const deviceBanActionLoading = ref<string | null>(null)
const deviceBanModal = ref(false)
const liftDeviceBanConfirm = ref<any>(null)
const deviceBanForm = ref({ deviceId: '', reason: '', banType: 'permanent' as 'permanent' | 'temporary', expiresAt: '' })
const deviceBanFormLoading = ref(false)

async function fetchDeviceBans() {
  deviceBanLoading.value = true
  try {
    const params: Record<string, any> = {
      page: deviceBanPagination.value.page,
      limit: deviceBanPagination.value.limit,
    }
    const result = await modApi.listDeviceBans(params)
    deviceBans.value = result.items
    deviceBanPagination.value = result.pagination
  } catch {}
  deviceBanLoading.value = false
}

async function executeLiftDeviceBan() {
  if (!liftDeviceBanConfirm.value) return
  const deviceId = liftDeviceBanConfirm.value.deviceId
  liftDeviceBanConfirm.value = null
  deviceBanActionLoading.value = deviceId
  try {
    await modApi.liftDeviceBan(deviceId)
    toast.success('Device Ban Lifted')
    await fetchDeviceBans()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  deviceBanActionLoading.value = null
}

async function submitDeviceBan() {
  if (!deviceBanForm.value.deviceId || !deviceBanForm.value.reason) return
  deviceBanFormLoading.value = true
  try {
    const data: any = {
      deviceId: deviceBanForm.value.deviceId,
      reason: deviceBanForm.value.reason,
      banType: deviceBanForm.value.banType,
    }
    if (deviceBanForm.value.banType === 'temporary' && deviceBanForm.value.expiresAt) {
      data.expiresAt = new Date(deviceBanForm.value.expiresAt).toISOString()
    }
    await modApi.createDeviceBan(data)
    toast.success('Device Banned')
    deviceBanModal.value = false
    deviceBanForm.value = { deviceId: '', reason: '', banType: 'permanent', expiresAt: '' }
    await fetchDeviceBans()
  } catch (e: any) {
    toast.error('Device Ban Failed', e?.message)
  }
  deviceBanFormLoading.value = false
}

// ── Support Tickets ───────────────────────────────────────────────────────────
const tickets = ref<any[]>([])
const ticketPagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const ticketStatusFilter = ref('')
const ticketLoading = ref(false)
const ticketActionLoading = ref<string | null>(null)

const replyModal = ref<any>(null)
const replyText = ref('')
const replyLoading = ref(false)
const closeConfirm = ref<any>(null)

async function fetchTickets() {
  ticketLoading.value = true
  try {
    const params: Record<string, any> = {
      page: ticketPagination.value.page,
      limit: ticketPagination.value.limit,
    }
    if (ticketStatusFilter.value) params.status = ticketStatusFilter.value
    const result = await supportApi.listTickets(params)
    tickets.value = result.items
    ticketPagination.value = result.pagination
  } catch (e: any) {
    toast.error('Failed to load tickets', e?.message || 'Could not fetch support tickets')
  }
  ticketLoading.value = false
}

function openReply(ticket: any) {
  replyModal.value = ticket
  replyText.value = ticket.adminReply || ''
}

async function submitReply() {
  if (!replyModal.value || !replyText.value.trim()) return
  replyLoading.value = true
  try {
    await supportApi.replyTicket(replyModal.value.id, replyText.value.trim())
    toast.success('Reply Sent', 'The user will see your reply in the app.')
    replyModal.value = null
    replyText.value = ''
    await fetchTickets()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  replyLoading.value = false
}

async function executeCloseTicket() {
  if (!closeConfirm.value) return
  const id = closeConfirm.value.id
  closeConfirm.value = null
  ticketActionLoading.value = id
  try {
    await supportApi.closeTicket(id)
    toast.success('Ticket Closed')
    await fetchTickets()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  ticketActionLoading.value = null
}

function ticketStatusClass(status: string) {
  if (status === 'replied') return 'badge badge-success'
  if (status === 'closed') return 'badge badge-secondary'
  return 'badge badge-warning'
}

function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab
  if (tab === 'tickets' && tickets.value.length === 0) fetchTickets()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchReports()
  fetchBans()
  fetchDeviceBans()
})
watch(() => reportPagination.value.page, fetchReports)
watch(() => banPagination.value.page, fetchBans)
watch(() => deviceBanPagination.value.page, fetchDeviceBans)
watch(() => ticketPagination.value.page, fetchTickets)
useAdminRealtime('support_tickets', fetchTickets)

function reportStatusClass(status: string) {
  if (status === 'reviewed') return 'badge badge-success'
  if (status === 'dismissed') return 'badge badge-secondary'
  return 'badge badge-warning'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Moderation</h2>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', activeTab === 'reports' ? 'active' : '']" @click="switchTab('reports')">
        User Reports <span v-if="reportPagination.total" class="tab-count">{{ reportPagination.total }}</span>
      </button>
      <button :class="['tab', activeTab === 'bans' ? 'active' : '']" @click="switchTab('bans')">
        User Bans <span v-if="banPagination.total" class="tab-count">{{ banPagination.total }}</span>
      </button>
      <button :class="['tab', activeTab === 'deviceBans' ? 'active' : '']" @click="switchTab('deviceBans')">
        Device Bans <span v-if="deviceBanPagination.total" class="tab-count">{{ deviceBanPagination.total }}</span>
      </button>
      <button :class="['tab', activeTab === 'tickets' ? 'active' : '']" @click="switchTab('tickets')">
        Support Tickets <span v-if="ticketPagination.total" class="tab-count">{{ ticketPagination.total }}</span>
      </button>
    </div>

    <!-- ── REPORTS TAB ── -->
    <div v-if="activeTab === 'reports'">
      <div class="toolbar">
        <select v-model="reportStatusFilter" @change="reportPagination.page = 1; fetchReports()" class="filter-select">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <span class="stat-pill">Total: {{ reportPagination.total }}</span>
      </div>

      <div class="table-card">
        <div v-if="reportLoading" class="loading">Loading reports...</div>
        <div v-else-if="reports.length === 0" class="empty">No reports found.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Target Type</th>
              <th>Target ID</th>
              <th>Reason</th>
              <th>Description</th>
              <th>Status</th>
              <th>Date</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reports" :key="r.id">
              <td>
                <div class="user-name">{{ r.reporter?.displayName ?? '—' }}</div>
                <div class="user-sub mono">{{ r.reporter?.hakaId ?? '' }}</div>
              </td>
              <td><span class="badge badge-info">{{ r.targetType }}</span></td>
              <td class="mono small">{{ r.targetId }}</td>
              <td class="bold">{{ r.reason }}</td>
              <td class="note-cell">{{ r.description || '—' }}</td>
              <td><span :class="reportStatusClass(r.status)">{{ r.status }}</span></td>
              <td class="mono small">{{ new Date(r.createdAt).toLocaleString() }}</td>
              <td class="actions-td">
                <RowActionMenu v-if="r.status === 'pending'">
                  <RowActionMenuItem
                    variant="success"
                    :disabled="reportActionLoading === r.id"
                    @click="reviewReport(r.id, 'reviewed')"
                  >
                    Review
                  </RowActionMenuItem>
                  <RowActionMenuItem
                    :disabled="reportActionLoading === r.id"
                    @click="reviewReport(r.id, 'dismissed')"
                  >
                    Dismiss
                  </RowActionMenuItem>
                </RowActionMenu>
                <span v-else class="processed-label">Done</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination
        :page="reportPagination.page"
        :total-pages="reportPagination.totalPages"
        :total="reportPagination.total"
        @update:page="(p: number) => (reportPagination.page = p)"
      />
    </div>

    <!-- ── BANS TAB ── -->
    <div v-if="activeTab === 'bans'">
      <div class="toolbar">
        <label class="checkbox-label">
          <input type="checkbox" v-model="showActiveBansOnly" @change="banPagination.page = 1; fetchBans()" />
          Active bans only
        </label>
        <span class="stat-pill">Total: {{ banPagination.total }}</span>
        <button class="btn btn-danger" @click="banModal = true">+ Ban User</button>
      </div>

      <div class="table-card">
        <div v-if="banLoading" class="loading">Loading bans...</div>
        <div v-else-if="bans.length === 0" class="empty">No bans found.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Reason</th>
              <th>Type</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Banned</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in bans" :key="b.id">
              <td>
                <div class="user-name">{{ b.user?.displayName ?? '—' }}</div>
                <div class="user-sub mono">{{ b.user?.hakaId ?? '' }}</div>
              </td>
              <td class="note-cell">{{ b.reason }}</td>
              <td>
                <span :class="b.banType === 'permanent' ? 'badge badge-danger' : 'badge badge-warning'">
                  {{ b.banType }}
                </span>
              </td>
              <td class="mono small">{{ b.expiresAt ? new Date(b.expiresAt).toLocaleString() : '∞ Forever' }}</td>
              <td>
                <span :class="b.isActive ? 'badge badge-danger' : 'badge badge-secondary'">
                  {{ b.isActive ? 'Active' : 'Lifted' }}
                </span>
              </td>
              <td class="mono small">{{ new Date(b.createdAt).toLocaleString() }}</td>
              <td class="actions-td">
                <RowActionMenu v-if="b.isActive">
                  <RowActionMenuItem
                    :disabled="banActionLoading === b.id"
                    @click="liftConfirm = b"
                  >
                    Lift Ban
                  </RowActionMenuItem>
                </RowActionMenu>
                <span v-else class="processed-label">Lifted</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination
        :page="banPagination.page"
        :total-pages="banPagination.totalPages"
        :total="banPagination.total"
        @update:page="(p: number) => (banPagination.page = p)"
      />
    </div>

    <!-- ── DEVICE BANS TAB ── -->
    <div v-if="activeTab === 'deviceBans'">
      <div class="toolbar">
        <span class="stat-pill">Total: {{ deviceBanPagination.total }}</span>
        <button class="btn btn-danger" @click="deviceBanModal = true">+ Ban Device</button>
      </div>

      <div class="table-card">
        <div v-if="deviceBanLoading" class="loading">Loading device bans...</div>
        <div v-else-if="deviceBans.length === 0" class="empty">No device bans found.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Device ID</th>
              <th>Reason</th>
              <th>Type</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Banned</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deviceBans" :key="d.id">
              <td class="mono small">{{ d.deviceId }}</td>
              <td class="note-cell">{{ d.reason }}</td>
              <td>
                <span :class="d.banType === 'permanent' ? 'badge badge-danger' : 'badge badge-warning'">
                  {{ d.banType }}
                </span>
              </td>
              <td class="mono small">{{ d.expiresAt ? new Date(d.expiresAt).toLocaleString() : '∞ Forever' }}</td>
              <td>
                <span :class="d.isActive ? 'badge badge-danger' : 'badge badge-secondary'">
                  {{ d.isActive ? 'Active' : 'Lifted' }}
                </span>
              </td>
              <td class="mono small">{{ new Date(d.createdAt).toLocaleString() }}</td>
              <td class="actions-td">
                <RowActionMenu v-if="d.isActive">
                  <RowActionMenuItem
                    :disabled="deviceBanActionLoading === d.deviceId"
                    @click="liftDeviceBanConfirm = d"
                  >
                    Lift Ban
                  </RowActionMenuItem>
                </RowActionMenu>
                <span v-else class="processed-label">Lifted</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination
        :page="deviceBanPagination.page"
        :total-pages="deviceBanPagination.totalPages"
        :total="deviceBanPagination.total"
        @update:page="(p: number) => (deviceBanPagination.page = p)"
      />
    </div>

    <!-- ── SUPPORT TICKETS TAB ── -->
    <div v-if="activeTab === 'tickets'">
      <div class="toolbar">
        <select v-model="ticketStatusFilter" @change="ticketPagination.page = 1; fetchTickets()" class="filter-select">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="replied">Replied</option>
          <option value="closed">Closed</option>
        </select>
        <span class="stat-pill">Total: {{ ticketPagination.total }}</span>
      </div>

      <div class="table-card">
        <div v-if="ticketLoading" class="loading">Loading tickets...</div>
        <div v-else-if="tickets.length === 0" class="empty">No support tickets found.</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Description</th>
              <th>Screenshot</th>
              <th>Status</th>
              <th>Admin Reply</th>
              <th>Date</th>
              <th class="actions-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tickets" :key="t.id">
              <td>
                <div class="user-row">
                  <img v-if="t.user?.avatar" :src="t.user.avatar" class="avatar" />
                  <div class="avatar-fallback" v-else>{{ (t.user?.displayName ?? '?')[0] }}</div>
                  <div>
                    <div class="user-name">{{ t.user?.displayName ?? '—' }}</div>
                    <div class="user-sub mono">{{ t.user?.hakaId ?? '' }}</div>
                  </div>
                </div>
              </td>
              <td class="note-cell">{{ t.description }}</td>
              <td>
                <SupportScreenshotGallery
                  v-if="t.hasScreenshot"
                  :ticket-id="t.id"
                  :screenshot-urls="t.screenshotUrls"
                />
                <span v-else class="processed-label">—</span>
              </td>
              <td><span :class="ticketStatusClass(t.status)">{{ t.status }}</span></td>
              <td class="note-cell">{{ t.adminReply || '—' }}</td>
              <td class="mono small">{{ new Date(t.createdAt).toLocaleString() }}</td>
              <td class="actions-td">
                <RowActionMenu>
                  <RowActionMenuItem
                    variant="success"
                    :disabled="ticketActionLoading === t.id"
                    @click="openReply(t)"
                  >
                    {{ t.adminReply ? 'Edit Reply' : 'Reply' }}
                  </RowActionMenuItem>
                  <RowActionMenuItem
                    v-if="t.status !== 'closed'"
                    :disabled="ticketActionLoading === t.id"
                    @click="closeConfirm = t"
                  >
                    Close
                  </RowActionMenuItem>
                </RowActionMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination
        :page="ticketPagination.page"
        :total-pages="ticketPagination.totalPages"
        :total="ticketPagination.total"
        @update:page="(p: number) => (ticketPagination.page = p)"
      />
    </div>

    <!-- Reply Modal -->
    <div v-if="replyModal" class="modal-overlay" @click.self="replyModal = null">
      <div class="modal">
        <h3>Reply to Ticket</h3>
        <div class="ticket-preview">
          <div class="preview-label">User:</div>
          <div class="preview-value">{{ replyModal.user?.displayName ?? '—' }} ({{ replyModal.user?.hakaId ?? '' }})</div>
          <div class="preview-label">Issue:</div>
          <div class="preview-value">{{ replyModal.description }}</div>
        </div>
        <div class="form-group">
          <label>Your Reply</label>
          <textarea v-model="replyText" class="form-textarea" rows="4" placeholder="Type your reply..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="replyModal = null">Cancel</button>
          <button class="btn btn-success" :disabled="replyLoading || !replyText.trim()" @click="submitReply">
            {{ replyLoading ? 'Sending...' : 'Send Reply' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Close Ticket Confirm Modal -->
    <div v-if="closeConfirm" class="modal-overlay" @click.self="closeConfirm = null">
      <div class="modal">
        <h3>Close Ticket</h3>
        <p>
          Close this ticket from <strong>{{ closeConfirm.user?.displayName }}</strong>?
          The user will no longer receive replies.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeConfirm = null">Cancel</button>
          <button class="btn btn-danger" @click="executeCloseTicket">Yes, Close</button>
        </div>
      </div>
    </div>

    <!-- Lift device ban confirm modal -->
    <div v-if="liftDeviceBanConfirm" class="modal-overlay" @click.self="liftDeviceBanConfirm = null">
      <div class="modal">
        <h3>Lift Device Ban</h3>
        <p>
          Lift ban for device <strong class="mono">{{ liftDeviceBanConfirm.deviceId }}</strong>?
          Users on this device will be able to log in and create accounts again.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="liftDeviceBanConfirm = null">Cancel</button>
          <button class="btn btn-success" @click="executeLiftDeviceBan">Yes, Lift Ban</button>
        </div>
      </div>
    </div>

    <!-- Device Ban Modal -->
    <div v-if="deviceBanModal" class="modal-overlay" @click.self="deviceBanModal = false">
      <div class="modal">
        <h3>Ban Device</h3>
        <div class="form-group">
          <label>Device ID</label>
          <input v-model="deviceBanForm.deviceId" class="form-input" placeholder="Paste device ID..." />
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input v-model="deviceBanForm.reason" class="form-input" placeholder="Reason for device ban..." />
        </div>
        <div class="form-group">
          <label>Ban Type</label>
          <select v-model="deviceBanForm.banType" class="filter-select" style="width:100%">
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>
        <div v-if="deviceBanForm.banType === 'temporary'" class="form-group">
          <label>Expires At</label>
          <input type="datetime-local" v-model="deviceBanForm.expiresAt" class="form-input" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="deviceBanModal = false">Cancel</button>
          <button class="btn btn-danger" :disabled="deviceBanFormLoading" @click="submitDeviceBan">
            {{ deviceBanFormLoading ? 'Banning...' : 'Ban Device' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Lift ban confirm modal -->
    <div v-if="liftConfirm" class="modal-overlay" @click.self="liftConfirm = null">
      <div class="modal">
        <h3>Lift Ban</h3>
        <p>
          Lift ban for <strong>{{ liftConfirm.user?.displayName }}</strong>?
          They will regain full access to the platform.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="liftConfirm = null">Cancel</button>
          <button class="btn btn-success" @click="executeLiftBan">Yes, Lift Ban</button>
        </div>
      </div>
    </div>

    <!-- Ban Modal -->
    <div v-if="banModal" class="modal-overlay" @click.self="banModal = false">
      <div class="modal">
        <h3>Ban User</h3>
        <div class="form-group">
          <label>Ban Scope</label>
          <select v-model="banForm.scope" class="filter-select" style="width:100%">
            <option value="platform">Platform-wide (logs user out)</option>
            <option value="room">Single Room only</option>
          </select>
        </div>
        <div class="form-group">
          <label>Haka ID or Special ID</label>
          <input v-model="banForm.userId" class="form-input" placeholder="e.g. 123456" />
        </div>
        <div v-if="banForm.scope === 'room'" class="form-group">
          <label>Room ID</label>
          <input v-model="banForm.roomId" class="form-input" placeholder="Paste room UUID..." />
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input v-model="banForm.reason" class="form-input" placeholder="Reason for ban..." />
        </div>
        <div v-if="banForm.scope === 'platform'" class="form-group">
          <label>Ban Type</label>
          <select v-model="banForm.banType" class="filter-select" style="width:100%">
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>
        <div v-if="banForm.scope === 'platform' && banForm.banType === 'temporary'" class="form-group">
          <label>Expires At</label>
          <input type="datetime-local" v-model="banForm.expiresAt" class="form-input" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="banModal = false">Cancel</button>
          <button class="btn btn-danger" :disabled="banFormLoading" @click="submitBan">
            {{ banFormLoading ? 'Banning...' : 'Ban User' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid #eee; }
.tab {
  padding: 10px 20px; background: none; border: none; font-size: 14px; font-weight: 500;
  color: #888; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tab.active { color: #7B4FFF; border-bottom-color: #7B4FFF; }
.tab-count {
  background: #7B4FFF; color: #fff; border-radius: 10px; padding: 1px 7px;
  font-size: 11px; margin-left: 6px;
}
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.filter-select {
  height: 38px; padding: 0 10px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; background: #fff;
}
.btn { height: 38px; padding: 0 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-success { background: #22C97A; color: #fff; }
.btn-danger { background: #FF4D4D; color: #fff; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.table-card { background: #fff; border-radius: 8px; border: 1px solid #eee; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #888; border-bottom: 1px solid #eee; }
.data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.user-name { font-weight: 600; }
.user-sub { font-size: 11px; color: #999; margin-top: 2px; }
.mono { font-family: monospace; font-size: 13px; }
.small { font-size: 12px; color: #666; }
.bold { font-weight: 600; }
.note-cell { max-width: 200px; color: #666; font-size: 13px; }
.processed-label { font-size: 12px; color: #999; }
.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.badge-warning  { background: #fff3cd; color: #856404; }
.badge-success  { background: #d1fae5; color: #065f46; }
.badge-danger   { background: #fee2e2; color: #991b1b; }
.badge-secondary { background: #f0f0f0; color: #666; }
.badge-info     { background: #e0f2fe; color: #0369a1; }
.loading, .empty { padding: 40px; text-align: center; color: #999; font-size: 14px; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; padding: 24px; width: 420px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal h3 { margin: 0 0 16px; font-size: 18px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.form-input {
  width: 100%; height: 38px; padding: 0 12px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: #7B4FFF; }
.form-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;
  resize: vertical; font-family: inherit;
}
.form-textarea:focus { border-color: #7B4FFF; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.user-row { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.avatar-fallback {
  width: 36px; height: 36px; border-radius: 50%; background: #7B4FFF;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.screenshot-link { display: inline-block; }
.screenshot-thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #eee; }
.ticket-preview { background: #f8f8f8; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.preview-label { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; margin-top: 8px; }
.preview-label:first-child { margin-top: 0; }
.preview-value { font-size: 14px; color: #333; margin-top: 2px; }
</style>
