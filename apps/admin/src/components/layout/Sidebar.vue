<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

import iconUrl from '@/assets/icon.png'
import navGaugeUrl from '@/assets/nav-gauge.png'

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits<{ close: [] }>()

function closeIfMobile() {
  if (window.innerWidth <= 768) emit('close')
}

interface NavItem {
  label: string
  to: string
  permission?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const allSections: NavSection[] = [
  {
    title: 'Welcome Home',
    items: [
      { label: 'Dashboard', to: '/dashboard', permission: 'dashboard.view' },
      { label: 'Notifications', to: '/notifications', permission: 'dashboard.view' },
      { label: 'Team announcements', to: '/team-announcements', permission: 'dashboard.view' },
    ],
  },
  {
    title: 'User Center',
    items: [
      { label: 'Manage Users', to: '/users',             permission: 'user.view' },
      { label: 'Face Verifications', to: '/face-verifications', permission: 'user.view' },
      { label: 'Host Applications', to: '/host-applications', permission: 'host_app.view' },
    ],
  },
  {
    title: 'Roome Center',
    items: [
      { label: 'Manage Rooms', to: '/rooms', permission: 'room.view' },
    ],
  },
  {
    title: 'Anchor Center',
    items: [
      { label: 'Level Tasks', to: '/level-tasks',      permission: 'agency.view' },
      { label: 'Host Applications', to: '/host-applications', permission: 'host_app.view' },
    ],
  },
  {
    title: 'Config Center',
    items: [
      { label: 'System Settings', to: '/settings',   permission: 'settings.view' },
      { label: 'Lucky Gift Settings', to: '/gifts/lucky-gifts', permission: 'gift.manage' },
      { label: 'Currency Rates', to: '/currencies', permission: 'payment.view' },
    ],
  },
  {
    title: 'Check Center',
    items: [
      { label: 'Reports & Bans', to: '/moderation',     permission: 'report.view' },
      { label: 'Support Tickets', to: '/support-tickets', permission: 'report.view' },
      { label: 'Risk Control', to: '/risk-control',    permission: 'risk.view' },
    ],
  },
  {
    title: 'Seller Center',
    items: [
      { label: 'Seller Payment Setup', to: '/seller-recharge-settings', permission: 'payment.view' },
      { label: 'Seller Recharges', to: '/seller-recharges', permission: 'payment.view' },
      { label: 'Seller Exchanges', to: '/seller-exchanges', permission: 'payment.view' },
      { label: 'Seller Coins', to: '/seller-coins',     permission: 'payment.view' },
      { label: 'User Wallets', to: '/wallets',          permission: 'payment.view' },
      { label: 'Wallet History', to: '/transactions',     permission: 'payment.view' },
      { label: 'Recharge Records', to: '/purchases',         permission: 'payment.view' },
      { label: 'Withdrawal Requests', to: '/withdrawals',      permission: 'payment.view' },
      { label: 'Payroll Agents', to: '/payroll-agents', permission: 'payment.view' },
      { label: 'Payroll', to: '/payroll',          permission: 'payment.view' },
    ],
  },
  {
    title: 'BD Center',
    items: [
      { label: 'BD Management',       to: '/bd',                        permission: 'bd.view' },
      { label: 'Admin Management',    to: '/admin-management',          permission: 'admin.view' },
      { label: 'Agency Management',   to: '/agencies',                  permission: 'agency.view' },
      { label: 'Agent Applications',  to: '/agent-applications',        permission: 'agency.view' },
      { label: 'Become Agency Admins',  to: '/designated-become-agency-admins', permission: 'agency.view' },
      { label: 'Host Change Requests',to: '/host-change-requests',      permission: 'agency.view' },
      { label: 'Agency Invitations',  to: '/agency-invitations',        permission: 'agency.view' },
      { label: 'Learn Promotions',    to: '/agency-learn-promotions',   permission: 'agency.view' },
      { label: 'Hosts',               to: '/hosts',                     permission: 'host.view' },
      { label: 'Master Wallet',       to: '/master-wallet',             permission: 'payment.view' },
      { label: 'Bean Revenue',        to: '/gifts/platform-revenue',    permission: 'gift.manage' },
      { label: 'Commission Config',   to: '/gifts/commission-config',   permission: 'gift.manage' },
      { label: 'State Ranking',       to: '/gifts/state-ranking',       permission: 'gift.manage' },
      { label: 'Lucky Gift Settings', to: '/gifts/lucky-gifts',         permission: 'gift.manage' },
      { label: 'Regions',             to: '/regions',                   permission: 'region.manage' },
    ],
  },
  {
    title: 'CS Center',
    items: [
      { label: 'CS Management',   to: '/cs-management',   permission: 'admin.view' },
      { label: 'Support Tickets', to: '/support-tickets', permission: 'report.view' },
    ],
  },
  {
    title: 'BDM Center',
    items: [
      { label: 'Analytics & Reports', to: '/analytics',         permission: 'analytics.view' },
      { label: 'Gift Send History', to: '/gifts/transactions', permission: 'gift.view' },
    ],
  },
  {
    title: 'Family Center',
    items: [
      { label: 'Family Management', to: '/families', permission: 'agency.view' },
    ],
  },
  {
    title: 'ID Level Center',
    items: [
      { label: 'Special IDs', to: '/special-ids', permission: 'specialId.manage' },
      { label: 'Game Management', to: '/games',      permission: 'game.view' },
    ],
  },
  {
    title: 'Multi System Center',
    items: [
      { label: 'Admins', to: '/admins',     permission: 'admin.view' },
      { label: 'Staff Management', to: '/staff',     permission: 'admin.view' },
      { label: 'Custom Roles', to: '/roles',     permission: 'admin.custom_roles' },
      { label: 'Audit Log', to: '/audit-log', permission: 'audit.view' },
    ],
  },
  {
    title: 'Center',
    items: [
      { label: 'Gift Catalogue', to: '/gifts',   permission: 'gift.view' },
      { label: 'Lucky Gift Settings', to: '/gifts/lucky-gifts', permission: 'gift.manage' },
      { label: 'Store Items', to: '/store',   permission: 'store.manage' },
      { label: 'Events', to: '/events',  permission: 'event.view' },
      { label: 'Banners', to: '/banners', permission: 'banner.view' },
    ],
  },
]

const sections = computed<NavSection[]>(() =>
  allSections
    .map(s => ({ ...s, items: s.items.filter(i => !i.permission || auth.hasPermission(i.permission)) }))
    .filter(s => s.items.length > 0)
)

const DEFAULT_OPEN_SECTIONS = ['Config Center', 'Center', 'BD Center']
const openSections = ref<string[]>([...DEFAULT_OPEN_SECTIONS])

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/')
}

