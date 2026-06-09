<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as gamesApi from '@/api/games'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

// ── List state ────────────────────────────────────────────────────────────────
const games      = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search     = ref('')
const activeFilter = ref('')
const sortField  = ref('createdAt')
const sortOrder  = ref('desc')
const loading    = ref(true)

async function fetchGames() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      sort: sortField.value,
      order: sortOrder.value,
    }
    if (search.value)       params.search   = search.value
    if (activeFilter.value) params.isActive = activeFilter.value
    const result = await gamesApi.listGames(params)
    games.value      = result.games
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchGames() }

// ── Drawer ────────────────────────────────────────────────────────────────────
const drawerOpen    = ref(false)
const drawerGame    = ref<any>(null)
const drawerLoading = ref(false)

async function openDrawer(game: any) {
  drawerOpen.value    = true
  drawerLoading.value = true
  drawerGame.value    = null
  try {
    drawerGame.value = await gamesApi.getGameDetail(game.id)
  } catch {}
  drawerLoading.value = false
}

// ── Create modal ───────────────────────────────────────────────────────────────
const createModal   = ref(false)
const createForm    = ref({ name: '', description: '', imageUrl: '', apiEndpoint: '', apiKey: '', rtpPercent: 95 })
const createLoading = ref(false)
const createError   = ref('')

function openCreate() {
  createForm.value  = { name: '', description: '', imageUrl: '', apiEndpoint: '', apiKey: '', rtpPercent: 95 }
  createError.value = ''
  createModal.value = true
}

async function submitCreate() {
  createError.value  = ''
  createLoading.value = true
  try {
    await gamesApi.createGame(createForm.value)
    createModal.value = false
    await fetchGames()
  } catch (e: any) { createError.value = e?.message || 'Failed to create game' }
  createLoading.value = false
}

// ── Edit modal ────────────────────────────────────────────────────────────────
const editModal   = ref(false)
const editForm    = ref({ name: '', description: '', imageUrl: '', apiEndpoint: '', apiKey: '', rtpPercent: 95 })
const editLoading = ref(false)
const editError   = ref('')

function openEdit(game: any) {
  editForm.value = {
    name:        game.name,
    description: game.description || '',
    imageUrl:    game.imageUrl || '',
    apiEndpoint: game.apiEndpoint || '',
    apiKey:      game.apiKey || '',
    rtpPercent:  Number(game.rtpPercent),
  }
  editError.value = ''
  editModal.value  = true
}

async function submitEdit() {
  if (!drawerGame.value) return
  editError.value  = ''
  editLoading.value = true
  try {
    drawerGame.value = await gamesApi.updateGame(drawerGame.value.id, editForm.value)
    editModal.value  = false
    await fetchGames()
  } catch (e: any) { editError.value = e?.message || 'Failed' }
  editLoading.value = false
}

// ── Toggle status ─────────────────────────────────────────────────────────────
const toggleLoading = ref(false)

async function toggleStatus(game: any) {
  toggleLoading.value = true
  try {
    const updated = await gamesApi.toggleGameStatus(game.id, !game.isActive)
    toast.info(game.isActive ? 'Game Deactivated' : 'Game Activated')
    if (drawerGame.value?.id === game.id) drawerGame.value = updated
    const idx = games.value.findIndex(g => g.id === game.id)
    if (idx !== -1) games.value[idx] = updated
  } catch (e: any) { toast.error('Toggle Failed', e?.message) }
  toggleLoading.value = false
}

// ── Ping API ──────────────────────────────────────────────────────────────────
const pingLoading = ref(false)
const pingResult  = ref<any>(null)

