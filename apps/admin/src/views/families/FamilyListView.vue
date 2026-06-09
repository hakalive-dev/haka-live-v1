<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as familiesApi from '@/api/families'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// ── List state ────────────────────────────────────────────────────────────────
const families   = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search     = ref('')
const tierFilter = ref('')
const loading    = ref(true)

async function fetchFamilies() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page:  pagination.value.page,
      limit: pagination.value.limit,
    }
    if (search.value)     params.search = search.value
    if (tierFilter.value) params.tier   = tierFilter.value
    const result = await familiesApi.listFamilies(params)
    families.value  = result.families
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchFamilies() }

// ── Drawer ────────────────────────────────────────────────────────────────────
const drawerOpen    = ref(false)
const drawerFamily  = ref<any>(null)
const drawerLoading = ref(false)

async function openDrawer(family: any) {
  drawerOpen.value    = true
  drawerLoading.value = true
  drawerFamily.value  = null
  try {
    drawerFamily.value = await familiesApi.getFamilyDetail(family.id)
  } catch {}
  drawerLoading.value = false
}

// ── Remove member ──────────────────────────────────────────────────────────────
const removingMemberId = ref<string | null>(null)

async function removeMember(userId: string) {
  if (!drawerFamily.value) return
  removingMemberId.value = userId
  try {
    await familiesApi.removeFamilyMember(drawerFamily.value.id, userId)
    toast.success('Member Removed')
    drawerFamily.value = await familiesApi.getFamilyDetail(drawerFamily.value.id)
    await fetchFamilies()
  } catch (e: any) { toast.error('Remove Failed', e?.message) }
  removingMemberId.value = null
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteConfirm = ref(false)
const deleteTarget  = ref<any>(null)
const deleteLoading = ref(false)

function openDelete(family: any) {
  deleteTarget.value  = family
  deleteConfirm.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await familiesApi.deleteFamily(deleteTarget.value.id)
    toast.success('Family Deleted')
    deleteConfirm.value = false
    if (drawerFamily.value?.id === deleteTarget.value.id) {
      drawerOpen.value   = false
      drawerFamily.value = null
    }
    deleteTarget.value = null
    await fetchFamilies()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tierClass(tier: string) {
  if (tier === 'Gold')   return 'badge-gold'
  if (tier === 'Silver') return 'badge-silver'
  if (tier === 'Bronze') return 'badge-bronze'
  return 'badge-active'
}

function roleClass(role: string) {
  if (role === 'owner') return 'badge-admin'
  if (role === 'admin') return 'badge-suspended'
  return 'badge-active'
}

function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

onMounted(fetchFamilies)
watch(() => pagination.value.page, fetchFamilies)
</script>

<template>
  <div class="page">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="search"
          placeholder="Search family name or owner..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <select v-model="tierFilter" @change="handleSearch" class="filter-select">
          <option value="">All Tiers</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
          <option value="Bronze">Bronze</option>
        </select>
        <button class="btn-primary" @click="handleSearch">Search</button>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading families...</div>
      <div v-else-if="families.length === 0" class="loading">No families found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Family Name</th>
            <th>Owner</th>
            <th>Tier</th>
            <th>Members</th>
            <th>Total Beans</th>
            <th>Created</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="family in families" :key="family.id">
            <td>
              <div class="cell-name">{{ family.name }}</div>
              <div v-if="family.announcement" class="cell-sub">{{ family.announcement }}</div>
            </td>
            <td>
              <div class="cell-name">{{ family.owner?.displayName || family.owner?.username || '—' }}</div>
              <div class="cell-sub">{{ family.owner?.hakaId || '' }}</div>
            </td>
            <td>
              <span v-if="family.tier" class="badge" :class="tierClass(family.tier)">{{ family.tier }}</span>
              <span v-else class="cell-sub">—</span>
            </td>
            <td>{{ family.memberCount ?? family._count?.members ?? 0 }}</td>
            <td>{{ family.totalBeans?.toLocaleString() ?? '—' }} 🫘</td>
            <td>{{ formatDate(family.createdAt) }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openDrawer(family)">Manage</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openDelete(family)">Delete</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      v-if="pagination.totalPages > 1"
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="(p: number) => { pagination.page = p; fetchFamilies() }"
    />

    <!-- Detail Drawer -->
    <div v-if="drawerOpen" class="modal-overlay" @click.self="drawerOpen = false">
      <div class="agency-modal">
        <div class="modal-header">
          <h3>{{ drawerFamily?.name || 'Family Detail' }}</h3>
          <button class="modal-close" @click="drawerOpen = false">✕</button>
        </div>

        <div v-if="drawerLoading" class="loading">Loading...</div>
        <template v-else-if="drawerFamily">
          <div class="agency-body">
            <!-- Summary row -->
            <div class="detail-row">
              <span v-if="drawerFamily.tier" class="badge" :class="tierClass(drawerFamily.tier)">
                {{ drawerFamily.tier }}
              </span>
              <span v-else class="cell-sub">No tier</span>
              <div class="action-row">
                <button class="btn-sm btn-danger" @click="openDelete(drawerFamily)">Delete Family</button>
              </div>
            </div>

            <!-- Info grid -->
            <div class="info-grid">
              <div class="info-item">
                <label>Family Name</label>
                <span>{{ drawerFamily.name }}</span>
              </div>
              <div class="info-item">
                <label>Created</label>
                <span>{{ formatDate(drawerFamily.createdAt) }}</span>
              </div>
              <div class="info-item" v-if="drawerFamily.announcement">
                <label>Announcement</label>
                <span>{{ drawerFamily.announcement }}</span>
              </div>
              <div class="info-item" v-if="drawerFamily.badge">
                <label>Badge</label>
                <span>{{ drawerFamily.badge }}</span>
              </div>
            </div>

            <!-- Owner -->
            <div class="section-title">Owner</div>
            <div class="owner-card">
              <div class="owner-name">{{ drawerFamily.owner?.displayName || drawerFamily.owner?.username || '—' }}</div>
              <div class="owner-meta">
                <span>@{{ drawerFamily.owner?.username || '—' }}</span>
                <span>{{ drawerFamily.owner?.hakaId || '' }}</span>
              </div>
            </div>

            <!-- Members list -->
            <div class="section-title">
              Members ({{ drawerFamily.members?.length ?? 0 }})
            </div>
            <div v-if="!drawerFamily.members?.length" class="empty-text">No members.</div>
            <div v-else class="host-list">
              <div
                v-for="member in drawerFamily.members"
                :key="member.userId || member.id"
                class="host-row"
              >
                <span class="host-name">
                  {{ member.user?.displayName || member.user?.username || member.displayName || '—' }}
                </span>
                <span class="host-meta">{{ member.user?.hakaId || member.hakaId || '' }}</span>
                <span class="badge" :class="roleClass(member.role)">{{ member.role }}</span>
                <button
                  v-if="member.role !== 'owner'"
                  class="btn-sm btn-danger"
                  :disabled="removingMemberId === (member.userId || member.id)"
                  @click="removeMember(member.userId || member.id)"
                >
                  {{ removingMemberId === (member.userId || member.id) ? 'Removing...' : 'Remove' }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Delete Family</h3>
          <button class="modal-close" @click="deleteConfirm = false">✕</button>
        </div>
        <div class="modal-body">
          <p>Permanently delete <strong>{{ deleteTarget?.name }}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="deleteConfirm = false">Cancel</button>
          <button class="btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toolbar-left  { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; min-width: 200px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-primary); font-size: 13px; }
.filter-select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-primary); font-size: 13px; }
.stat-pill { background: var(--card-bg); border: 1px solid var(--card-border); padding: 6px 12px; border-radius: 20px; font-size: 12px; color: var(--text-muted); }

/* Table */
.table-card { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--card-border); overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--card-border); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--card-border); color: var(--text-primary); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.cell-name { font-weight: 600; }
.cell-sub  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }

