<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAdminNotificationsStore } from '@/stores/adminNotifications'
import { useToastStore } from '@/stores/toast'
import * as notificationsApi from '@/api/notifications'
import type { AdminNotificationRow } from '@/api/notifications'
import { connectAdminSocket, onAdminRealtime } from '@/lib/adminSocket'

type AdminNotifPayload = { type?: string; title?: string; body?: string }

const auth = useAuthStore()
const notifStore = useAdminNotificationsStore()
const toast = useToastStore()
const router = useRouter()
const emit = defineEmits<{ toggleSidebar: [] }>()

const isPro = computed(() => ['super_admin', 'admin'].includes(auth.admin?.role || ''))

const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const notifOpen = ref(false)
const notifWrapRef = ref<HTMLElement | null>(null)
const previewItems = ref<AdminNotificationRow[]>([])
const previewLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubRealtime: (() => void) | null = null
let unsubNotifCreated: (() => void) | null = null

function onClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false
  }
  if (notifWrapRef.value && !notifWrapRef.value.contains(e.target as Node)) {
    notifOpen.value = false
  }
}

async function loadPreview() {
  previewLoading.value = true
  try {
    const r = await notificationsApi.listNotifications({ page: 1, limit: 10 })
    previewItems.value = r.items
  } catch {
    previewItems.value = []
  }
  previewLoading.value = false
}

function toggleNotif() {
  notifOpen.value = !notifOpen.value
  if (notifOpen.value) {
    loadPreview()
    notifStore.refreshUnread()
  }
}

async function openNotification(n: AdminNotificationRow) {
  try {
    if (!n.readAt) {
      await notificationsApi.markNotificationRead(n.id)
      await notifStore.refreshUnread()
    }
    notifOpen.value = false
    if (n.linkPath) router.push(n.linkPath)
  } catch {
    /* global handler */
  }
}

function onWindowFocus() {
  notifStore.refreshUnread()
}

function onRealtimeNotification() {
  notifStore.refreshUnread()
  if (notifOpen.value) loadPreview()
}

function onNotificationCreated(payload?: unknown) {
  const p = payload as AdminNotifPayload | undefined
  if (p?.type === 'support_ticket_created') {
    toast.success(p.title ?? 'New support ticket', p.body ?? '')
  }
  onRealtimeNotification()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  notifStore.refreshUnread()
  connectAdminSocket()
  unsubRealtime = onAdminRealtime('notifications', onRealtimeNotification)
  unsubNotifCreated = onAdminRealtime('notification:created', onNotificationCreated)
  // Fallback if socket disconnects
  pollTimer = window.setInterval(() => notifStore.refreshUnread(), 120_000)
  window.addEventListener('focus', onWindowFocus)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  if (pollTimer) clearInterval(pollTimer)
  unsubRealtime?.()
  unsubNotifCreated?.()
  window.removeEventListener('focus', onWindowFocus)
})

