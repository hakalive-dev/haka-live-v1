<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as roomsApi from '@/api/rooms'
import StatusBadge from '@/components/common/StatusBadge.vue'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const toast = useToastStore()
const auth = useAuthStore()

// ── List state ────────────────────────────────────────────────────────────────
const rooms = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search = ref('')
const statusFilter = ref('')
const categoryFilter = ref('')
const sortField = ref('createdAt')
const sortOrder = ref<'asc' | 'desc'>('desc')
const loading = ref(true)

async function fetchRooms() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (search.value) params.search = search.value
    if (statusFilter.value) params.status = statusFilter.value
    if (categoryFilter.value) params.category = categoryFilter.value
    params.sort = sortField.value
    params.order = sortOrder.value
    const result = await roomsApi.listRooms(params)
    rooms.value = result.rooms
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchRooms() }

// ── Modal state ───────────────────────────────────────────────────────────────
const modalOpen = ref(false)
const modalRoom = ref<any>(null)
const modalLoading = ref(false)
const modalTab = ref<'info' | 'chat' | 'viewers' | 'bans'>('info')

// Chat
const chatMessages = ref<any[]>([])
const chatLoading = ref(false)
const chatPage = ref(1)
const chatTotal = ref(0)
const chatTotalPages = ref(0)

// Viewers
const viewers = ref<any[]>([])
const viewersLoading = ref(false)
const viewersPage = ref(1)
const viewersPagination = ref({ page: 1, limit: 30, total: 0, totalPages: 0 })
const kickLoadingUserId = ref('')

// Bans
const bans = ref<any[]>([])
const bansLoading = ref(false)
const bansPage = ref(1)
const bansPagination = ref({ page: 1, limit: 30, total: 0, totalPages: 0 })
const banForm = ref({ userId: '', reason: '', durationHours: '' })
const banSaving = ref(false)

async function openModal(roomId: string) {
  modalOpen.value = true
  modalLoading.value = true
  modalRoom.value = null
  modalTab.value = 'info'
  try {
    modalRoom.value = await roomsApi.getRoomDetail(roomId)
  } catch {}
  modalLoading.value = false
}

function closeModal() {
  modalOpen.value = false
  modalRoom.value = null
  chatMessages.value = []
  chatPage.value = 1
  viewers.value = []
  viewersPage.value = 1
  bans.value = []
  bansPage.value = 1
  editing.value = false
}

async function loadChat() {
  if (!modalRoom.value) return
  chatLoading.value = true
  try {
    const result = await roomsApi.getRoomMessages(modalRoom.value.id, { page: chatPage.value, limit: 30 })
    chatMessages.value = result.messages
    chatTotal.value = result.pagination.total
    chatTotalPages.value = result.pagination.totalPages
  } catch {}
  chatLoading.value = false
}

async function loadViewers() {
  if (!modalRoom.value) return
  viewersLoading.value = true
  try {
    const result = await roomsApi.getRoomViewers(modalRoom.value.id, { page: viewersPage.value, limit: 30 })
    viewers.value = result.viewers
    viewersPagination.value = result.pagination
  } catch {}
  viewersLoading.value = false
}

async function loadBans() {
  if (!modalRoom.value) return
  bansLoading.value = true
  try {
    const result = await roomsApi.getRoomBans(modalRoom.value.id, { page: bansPage.value, limit: 30 })
    bans.value = result.bans
    bansPagination.value = result.pagination
  } catch {}
  bansLoading.value = false
}

function switchTab(tab: 'info' | 'chat' | 'viewers' | 'bans') {
  modalTab.value = tab
  if (tab === 'chat' && chatMessages.value.length === 0) loadChat()
  if (tab === 'viewers' && viewers.value.length === 0) loadViewers()
  if (tab === 'bans' && bans.value.length === 0) loadBans()
}

async function handleChatPage(page: number) {
  chatPage.value = page
  await loadChat()
}

async function handleViewersPage(page: number) {
  viewersPage.value = page
  await loadViewers()
}

async function handleBansPage(page: number) {
  bansPage.value = page
  await loadBans()
}

async function forceEndCurrentRoom() {
  if (!modalRoom.value || !window.confirm(`Force-end "${modalRoom.value.title}"?`)) return
  try {
    await roomsApi.forceEndRoom(modalRoom.value.id)
    toast.success('Room Ended', 'The room has been force-ended.')
    modalRoom.value = await roomsApi.getRoomDetail(modalRoom.value.id)
    await fetchRooms()
  } catch (e: any) {
    toast.error('Force End Failed', e?.message)
  }
}