/* Badges */
.badge          { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-active   { background: #22c97a22; color: #22c97a; }
.badge-suspended { background: #e8a02022; color: #e8a020; }
.badge-banned   { background: #ff4d4d22; color: #ff4d4d; }
.badge-admin    { background: #7b4fff22; color: #9d7fff; }
.badge-gold     { background: #f5c84222; color: #e8a020; }
.badge-silver   { background: #9090aa22; color: #9090aa; }
.badge-bronze   { background: #cd7f3222; color: #cd7f32; }

/* Buttons */
.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost   { padding: 8px 16px; background: none; color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-sm      { padding: 5px 10px; background: #F8FAFC; color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-danger  { background: #ff4d4d22; color: #ff4d4d; border-color: #ff4d4d40; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

/* Family Detail Modal */
.agency-modal { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 720px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.agency-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex: 1; }

/* Detail sections */
.detail-row  { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.action-row  { display: flex; gap: 6px; }
.info-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item   { display: flex; flex-direction: column; gap: 4px; }
.info-item label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }
.info-item span  { font-size: 13px; color: var(--text-primary); }
.section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding-top: 4px; }
.empty-text  { font-size: 13px; color: var(--text-muted); padding: 8px 0; }

/* Owner */
.owner-card  { background: #F8FAFC; border-radius: 10px; padding: 14px; }
.owner-name  { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.owner-meta  { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }

/* Members list */
.host-list  { display: flex; flex-direction: column; gap: 8px; }
.host-row   { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #F8FAFC; border-radius: 8px; }
.host-name  { font-size: 13px; font-weight: 600; flex: 1; }
.host-meta  { font-size: 12px; color: var(--text-muted); }

/* Modals */
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 580px; max-width: 95vw; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.modal-sm { width: 360px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.modal-close  { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; }
.modal-body   { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }
</style>