async function pingApi(game: any) {
  pingLoading.value = true
  pingResult.value  = null
  try {
    pingResult.value = await gamesApi.pingGameApi(game.id)
    toast.success('Ping Successful')
    if (drawerGame.value?.id === game.id) {
      drawerGame.value.lastPingAt = pingResult.value.lastPingAt
      drawerGame.value.lastPingOk = pingResult.value.pingOk
    }
  } catch (e: any) { toast.error('Ping Failed', e?.message) }
  pingLoading.value = false
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteConfirm = ref(false)
const deleteLoading = ref(false)

async function confirmDelete() {
  if (!drawerGame.value) return
  deleteLoading.value = true
  try {
    await gamesApi.deleteGame(drawerGame.value.id)
    toast.success('Game Deleted')
    deleteConfirm.value = false
    drawerOpen.value    = false
    await fetchGames()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

function formatDateTime(d: string) {
  return d ? new Date(d).toLocaleString() : '—'
}

onMounted(fetchGames)
watch(() => pagination.value.page, fetchGames)
</script>

<template>
  <div class="page">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="search"
          placeholder="Search games..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <select v-model="activeFilter" @change="handleSearch" class="filter-select">
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select v-model="sortField" @change="handleSearch" class="filter-select">
          <option value="createdAt">Sort: Created</option>
          <option value="name">Sort: Name</option>
          <option value="totalRevenue">Sort: Revenue</option>
          <option value="totalBets">Sort: Total Bets</option>
        </select>
        <button class="btn-primary" @click="handleSearch">Search</button>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <button class="btn-primary" @click="openCreate">+ Add Game</button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading games...</div>
      <div v-else-if="games.length === 0" class="loading">No games found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Game</th>
            <th>RTP %</th>
            <th>Total Revenue</th>
            <th>Total Bets</th>
            <th>API</th>
            <th>Last Ping</th>
            <th>Status</th>
            <th>Added</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="game in games" :key="game.id">
            <td>
              <div class="cell-name">{{ game.name }}</div>
              <div class="cell-sub">{{ game.description || '—' }}</div>
            </td>
            <td>
              <span class="rtp-badge">{{ Number(game.rtpPercent).toFixed(2) }}%</span>
            </td>
            <td>{{ Number(game.totalRevenue).toLocaleString() }}</td>
            <td>{{ game.totalBets.toLocaleString() }}</td>
            <td>
              <span v-if="game.apiEndpoint" class="api-status" :class="game.lastPingOk ? 'api-ok' : 'api-warn'">
                {{ game.lastPingOk ? '✓ OK' : game.lastPingAt ? '✗ Error' : '— Not pinged' }}
              </span>
              <span v-else class="api-status api-none">No API</span>
            </td>
            <td>{{ formatDateTime(game.lastPingAt) }}</td>
            <td>
              <span class="badge" :class="game.isActive ? 'badge-active' : 'badge-inactive'">
                {{ game.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>{{ formatDate(game.createdAt) }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openDrawer(game)">View</RowActionMenuItem>
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
      @update:page="(p: number) => { pagination.page = p; fetchGames() }"
    />

    <!-- Detail Drawer -->
    <div v-if="drawerOpen" class="drawer-overlay" @click.self="drawerOpen = false">
      <div class="drawer">
        <div class="drawer-header">
          <h2>{{ drawerGame?.name || 'Game Detail' }}</h2>
          <button class="drawer-close" @click="drawerOpen = false">✕</button>
        </div>

        <div v-if="drawerLoading" class="loading">Loading...</div>
        <template v-else-if="drawerGame">
          <div class="drawer-body">
            <!-- Status + Actions -->
            <div class="detail-row">
              <span class="badge" :class="drawerGame.isActive ? 'badge-active' : 'badge-inactive'">
                {{ drawerGame.isActive ? 'Active' : 'Inactive' }}
              </span>
              <div class="action-row">
                <button class="btn-sm" @click="openEdit(drawerGame)">Edit</button>
                <button
                  class="btn-sm"
                  :class="drawerGame.isActive ? 'btn-warn' : 'btn-success'"
                  :disabled="toggleLoading"
                  @click="toggleStatus(drawerGame)"
                >
                  {{ drawerGame.isActive ? 'Deactivate' : 'Activate' }}
                </button>
                <button class="btn-sm btn-danger" @click="deleteConfirm = true">Delete</button>
              </div>
            </div>

            <!-- Stats -->
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-label">RTP</div>
                <div class="stat-value">{{ Number(drawerGame.rtpPercent).toFixed(2) }}%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Revenue</div>
                <div class="stat-value">{{ Number(drawerGame.totalRevenue).toLocaleString() }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Bets</div>
                <div class="stat-value">{{ drawerGame.totalBets.toLocaleString() }}</div>
              </div>
            </div>

            <!-- Info -->
            <div class="info-grid">
              <div class="info-item">
                <label>Description</label>
                <span>{{ drawerGame.description || '—' }}</span>
              </div>
              <div class="info-item">
                <label>Added</label>
                <span>{{ formatDate(drawerGame.createdAt) }}</span>
              </div>
              <div class="info-item" style="grid-column: span 2">
                <label>Image URL</label>
                <span>{{ drawerGame.imageUrl || '—' }}</span>
              </div>
            </div>

            <!-- API Monitoring -->
            <div class="section-title">API Monitoring</div>
            <div class="api-panel">
              <div class="api-row">
                <span class="api-field-label">Endpoint</span>
                <span class="api-field-value">{{ drawerGame.apiEndpoint || '—' }}</span>
              </div>
              <div class="api-row">
                <span class="api-field-label">API Key</span>
                <span class="api-field-value">{{ drawerGame.apiKey ? '••••••••' : '—' }}</span>
              </div>
              <div class="api-row">
                <span class="api-field-label">Last Ping</span>
                <span class="api-field-value">{{ formatDateTime(drawerGame.lastPingAt) }}</span>
              </div>
              <div class="api-row">
                <span class="api-field-label">Last Status</span>
                <span
                  class="api-status"
                  :class="drawerGame.lastPingOk ? 'api-ok' : drawerGame.lastPingAt ? 'api-warn' : 'api-none'"
                >
                  {{ drawerGame.lastPingOk ? '✓ OK' : drawerGame.lastPingAt ? '✗ Error' : 'Not yet pinged' }}
                </span>
              </div>

              <!-- Ping button + result -->
              <div class="api-action-row">
                <button
                  class="btn-sm"
                  :disabled="pingLoading || !drawerGame.apiEndpoint"
                  @click="pingApi(drawerGame)"
                >
                  {{ pingLoading ? 'Pinging...' : 'Ping Now' }}
                </button>
                <span v-if="drawerGame.apiEndpoint === ''" class="api-field-value" style="color: var(--text-dim)">
                  No endpoint configured — edit to add one.
                </span>
              </div>

              <div v-if="pingResult" class="ping-result" :class="pingResult.pingOk ? 'ping-ok' : 'ping-fail'">
                <strong>{{ pingResult.pingOk ? 'Success' : 'Failed' }}</strong>
                <span v-if="pingResult.pingOk">Response in {{ pingResult.pingMs }}ms</span>
                <span v-else>{{ pingResult.errorMessage }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

  </div>

  <!-- Create Modal -->
  <Teleport to="body">
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Add Game</h3>
          <button class="modal-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Game Name *</label>
            <input v-model="createForm.name" placeholder="Game name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="createForm.description" placeholder="Optional description" class="form-input" rows="2" />
          </div>
          <div class="form-group">
            <label>Image URL</label>
            <input v-model="createForm.imageUrl" placeholder="https://..." class="form-input" />
          </div>
          <div class="form-group">
            <label>RTP % (Return to Player)</label>
            <input v-model.number="createForm.rtpPercent" type="number" step="0.01" min="0" max="100" class="form-input" />
          </div>
          <div class="section-title" style="margin-top:4px">API Settings</div>
          <div class="form-group">
            <label>API Endpoint</label>
            <input v-model="createForm.apiEndpoint" placeholder="https://api.provider.com/health" class="form-input" />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input v-model="createForm.apiKey" type="password" placeholder="Optional API key" class="form-input" />
          </div>
          <div v-if="createError" class="error-msg">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="createModal = false">Cancel</button>
          <button class="btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Adding...' : 'Add Game' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Edit Modal -->
  <Teleport to="body">
    <div v-if="editModal" class="modal-overlay" @click.self="editModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Edit Game</h3>
          <button class="modal-close" @click="editModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Game Name</label>
            <input v-model="editForm.name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="editForm.description" class="form-input" rows="2" />
          </div>
          <div class="form-group">
            <label>Image URL</label>
            <input v-model="editForm.imageUrl" class="form-input" />
          </div>
          <div class="form-group">
            <label>RTP %</label>
            <input v-model.number="editForm.rtpPercent" type="number" step="0.01" min="0" max="100" class="form-input" />
          </div>
          <div class="section-title" style="margin-top:4px">API Settings</div>
          <div class="form-group">
            <label>API Endpoint</label>
            <input v-model="editForm.apiEndpoint" class="form-input" />
          </div>
          <div class="form-group">
            <label>API Key (leave blank to keep existing)</label>
            <input v-model="editForm.apiKey" type="password" class="form-input" />
          </div>
          <div v-if="editError" class="error-msg">{{ editError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="editModal = false">Cancel</button>
          <button class="btn-primary" :disabled="editLoading" @click="submitEdit">
            {{ editLoading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete Confirm -->
  <Teleport to="body">
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = false">
      <div class="modal modal-box modal-sm">
        <div class="modal-header">
          <h3>Remove Game</h3>
          <button class="modal-close" @click="deleteConfirm = false">✕</button>
        </div>
        <div class="modal-body">
          <p>Permanently remove <strong>{{ drawerGame?.name }}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="deleteConfirm = false">Cancel</button>
          <button class="btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Removing...' : 'Remove' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toolbar-left  { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; min-width: 200px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; }
.filter-select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; }
.stat-pill { background: var(--surface); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: 12px; color: var(--text-dim); }

/* Table */
.table-card { background: var(--surface); border-radius: 12px; border: 1px solid var(--border); overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--border); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.cell-name { font-weight: 600; }
.cell-sub  { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.loading   { padding: 40px; text-align: center; color: var(--text-dim); }

/* RTP badge */
.rtp-badge { background: #4da6ff22; color: #4da6ff; padding: 3px 8px; border-radius: 99px; font-size: 12px; font-weight: 700; }

/* API status */
.api-status  { font-size: 12px; font-weight: 600; }
.api-ok      { color: #22c97a; }
.api-warn    { color: #ff4d4d; }
.api-none    { color: var(--text-dim); }

/* Badges */
.badge         { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-active  { background: #22c97a22; color: #22c97a; }
.badge-inactive { background: #55556a33; color: #9090aa; }

/* Buttons */
.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost   { padding: 8px 16px; background: none; color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-sm      { padding: 5px 10px; background: var(--surface-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-warn    { background: #e8a02022; color: #e8a020; border-color: #e8a02040; }
.btn-success { background: #22c97a22; color: #22c97a; border-color: #22c97a40; }
.btn-danger  { background: #ff4d4d22; color: #ff4d4d; border-color: #ff4d4d40; }

/* Drawer */
.drawer-overlay { position: fixed; inset: 0; z-index: 200; display: flex; justify-content: flex-end; }
.drawer { width: 520px; max-width: 100vw; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
.drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); }
.drawer-header h2 { font-size: 16px; font-weight: 700; }
.drawer-close { background: none; border: none; font-size: 18px; color: var(--text-dim); cursor: pointer; }
.drawer-body  { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.detail-row   { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.action-row   { display: flex; gap: 6px; }

/* Stats */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-card { background: var(--surface-elevated); border-radius: 10px; padding: 16px; text-align: center; }
.stat-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px; }
.stat-value { font-size: 18px; font-weight: 700; color: var(--text); }

/* Info grid */
.info-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item  { display: flex; flex-direction: column; gap: 4px; }
.info-item label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; }
.info-item span  { font-size: 13px; color: var(--text); }
.section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); }

/* API panel */
.api-panel        { background: var(--surface-elevated); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.api-row          { display: flex; gap: 12px; align-items: flex-start; }
.api-field-label  { font-size: 11px; color: var(--text-dim); text-transform: uppercase; width: 90px; flex-shrink: 0; padding-top: 1px; }
.api-field-value  { font-size: 13px; color: var(--text); word-break: break-all; }
.api-action-row   { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.ping-result      { padding: 10px 14px; border-radius: 8px; display: flex; gap: 10px; font-size: 13px; }
.ping-ok          { background: #22c97a18; color: #22c97a; }
.ping-fail        { background: #ff4d4d18; color: #ff4d4d; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal    { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 580px; max-width: 95vw; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.modal-sm { width: 360px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.modal-close  { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; }
.modal-body   { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }

/* Forms */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.form-input { padding: 9px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--content-bg); color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box; }
.error-msg  { color: #ff4d4d; font-size: 13px; }
</style>
