<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as staffApi from '@/api/staff'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const admins = ref<any[]>([])
const loading = ref(true)
const selected = ref<any>(null)

async function fetchAdmins() {
  loading.value = true
  try {
    admins.value = await staffApi.listAdmins()
  } catch (e: any) {
    toast.error('Failed to load admins', e?.message || 'Request failed')
  }
  loading.value = false
}

function openDetails(admin: any) {
  selected.value = admin
}

function viewLogs(admin: any) {
  router.push({ path: '/audit-log', query: { adminId: admin.id } })
}

async function suspendAdmin(admin: any) {
  if (admin.id === auth.admin?.id) {
    toast.error('Action blocked', 'You cannot suspend your own account.')
    return
  }
  try {
    await staffApi.deactivateAdmin(admin.id)
    toast.warning('Admin Suspended', `${admin.displayName} has been disabled.`)
    await fetchAdmins()
  } catch (e: any) {
    toast.error('Suspend Failed', e?.message || 'Request failed')
  }
}

async function activateAdmin(admin: any) {
  try {
    await staffApi.reactivateAdmin(admin.id)
    toast.success('Admin Activated', `${admin.displayName} has been re-enabled.`)
    await fetchAdmins()
  } catch (e: any) {
    toast.error('Activate Failed', e?.message || 'Request failed')
  }
}

onMounted(fetchAdmins)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Admins</h2>
        <div class="page-sub">Staff accounts used to access the admin panel.</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-secondary" @click="fetchAdmins">Refresh</button>
      </div>
    </div>

    <div v-if="!auth.isSuperAdmin" class="notice">
      This page requires <strong>Super Admin</strong>. Your account can still access staff tooling you’re permitted to use.
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading admins...</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Region</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.id">
            <td class="fw">{{ admin.displayName }}</td>
            <td class="dim">{{ admin.email }}</td>
            <td>
              <span v-for="r in (admin.roles && admin.roles.length ? admin.roles : [admin.role])" :key="r" class="role-pill">{{ r }}</span>
            </td>
            <td class="dim">{{ admin.region ?? '—' }}</td>
            <td>
              <span :class="admin.isActive ? 'status-active' : 'status-inactive'">
                {{ admin.isActive ? 'Active' : 'Suspended' }}
              </span>
            </td>
            <td class="dim">{{ admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Never' }}</td>
            <td class="dim">{{ admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '—' }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openDetails(admin)">View</RowActionMenuItem>
                <RowActionMenuItem @click="viewLogs(admin)">View Logs</RowActionMenuItem>
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
              </RowActionMenu>
            </td>
          </tr>
          <tr v-if="admins.length === 0">
            <td colspan="8" class="empty">No admins found.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="selected" class="modal-overlay" @click.self="selected = null">
      <div class="modal-box">
        <div class="modal-header">
          <div>
            <h3>{{ selected.displayName || 'Admin' }}</h3>
            <div class="modal-sub">{{ selected.email }}</div>
          </div>
          <button class="btn-close" @click="selected = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-grid">
            <div class="dfield">
              <span class="dl">Role</span>
              <span class="dv">{{ selected.role }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Status</span>
              <span class="dv">{{ selected.isActive ? 'Active' : 'Suspended' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Region</span>
              <span class="dv">{{ selected.region ?? '—' }}</span>
            </div>
            <div class="dfield">
              <span class="dl">Haka ID</span>
              <span class="dv">{{ selected.hakaId ?? '—' }}</span>
            </div>
            <div class="dfield full">
              <span class="dl">Admin ID</span>
              <span class="dv mono dim">{{ selected.id }}</span>
            </div>
            <div class="dfield full">
              <span class="dl">Custom Permissions</span>
              <span class="dv">
                <span v-if="selected.customPermissions?.length > 0" class="mono">{{ selected.customPermissions.join(', ') }}</span>
                <span v-else class="dim">Role default</span>
              </span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="selected = null">Close</button>
          <button class="btn btn-primary" @click="viewLogs(selected)">View Logs</button>
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
.toolbar-actions { display: flex; gap: 8px; }

.notice { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; padding: 10px 12px; border-radius: 10px; font-size: 13px; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary  { background: var(--primary); color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }

.role-pill { background: var(--primary-soft); color: var(--primary); padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.status-active   { color: #22C97A; font-weight: 700; font-size: 12px; }
.status-inactive { color: #FF4D4D; font-weight: 700; font-size: 12px; }

.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; color: var(--text-primary); }
.btn-row.danger  { color: #FF4D4D; border-color: #FF4D4D; }
.btn-row.success { color: var(--success); border-color: var(--success); }
.btn-row:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-row:hover:not(:disabled) { background: var(--row-hover); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; overflow-y: auto; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(640px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 48px); }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.modal-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dfield { display: flex; flex-direction: column; gap: 4px; }
.dfield.full { grid-column: 1 / -1; }
.dl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.dv { font-size: 13px; color: var(--text-primary); word-break: break-word; }
</style>