async function kickViewer(userId: string) {
  if (!modalRoom.value) return
  kickLoadingUserId.value = userId
  try {
    await roomsApi.kickUserFromRoom(modalRoom.value.id, userId, 'Kicked by admin')
    toast.success('Viewer Kicked')
    await Promise.all([loadViewers(), roomsApi.getRoomDetail(modalRoom.value.id).then(r => { modalRoom.value = r })])
  } catch (e: any) {
    toast.error('Kick Failed', e?.message)
  }
  kickLoadingUserId.value = ''
}

async function toggleSeatLock(seat: any) {
  if (!modalRoom.value) return
  try {
    await roomsApi.setSeatLock(modalRoom.value.id, seat.position, !seat.isLocked)
    modalRoom.value = await roomsApi.getRoomDetail(modalRoom.value.id)
    toast.success(seat.isLocked ? 'Seat Unlocked' : 'Seat Locked')
  } catch (e: any) { toast.error('Seat Update Failed', e?.message) }
}

async function toggleSeatMute(seat: any) {
  if (!modalRoom.value) return
  try {
    await roomsApi.setSeatMute(modalRoom.value.id, seat.position, !seat.isMuted)
    modalRoom.value = await roomsApi.getRoomDetail(modalRoom.value.id)
    toast.success(seat.isMuted ? 'Seat Unmuted' : 'Seat Muted')
  } catch (e: any) { toast.error('Seat Update Failed', e?.message) }
}

async function kickSeat(seat: any) {
  if (!modalRoom.value || !seat.user) return
  try {
    await roomsApi.kickFromSeat(modalRoom.value.id, seat.position)
    modalRoom.value = await roomsApi.getRoomDetail(modalRoom.value.id)
    toast.success('User Removed From Seat')
  } catch (e: any) { toast.error('Seat Kick Failed', e?.message) }
}

async function submitRoomBan() {
  if (!modalRoom.value || !banForm.value.userId) return
  banSaving.value = true
  try {
    await roomsApi.createRoomBan(modalRoom.value.id, {
      userId: banForm.value.userId,
      reason: banForm.value.reason || undefined,
      durationHours: banForm.value.durationHours ? Number(banForm.value.durationHours) : undefined,
    })
    toast.success('Room Ban Added')
    banForm.value = { userId: '', reason: '', durationHours: '' }
    await loadBans()
  } catch (e: any) { toast.error('Room Ban Failed', e?.message) }
  banSaving.value = false
}

async function removeRoomBan(banId: string) {
  if (!modalRoom.value) return
  try {
    await roomsApi.deleteRoomBan(modalRoom.value.id, banId)
    toast.info('Room Ban Removed')
    await loadBans()
  } catch (e: any) { toast.error('Remove Ban Failed', e?.message) }
}

// ── Edit room ────────────────────────────────────────────────────────────────
const editing = ref(false)
const editSaving = ref(false)
const editForm = ref({ title: '', description: '', coverImage: '', category: '' })

function openEdit() {
  if (!modalRoom.value) return
  editForm.value = {
    title: modalRoom.value.title ?? '',
    description: modalRoom.value.description ?? '',
    coverImage: modalRoom.value.coverImage ?? '',
    category: modalRoom.value.category ?? 'general',
  }
  editing.value = true
}

function cancelEdit() { editing.value = false }

async function saveEdit() {
  if (!modalRoom.value) return
  const payload: roomsApi.UpdateRoomPayload = {}
  const orig = modalRoom.value
  if (editForm.value.title.trim() && editForm.value.title !== orig.title) payload.title = editForm.value.title.trim()
  if (editForm.value.description !== (orig.description ?? '')) payload.description = editForm.value.description
  if (editForm.value.coverImage !== (orig.coverImage ?? '')) payload.coverImage = editForm.value.coverImage
  if (editForm.value.category && editForm.value.category !== orig.category) payload.category = editForm.value.category

  if (Object.keys(payload).length === 0) { editing.value = false; return }

  editSaving.value = true
  try {
    modalRoom.value = await roomsApi.updateRoom(orig.id, payload)
    toast.success('Room Updated', 'Changes saved successfully.')
    editing.value = false
    await fetchRooms()
  } catch (e: any) {
    toast.error('Update Failed', e?.message || 'Could not save changes.')
  }
  editSaving.value = false
}