function ensureActiveOpen() {
  for (const s of sections.value) {
    if (s.items.some(i => isActive(i.to)) && !openSections.value.includes(s.title)) {
      openSections.value.push(s.title)
    }
  }
}

function toggleSection(title: string) {
  const idx = openSections.value.indexOf(title)
  if (idx >= 0) openSections.value.splice(idx, 1)
  else openSections.value.push(title)
}

function isSectionOpen(title: string): boolean {
  return openSections.value.includes(title)
}

onMounted(ensureActiveOpen)
watch(() => route.path, ensureActiveOpen)
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar-open': props.open }">
    <!-- Brand — no close button here, hamburger lives in topbar only -->
    <div class="sidebar-brand">
      <img :src="iconUrl" alt="Haka Live" class="brand-icon" />
      <div class="brand-title">HAKA-LIVE</div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <div v-for="section in sections" :key="section.title" class="nav-section">

        <!-- Single-item: direct link -->
        <template v-if="section.items.length === 1">
          <router-link
            :to="section.items[0].to"
            class="nav-section-header nav-direct"
            :class="{ 'section-active': isActive(section.items[0].to) }"
            @click="closeIfMobile()"
          >
            <span class="nav-icon-slot nav-icon-slot--section" aria-hidden="true">
              <img :src="navGaugeUrl" alt="" class="nav-icon-slot-img" />
            </span>
            <span class="nav-section-title">{{ section.title }}</span>
          </router-link>
        </template>

        <!-- Multi-item: accordion -->
        <template v-else>
          <button
            class="nav-section-header"
            :class="{ 'section-has-active': section.items.some(i => isActive(i.to)) }"
            @click="toggleSection(section.title)"
          >
            <span class="nav-icon-slot nav-icon-slot--section" aria-hidden="true">
              <img :src="navGaugeUrl" alt="" class="nav-icon-slot-img" />
            </span>
            <span class="nav-section-title">{{ section.title }}</span>
            <span class="nav-chevron" :class="{ open: isSectionOpen(section.title) }">›</span>
          </button>
          <div v-show="isSectionOpen(section.title)" class="nav-section-items">
            <router-link
              v-for="item in section.items"
              :key="item.to"
              :to="item.to"
              class="nav-item"
              :class="{ active: isActive(item.to) }"
              @click="closeIfMobile()"
            >
              <span class="nav-icon-slot nav-icon-slot--item" aria-hidden="true">
                <img :src="navGaugeUrl" alt="" class="nav-icon-slot-img" />
              </span>
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </template>

      </div>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 244px;
  min-height: 100vh;
  background: #1a1d35;
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
  overflow-y: auto;
  transform: translateX(-244px);
  transition: transform 0.25s ease;
}
.sidebar.sidebar-open {
  transform: translateX(0);
}
@media (max-width: 768px) {
  .sidebar.sidebar-open { box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
}

/* ── Brand ─────────────────────────────────────────────────────────── */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.brand-icon { width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; object-fit: contain; }
.brand-title { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: 0.3px; }

/* ── Nav ────────────────────────────────────────────────────────────── */
.sidebar-nav { flex: 1; padding: 6px 0 16px; overflow-y: auto; }
.nav-section { margin-bottom: 1px; }

.nav-section-header {
  width: calc(100% - 12px);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255,255,255,0.65);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
  margin: 1px 6px;
  border-radius: 6px;
  box-sizing: border-box;
}
.nav-section-header:hover { background: rgba(255,255,255,0.07); color: #fff; }
.nav-section-header.section-has-active { color: #fff; }
.nav-section-header.section-active,
.nav-direct.router-link-active {
  background: var(--primary) !important;
  color: #fff !important;
}

/* Crop + zoom so the gauge fills the slot (PNG has generous padding). */
.nav-icon-slot {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
.nav-icon-slot--section {
  width: 48px;
  height: 48px;
}
.nav-icon-slot--item {
  width: 42px;
  height: 42px;
}
.nav-icon-slot-img {
  width: 182%;
  height: 182%;
  max-width: none;
  object-fit: cover;
  object-position: 50% 50%;
  display: block;
  mix-blend-mode: lighten;
  filter: contrast(1.2) brightness(1.08);
}
.nav-section-title { flex: 1; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.nav-chevron {
  font-size: 16px;
  color: rgba(255,255,255,0.35);
  line-height: 1;
  transition: transform 0.2s;
  display: inline-block;
  transform: rotate(0deg);
  flex-shrink: 0;
}
.nav-chevron.open { transform: rotate(90deg); }

/* ── Sub-items ─────────────────────────────────────────────────────── */
.nav-section-items { padding-bottom: 3px; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 60px;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
  margin: 0 6px;
  border-radius: 5px;
}
.nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
.nav-item.active { background: var(--primary); color: #fff; }
</style>
