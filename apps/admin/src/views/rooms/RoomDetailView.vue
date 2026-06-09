<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as roomsApi from '@/api/rooms'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const auth = useAuthStore()
const room = ref<any>(null)
const loading = ref(true)
const showDelete = ref(false)
const actionLoading = ref(false)

async function fetchRoom() {
  loading.value = true
  try { room.value = await roomsApi.getRoomDetail(route.params.id as string) }
  catch { router.push('/rooms') }
  loading.value = false
}

async function handleDelete() {
  showDelete.value = false
  actionLoading.value = true
  try {
    await roomsApi.deleteRoom(room.value.id)
    toast.success('Room Deleted', 'Room and its history have been removed.')
    router.push('/rooms')
  } catch (e: any) {
    toast.error('Delete Failed', e?.message)
  }
  actionLoading.value = false
}

onMounted(fetchRoom)
</script>

<template>
  <div v-if="loading" class="loading">Loading room...</div>
  <div v-else-if="room" class="room-detail">
    <div class="detail-header">
      <button class="back-btn" @click="router.push('/rooms')">&larr; Back to Rooms</button>
      <div class="header-actions">
        <button
          v-if="room.status === 'ended' && auth.isSuperAdmin"
          class="btn-danger"
          :disabled="actionLoading"
          @click="showDelete = true"
        >Delete Room</button>
      </div>
    </div>

    <div class="info-card">
      <div class="info-grid">
        <div class="field"><span class="field-label">Title</span><span class="field-value">{{ room.title }}</span></div>
        <div class="field"><span class="field-label">Host</span><span class="field-value">{{ room.host?.displayName }}</span></div>
        <div class="field"><span class="field-label">Status</span><StatusBadge :value="room.status" /></div>
        <div class="field"><span class="field-label">Type</span><StatusBadge :value="room.type" /></div>
        <div class="field"><span class="field-label">Category</span><span class="field-value">{{ room.category }}</span></div>
        <div class="field"><span class="field-label">MIC Config</span><span class="field-value">{{ room.micConfig }}-mic</span></div>
        <div class="field"><span class="field-label">Viewers</span><span class="field-value">{{ room.viewerCount }}</span></div>
        <div class="field"><span class="field-label">Messages</span><span class="field-value">{{ room._count?.messages || 0 }}</span></div>
        <div class="field"><span class="field-label">Started</span><span class="field-value">{{ room.startedAt ? new Date(room.startedAt).toLocaleString() : '—' }}</span></div>
        <div class="field"><span class="field-label">Created</span><span class="field-value">{{ new Date(room.createdAt).toLocaleString() }}</span></div>
      </div>
    </div>

    <div class="info-card">
      <h3 class="section-title">Seats ({{ room.seats?.length || 0 }})</h3>
      <div class="seats-grid">
        <div v-for="seat in room.seats" :key="seat.id" class="seat" :class="{ occupied: seat.user, host: seat.position === 1 }">
          <div class="seat-pos">{{ seat.position }}</div>
          <div v-if="seat.user" class="seat-user">{{ seat.user.displayName }}</div>
          <div v-else class="seat-empty">Empty</div>
          <div v-if="seat.isLocked" class="seat-locked">🔒</div>
          <div v-if="seat.isMuted" class="seat-muted">🔇</div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :show="showDelete"
    title="Delete Room Permanently"
    :message="`Delete '${room?.title}' and all its messages, seats, and bans? This cannot be undone.`"
    confirm-text="Delete Permanently"
    confirm-color="var(--danger)"
    @confirm="handleDelete"
    @cancel="showDelete = false"
  />
</template>

<style scoped>
.loading { padding: 60px; text-align: center; color: var(--text-muted); }
.room-detail { display: flex; flex-direction: column; gap: 16px; }
.detail-header { display: flex; align-items: center; justify-content: space-between; }
.back-btn { background: none; border: none; color: var(--primary); font-size: 14px; font-weight: 600; cursor: pointer; }
.header-actions { display: flex; gap: 8px; }
.btn-danger { padding: 8px 16px; background: var(--danger); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.info-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 24px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
.field-value { font-size: 14px; color: var(--text-primary); }
.section-title { font-size: 15px; font-weight: 600; margin: 0 0 16px; }
.seats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; }
.seat { background: var(--content-bg); border-radius: 12px; padding: 12px; text-align: center; border: 2px solid transparent; }
.seat.occupied { border-color: var(--primary-soft); }
.seat.host { border-color: var(--warning); }
.seat-pos { font-size: 11px; color: var(--text-muted); font-weight: 700; }
.seat-user { font-size: 13px; font-weight: 500; margin-top: 4px; }
.seat-empty { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.seat-locked, .seat-muted { font-size: 12px; margin-top: 4px; }
</style>