async function handleLogout() {
  dropdownOpen.value = false
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="topbar">
    <!-- Single hamburger — toggles the sidebar -->
    <button class="hamburger" @click="emit('toggleSidebar')" aria-label="Toggle sidebar">
      <span /><span /><span />
    </button>

    <div class="topbar-actions">
      <!-- Notifications bell -->
      <div ref="notifWrapRef" class="notif-wrap">
        <button type="button" class="notif-btn" aria-label="Notifications" @click="toggleNotif">
          <span class="notif-icon" aria-hidden="true">🔔</span>
          <span v-if="notifStore.unreadCount > 0" class="notif-badge">{{
            notifStore.unreadCount > 99 ? '99+' : notifStore.unreadCount
          }}</span>
        </button>
        <div v-if="notifOpen" class="notif-dropdown">
          <div class="notif-head">
            <span class="notif-head-title">Notifications</span>
            <router-link to="/notifications" class="notif-all" @click="notifOpen = false">View all</router-link>
          </div>
          <div v-if="previewLoading" class="notif-loading">Loading…</div>
          <div v-else-if="previewItems.length === 0" class="notif-empty">No notifications yet.</div>
          <ul v-else class="notif-list">
            <li
              v-for="n in previewItems"
              :key="n.id"
              class="notif-item"
              :class="{ unread: !n.readAt }"
              @click="openNotification(n)"
            >
              <div class="notif-item-title">{{ n.title }}</div>
              <div class="notif-item-body">{{ n.body }}</div>
              <div class="notif-item-time">{{ new Date(n.createdAt).toLocaleString() }}</div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Avatar dropdown -->
      <div class="topbar-right">
      <div class="user-profile" ref="dropdownRef" @click="dropdownOpen = !dropdownOpen">
        <div class="user-avatar">
          <img v-if="auth.admin?.avatarUrl" :src="auth.admin.avatarUrl" alt="avatar" class="user-avatar-img" />
          <span v-else>{{ auth.admin?.displayName?.charAt(0) || 'A' }}</span>
        </div>
        <span class="user-name">{{ auth.admin?.displayName || 'Admin' }}</span>
        <svg class="dropdown-arrow" :class="{ flipped: dropdownOpen }" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 7L1 3h8L5 7z"/>
        </svg>
        <span v-if="isPro" class="pro-badge">PRO</span>

        <!-- Dropdown menu -->
        <div v-if="dropdownOpen" class="user-dropdown" @click.stop>
          <div class="dropdown-user-info">
            <div class="dropdown-avatar">
              <img v-if="auth.admin?.avatarUrl" :src="auth.admin.avatarUrl" alt="avatar" class="user-avatar-img" />
              <span v-else>{{ auth.admin?.displayName?.charAt(0) || 'A' }}</span>
            </div>
            <div>
              <div class="dropdown-name">{{ auth.admin?.displayName || 'Admin' }}</div>
              <div class="dropdown-email">{{ auth.admin?.email || '' }}</div>
            </div>
          </div>
          <div class="dropdown-divider" />
          <button class="dropdown-item dropdown-item-danger" @click="handleLogout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  background: var(--card-bg);
  border-bottom: 1px solid var(--card-border);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 50;
}

.hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  flex-shrink: 0;
  transition: background 0.12s;
}
.hamburger:hover { background: var(--content-bg); }
.hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--text-primary);
  border-radius: 2px;
}

.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-right {
  display: flex;
  align-items: center;
}

/* ── Notifications bell ─────────────────────────────────────────────── */
.notif-wrap {
  position: relative;
}

.notif-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.notif-btn:hover { background: var(--content-bg); }

.notif-icon { font-size: 18px; line-height: 1; }

.notif-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #FF4D4D;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.notif-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(380px, calc(100vw - 24px));
  max-height: min(420px, 70vh);
  overflow: auto;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  z-index: 210;
}

.notif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--card-border);
  position: sticky;
  top: 0;
  background: var(--card-bg);
}

.notif-head-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }

.notif-all {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}
.notif-all:hover { text-decoration: underline; }

.notif-loading,
.notif-empty {
  padding: 24px 14px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.notif-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notif-item {
  padding: 12px 14px;
  border-bottom: 1px solid var(--card-border);
  cursor: pointer;
  transition: background 0.1s;
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: var(--content-bg); }
.notif-item.unread { background: rgba(91, 47, 212, 0.06); }

.notif-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.notif-item-body {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-item-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}


/* ── User profile + dropdown ────────────────────────────────────────── */
.user-profile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 8px;
  transition: background 0.12s;
  user-select: none;
}
.user-profile:hover { background: var(--content-bg); }

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}
.user-avatar-img { width: 100%; height: 100%; object-fit: cover; }

.user-name { font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }

.dropdown-arrow {
  color: var(--text-muted);
  transition: transform 0.2s;
}
.dropdown-arrow.flipped { transform: rotate(180deg); }

.pro-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #5B21B6;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

/* ── Dropdown panel ─────────────────────────────────────────────────── */
.user-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.12);
  z-index: 200;
  overflow: hidden;
}

.dropdown-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 12px;
}

.dropdown-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.dropdown-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.dropdown-email { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

.dropdown-divider { height: 1px; background: var(--card-border); margin: 0; }

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.12s;
}
.dropdown-item:hover { background: var(--content-bg); }
.dropdown-item-danger { color: #FF4D4D; }
.dropdown-item-danger:hover { background: rgba(255,77,77,0.06); }
</style>