const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
async function confirmDelete() {
  if (!modalRoom.value) return
  deleteLoading.value = true
  showDeleteConfirm.value = false
  try {
    await roomsApi.deleteRoom(modalRoom.value.id)
    toast.success('Room Deleted', 'Room and its history have been removed.')
    closeModal()
    await fetchRooms()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

onMounted(fetchRooms)
watch(() => pagination.value.page, fetchRooms)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-left">
        <input v-model="search" @keyup.enter="handleSearch" type="text" class="search-input"
          placeholder="Search rooms by title or host..." />
        <button class="btn btn-primary" @click="handleSearch">Search</button>
      </div>
      <select v-model="statusFilter" @change="handleSearch" class="filter-select">
        <option value="">All Status</option>
        <option value="live">Live</option>
        <option value="idle">Idle</option>
        <option value="ended">Ended</option>
      </select>
      <select v-model="categoryFilter" @change="handleSearch" class="filter-select">
        <option value="">All Categories</option>
        <option value="general">General</option>
        <option value="music">Music</option>
        <option value="talk">Talk</option>
        <option value="gaming">Gaming</option>
        <option value="dating">Dating</option>
        <option value="education">Education</option>
      </select>
      <select v-model="sortField" @change="handleSearch" class="filter-select">
        <option value="createdAt">Created</option>
        <option value="viewerCount">Viewers</option>
        <option value="title">Title</option>
      </select>
      <select v-model="sortOrder" @change="handleSearch" class="filter-select">
        <option value="desc">Desc</option>
        <option value="asc">Asc</option>
      </select>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading rooms...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Host</th>
            <th>Status</th>
            <th>Type</th>
            <th>MIC</th>
            <th>Viewers</th>
            <th>Created</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="room in rooms" :key="room.id" class="clickable-row" @click="openModal(room.id)">
            <td class="cell-primary">{{ room.title }}</td>
            <td>{{ room.host?.displayName || '—' }}</td>
            <td><StatusBadge :value="room.status" /></td>
            <td><StatusBadge :value="room.type" /></td>
            <td>{{ room.micConfig }}</td>
            <td>{{ room.viewerCount }}</td>
            <td class="cell-secondary">{{ new Date(room.createdAt).toLocaleDateString() }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openModal(room.id)">View</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total"
        @update:page="(p) => pagination.page = p" />
    </div>
  </div>

  <!-- ── Room detail modal ── -->
  <Teleport to="body">
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-box">

        <!-- Header -->
        <div class="modal-header">
          <div>
            <h3 class="modal-title">{{ modalRoom?.title || 'Room Detail' }}</h3>
            <div v-if="modalRoom" class="modal-sub">
              Host: <strong>{{ modalRoom.host?.displayName }}</strong>
              <span class="mono"> · {{ modalRoom.host?.hakaId }}</span>
            </div>
          </div>
          <div class="modal-header-right">
            <button
              v-if="modalRoom && auth.isSuperAdmin && !editing"
              class="btn btn-primary"
              @click="openEdit"
            >
              Edit
            </button>
            <button
              v-if="modalRoom && modalRoom.status !== 'ended' && auth.hasPermission('room.force_end') && !editing"
              class="btn btn-warning"
              @click="forceEndCurrentRoom"
            >
              Force End
            </button>
            <button
              v-if="modalRoom && modalRoom.status === 'ended' && auth.isSuperAdmin && !editing"
              class="btn btn-danger"
              :disabled="deleteLoading"
              @click="showDeleteConfirm = true"
            >
              Delete Room
            </button>
            <button class="btn-close" @click="closeModal">✕</button>
          </div>
        </div>

        <div v-if="modalLoading" class="modal-loading">Loading room...</div>

        <template v-else-if="modalRoom">
          <!-- Tabs -->
          <div class="modal-tabs">
            <button :class="['mtab', modalTab === 'info' ? 'mtab-active' : '']" @click="switchTab('info')">Info & Seats</button>
            <button :class="['mtab', modalTab === 'chat' ? 'mtab-active' : '']" @click="switchTab('chat')">
              Chat Log <span class="chat-count">({{ modalRoom._count?.messages || 0 }})</span>
            </button>
            <button :class="['mtab', modalTab === 'viewers' ? 'mtab-active' : '']" @click="switchTab('viewers')">Viewers</button>
            <button :class="['mtab', modalTab === 'bans' ? 'mtab-active' : '']" @click="switchTab('bans')">Bans</button>
          </div>

          <div class="modal-body">
            <!-- Info tab -->
            <template v-if="modalTab === 'info'">
              <!-- Edit form (super admin) -->
              <div v-if="editing" class="edit-form">
                <div class="cover-row">
                  <div class="cover-preview">
                    <img v-if="editForm.coverImage" :src="editForm.coverImage" alt="cover" />
                    <div v-else class="cover-placeholder">No image</div>
                  </div>
                  <div class="cover-input">
                    <label class="form-label">Cover Image URL</label>
                    <input v-model="editForm.coverImage" type="text" class="text-input" placeholder="https://..." />
                    <p class="form-hint">Paste a public image URL. Leave empty to remove.</p>
                  </div>
                </div>
                <div>
                  <label class="form-label">Title</label>
                  <input v-model="editForm.title" type="text" class="text-input" maxlength="100" placeholder="Room title" />
                </div>
                <div>
                  <label class="form-label">Category</label>
                  <select v-model="editForm.category" class="text-input">
                    <option value="general">General</option>
                    <option value="music">Music</option>
                    <option value="talk">Talk</option>
                    <option value="gaming">Gaming</option>
                    <option value="dating">Dating</option>
                    <option value="education">Education</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Description</label>
                  <textarea v-model="editForm.description" class="text-input" rows="3" maxlength="300" placeholder="Optional description" />
                </div>
                <div class="edit-actions">
                  <button class="btn btn-secondary" :disabled="editSaving" @click="cancelEdit">Cancel</button>
                  <button class="btn btn-primary" :disabled="editSaving" @click="saveEdit">
                    {{ editSaving ? 'Saving…' : 'Save Changes' }}
                  </button>
                </div>
              </div>

              <div v-else class="info-grid">
                <div class="field"><span class="fl">Status</span><StatusBadge :value="modalRoom.status" /></div>
                <div class="field"><span class="fl">Type</span><StatusBadge :value="modalRoom.type" /></div>
                <div class="field"><span class="fl">Category</span><span class="fv">{{ modalRoom.category || '—' }}</span></div>
                <div class="field"><span class="fl">MIC Config</span><span class="fv">{{ modalRoom.micConfig }}-mic</span></div>
                <div class="field"><span class="fl">Viewers</span><span class="fv">{{ modalRoom.viewerCount }}</span></div>
                <div class="field"><span class="fl">Messages</span><span class="fv">{{ modalRoom._count?.messages || 0 }}</span></div>
                <div class="field"><span class="fl">Started</span><span class="fv">{{ modalRoom.startedAt ? new Date(modalRoom.startedAt).toLocaleString() : '—' }}</span></div>
                <div class="field"><span class="fl">Created</span><span class="fv">{{ new Date(modalRoom.createdAt).toLocaleString() }}</span></div>
              </div>
              <div v-if="!editing" class="seats-section">
                <div class="section-label">Seats ({{ modalRoom.seats?.length || 0 }})</div>
                <div class="seats-grid">
                  <div v-for="seat in modalRoom.seats" :key="seat.id" class="seat"
                    :class="{ occupied: seat.user, 'seat-host': seat.position === 1 }">
                    <div class="seat-pos">#{{ seat.position }}</div>
                    <div v-if="seat.user" class="seat-user">{{ seat.user.displayName }}</div>
                    <div v-else class="seat-empty">Empty</div>
                    <div class="seat-flags">
                      <span v-if="seat.isLocked" title="Locked">🔒</span>
                      <span v-if="seat.isMuted" title="Muted">🔇</span>
                    </div>
                    <div v-if="seat.position !== 1 && auth.hasPermission('room.seat_manage')" class="seat-actions">
                      <button class="seat-action" @click="toggleSeatLock(seat)">{{ seat.isLocked ? 'Unlock' : 'Lock' }}</button>
                      <button class="seat-action" @click="toggleSeatMute(seat)">{{ seat.isMuted ? 'Unmute' : 'Mute' }}</button>
                      <button v-if="seat.user" class="seat-action danger" @click="kickSeat(seat)">Kick</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Chat tab -->
            <template v-if="modalTab === 'chat'">
              <div v-if="chatLoading" class="chat-loading">Loading messages...</div>
              <div v-else-if="chatMessages.length === 0" class="chat-empty">No messages in this room.</div>
              <div v-else class="chat-list">
                <div v-for="msg in chatMessages" :key="msg.id" class="chat-msg">
                  <div class="chat-meta">
                    <span class="chat-user fw">{{ msg.sender?.displayName || 'Unknown' }}</span>
                    <span class="chat-haka dim mono">{{ msg.sender?.hakaId }}</span>
                    <span class="chat-time dim">{{ new Date(msg.createdAt).toLocaleString() }}</span>
                  </div>
                  <div class="chat-text">{{ msg.content }}</div>
                </div>
                <div class="chat-stats dim">Showing {{ chatMessages.length }} of {{ chatTotal }} messages (most recent first)</div>
                <Pagination :page="chatPage" :total-pages="chatTotalPages" :total="chatTotal" @update:page="handleChatPage" />
              </div>
            </template>

            <!-- Viewers tab -->
            <template v-if="modalTab === 'viewers'">
              <div v-if="viewersLoading" class="chat-loading">Loading viewers...</div>
              <div v-else-if="viewers.length === 0" class="chat-empty">No viewers currently tracked.</div>
              <div v-else class="ops-list">
                <div v-for="viewer in viewers" :key="viewer.id" class="ops-row">
                  <div>
                    <div class="fw">{{ viewer.displayName || 'Unnamed' }}</div>
                    <div class="dim mono">{{ viewer.hakaId || viewer.id }}</div>
                  </div>
                  <button
                    v-if="auth.hasPermission('room.kick_user')"
                    class="btn btn-danger btn-sm"
                    :disabled="kickLoadingUserId === viewer.id"
                    @click="kickViewer(viewer.id)"
                  >
                    Kick
                  </button>
                </div>
                <Pagination :page="viewersPagination.page" :total-pages="viewersPagination.totalPages" :total="viewersPagination.total" @update:page="handleViewersPage" />
              </div>
            </template>

            <!-- Bans tab -->
            <template v-if="modalTab === 'bans'">
              <div v-if="auth.hasPermission('room.ban_manage')" class="ban-form">
                <input v-model="banForm.userId" class="text-input" placeholder="User UUID to ban from room" />
                <input v-model="banForm.reason" class="text-input" placeholder="Reason (optional)" />
                <input v-model="banForm.durationHours" class="text-input" type="number" min="1" placeholder="Hours (blank = permanent)" />
                <button class="btn btn-primary" :disabled="banSaving || !banForm.userId" @click="submitRoomBan">Add Ban</button>
              </div>
              <div v-if="bansLoading" class="chat-loading">Loading bans...</div>
              <div v-else-if="bans.length === 0" class="chat-empty">No active room bans.</div>
              <div v-else class="ops-list">
                <div v-for="ban in bans" :key="ban.id" class="ops-row">
                  <div>
                    <div class="fw">{{ ban.user?.displayName || ban.userId }}</div>
                    <div class="dim">{{ ban.reason }} · {{ ban.banType }}<span v-if="ban.expiresAt"> until {{ new Date(ban.expiresAt).toLocaleString() }}</span></div>
                  </div>
                  <button v-if="auth.hasPermission('room.ban_manage')" class="btn btn-secondary btn-sm" @click="removeRoomBan(ban.id)">Remove</button>
                </div>
                <Pagination :page="bansPagination.page" :total-pages="bansPagination.totalPages" :total="bansPagination.total" @update:page="handleBansPage" />
              </div>
            </template>
          </div>
        </template>

        <!-- Confirm delete bar -->
        <div v-if="showDeleteConfirm" class="confirm-bar confirm-bar-danger">
          <span>Permanently delete <strong>{{ modalRoom?.title }}</strong> and all its messages, seats, and bans? This cannot be undone.</span>
          <div class="confirm-btns">
            <button class="btn btn-secondary btn-sm" @click="showDeleteConfirm = false">Cancel</button>
            <button class="btn btn-danger btn-sm" :disabled="deleteLoading" @click="confirmDelete">
              Yes, Delete Permanently
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Page ───────────────────────────────────────────────────────────── */
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar-left { display: flex; gap: 8px; flex: 1; }
.search-input { flex: 1; min-width: 250px; height: 40px; padding: 0 14px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); outline: none; }
.search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.filter-select { height: 40px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); cursor: pointer; outline: none; }
.btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-danger { background: #FF4D4D; color: #fff; }
.btn-warning { background: #E8A020; color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Table ──────────────────────────────────────────────────────────── */
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--row-hover); }
.cell-primary { font-weight: 500; color: var(--text-primary); }
.cell-secondary { color: var(--text-muted); font-size: 12px; }
.btn-row-action { padding: 4px 12px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }

/* ── Modal ──────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box {
  background: var(--card-bg); border-radius: 16px;
  width: min(680px, 100%); max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,.25);
  overflow: hidden;
}

.modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
.modal-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.mono { font-family: monospace; }
.modal-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 16px; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }

.modal-loading { padding: 40px; text-align: center; color: var(--text-muted); }

.modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }

/* Info grid */
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.fl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.fv { font-size: 14px; color: var(--text-primary); }

/* Seats */
.seats-section { }
.section-label { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.seats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 10px; }
.seat { background: var(--content-bg); border-radius: 10px; padding: 10px; text-align: center; border: 2px solid transparent; }
.seat.occupied { border-color: var(--primary-soft); }
.seat.seat-host { border-color: var(--warning); }
.seat-pos { font-size: 10px; font-weight: 700; color: var(--text-muted); }
.seat-user { font-size: 12px; font-weight: 500; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-empty { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.seat-flags { font-size: 12px; margin-top: 4px; }
.seat-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; }
.seat-action { border: 1px solid var(--card-border); background: var(--card-bg); border-radius: 6px; padding: 3px 6px; font-size: 10px; cursor: pointer; }
.seat-action.danger { color: #FF4D4D; border-color: #FF4D4D; }

/* Confirm bar */
.confirm-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 24px; background: #fff3cd; border-top: 1px solid #f0d080;
  flex-shrink: 0; flex-wrap: wrap;
}
.confirm-bar span { font-size: 13px; color: #856404; }
.confirm-bar-danger { background: #fde2e2; border-top-color: #f5b6b6; }
.confirm-bar-danger span { color: #721c24; }
.confirm-btns { display: flex; gap: 8px; }

/* Tabs */
.modal-tabs { display: flex; border-bottom: 2px solid var(--card-border); flex-shrink: 0; padding: 0 24px; }
.mtab { padding: 10px 16px; background: none; border: none; font-size: 13px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.mtab-active { color: var(--primary); border-bottom-color: var(--primary); }
.mtab:hover { color: var(--primary); }
.chat-count { opacity: 0.7; }

/* Chat */
.chat-loading { padding: 30px; text-align: center; color: var(--text-muted); }
.chat-empty { padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px; }
.chat-list { display: flex; flex-direction: column; gap: 10px; }
.chat-msg { padding: 10px 12px; background: var(--content-bg); border-radius: 8px; }
.chat-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.chat-user { font-size: 13px; }
.chat-haka { font-size: 11px; }
.chat-time { font-size: 11px; margin-left: auto; }
.chat-text { font-size: 13px; color: var(--text-primary); word-break: break-word; }
.chat-stats { font-size: 12px; text-align: center; padding: 8px; }
.fw { font-weight: 500; color: var(--text-primary); }
.dim { color: var(--text-muted); }
.ops-list { display: flex; flex-direction: column; gap: 10px; }
.ops-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--content-bg); border-radius: 8px; }
.ban-form { display: grid; grid-template-columns: 1.2fr 1fr 0.8fr auto; gap: 8px; align-items: center; margin-bottom: 12px; }

/* Edit form */
.edit-form { display: flex; flex-direction: column; gap: 16px; }
.cover-row { display: flex; gap: 16px; align-items: flex-start; }
.cover-preview {
  width: 96px; height: 96px; border-radius: 12px; overflow: hidden;
  background: var(--content-bg); border: 1px solid var(--card-border);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cover-preview img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { font-size: 11px; color: var(--text-muted); text-align: center; padding: 0 8px; }
.cover-input { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.form-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }
.form-hint { font-size: 11px; color: var(--text-muted); margin: 4px 0 0; }
.text-input {
  width: 100%; padding: 10px 12px; border: 1px solid var(--card-border); border-radius: 8px;
  font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none;
  font-family: inherit; box-sizing: border-box;
}
.text-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.edit-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }
</style>
