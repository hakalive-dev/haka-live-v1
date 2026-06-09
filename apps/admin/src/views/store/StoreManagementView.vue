<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import * as storeApi from '@/api/store'
import Pagination from '@/components/common/Pagination.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import StoreSuperAdminPanel from './StoreSuperAdminPanel.vue'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const toast = useToastStore()
const auth = useAuthStore()
const isSuperAdmin = computed(() => auth.isSuperAdmin)
const superPanel = ref<InstanceType<typeof StoreSuperAdminPanel> | null>(null)

const CATEGORIES = [
  'frame',
  'entry',
  'chat_bubble',
  'special_id',
  'profile_card',
  'mic_voice_wave',
  'dynamic_profile',
  'ring',
  'theme',
] as const

function formatCategory(cat: string): string {
  return cat
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDuration(days: number): string {
  return days === 0 ? 'Permanent' : `${days}d`
}

function storeItemThumbnail(item: any): string {
  const candidate = item.previewImage || item.imageUrl || item.image
  return typeof candidate === 'string' && !candidate.endsWith('.svga') ? candidate : ''
}

// ── List state ────────────────────────────────────────────────────────────────
const items       = ref<any[]>([])
const pagination  = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search      = ref('')
const categoryFilter = ref('')
const activeFilter   = ref('')
const saleFilter     = ref('')
const selectedIds    = ref<string[]>([])
const loading     = ref(true)

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(idx, 1)
}

function toggleSelectAll() {
  if (selectedIds.value.length === items.value.length) {
    selectedIds.value = []
  } else {
    selectedIds.value = items.value.map((i: any) => i.id)
  }
}

// ── Bulk upload ────────────────────────────────────────────────────────────────
type BulkImportFailedRow = { row: number; name?: string; error: string }
type BulkImportResult = { created: unknown[]; failed: BulkImportFailedRow[] }

const showBulkModal = ref(false)
const bulkZipFile = ref<File | null>(null)
const bulkSubmitting = ref(false)
const bulkError = ref('')
const bulkResult = ref<BulkImportResult | null>(null)
const templateDownloading = ref(false)
const bulkProgress = ref<{ loaded: number; total?: number } | null>(null)

function formatBytes(n: number): string {
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function openBulkModal() {
  bulkZipFile.value = null
  bulkError.value = ''
  bulkResult.value = null
  bulkProgress.value = null
  showBulkModal.value = true
}

function onBulkZipChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  bulkZipFile.value = file ?? null
}

async function downloadTemplate() {
  templateDownloading.value = true
  bulkError.value = ''
  try {
    const blob = await storeApi.downloadBulkTemplate()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'store-bulk-template.zip'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    bulkError.value = err.message || 'Failed to download template'
  } finally {
    templateDownloading.value = false
  }
}

async function handleBulkSubmit() {
  if (!bulkZipFile.value) {
    bulkError.value = 'Please select a ZIP file'
    return
  }
  bulkError.value = ''
  bulkProgress.value = { loaded: 0, total: bulkZipFile.value.size }
  bulkSubmitting.value = true
  try {
    bulkResult.value = await storeApi.bulkUploadStoreItems(bulkZipFile.value, {
      onProgress: (p) => {
        bulkProgress.value = { loaded: p.loaded, total: p.total ?? bulkZipFile.value?.size }
      },
    })
    await fetchItems()
  } catch (err: any) {
    bulkError.value = err.message
  } finally {
    bulkSubmitting.value = false
  }
}

async function fetchItems() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page:  pagination.value.page,
      limit: pagination.value.limit,
    }
    if (search.value)         params.search   = search.value
    if (categoryFilter.value) params.category = categoryFilter.value
    if (activeFilter.value)   params.isActive = activeFilter.value
    if (saleFilter.value)     params.isForSale = saleFilter.value
    const result = await storeApi.listStoreItems(params)
    items.value      = result.items ?? result.storeItems ?? result.data ?? []
    pagination.value = result.pagination ?? pagination.value
  } catch (e: any) { toast.error('Failed to load items', e?.message) }
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchItems() }

// ── Create modal ───────────────────────────────────────────────────────────────
const createModal   = ref(false)
const SPECIAL_ID_LEVELS = ['', 'SSS', 'SS', 'S', 'A', 'B'] as const

const createForm    = ref({
  name: '', description: '',
  category: '', level: '', coinCost: 0, durationDays: 0,
})
const createImageFile = ref<File | null>(null)
const createSvgaFile  = ref<File | null>(null)
const createImagePreview = ref<string | null>(null)
const createLoading = ref(false)
const createError   = ref('')

function openCreate() {
  createForm.value  = { name: '', description: '', category: '', level: '', coinCost: 0, durationDays: 0 }
  createImageFile.value    = null
  createSvgaFile.value     = null
  createImagePreview.value = null
  createError.value = ''
  createModal.value = true
}

function onCreateImageChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  createImageFile.value = file
  createImagePreview.value = file ? URL.createObjectURL(file) : null
}

function onCreateSvgaChange(e: Event) {
  createSvgaFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function buildFormData(
  form: Record<string, any>,
  imageFile: File | null,
  svgaFile: File | null,
): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(form)) {
    if (k === 'level') {
      if (form.category === 'special_id') fd.append('level', v == null ? '' : String(v))
      continue
    }
    if (v !== '' && v !== null && v !== undefined) fd.append(k, String(v))
  }
  if (imageFile) fd.append('imageFile', imageFile)
  if (svgaFile)  fd.append('svgaFile', svgaFile)
  return fd
}

async function submitCreate() {
  createError.value   = ''
  if (!createForm.value.name?.trim()) {
    createError.value = 'Name is required'
    return
  }
  if (!createForm.value.category) {
    createError.value = 'Category is required'
    return
  }
  createLoading.value = true
  try {
    const fd = buildFormData(createForm.value, createImageFile.value, createSvgaFile.value)
    await storeApi.createStoreItem(fd)
    createModal.value = false
    toast.success('Item Created')
    await fetchItems()
  } catch (e: any) { createError.value = e?.message || 'Failed to create item' }
  createLoading.value = false
}

// ── Edit modal ────────────────────────────────────────────────────────────────
const editModal   = ref(false)
const editItem    = ref<any>(null)
const editForm    = ref({
  name: '', description: '',
  category: '', level: '', coinCost: 0, durationDays: 0,
})
const editImageFile = ref<File | null>(null)
const editSvgaFile  = ref<File | null>(null)
const editImagePreview = ref<string | null>(null)
const editLoading = ref(false)
const editError   = ref('')

function openEdit(item: any) {
  editItem.value = item
  editForm.value = {
    name:         item.name,
    description:  item.description || '',
    category:     item.category || '',
    level:        item.level || '',
    coinCost:     Number(item.coinCost),
    durationDays: Number(item.durationDays),
  }
  editImageFile.value    = null
  editSvgaFile.value     = null
  editImagePreview.value = storeItemThumbnail(item) || null
  editError.value = ''
  editModal.value = true
}

function onEditImageChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  editImageFile.value = file
  editImagePreview.value = file ? URL.createObjectURL(file) : null
}

function onEditSvgaChange(e: Event) {
  editSvgaFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function submitEdit() {
  if (!editItem.value) return
  editError.value   = ''
  editLoading.value = true
  try {
    const fd = buildFormData(editForm.value, editImageFile.value, editSvgaFile.value)
    await storeApi.updateStoreItem(editItem.value.id, fd)
    editModal.value = false
    toast.success('Item Updated')
    await fetchItems()
  } catch (e: any) { editError.value = e?.message || 'Failed to update item' }
  editLoading.value = false
}

// ── Toggle status ─────────────────────────────────────────────────────────────
const toggleLoading = ref<Record<string, boolean>>({})

async function toggleStatus(item: any) {
  toggleLoading.value[item.id] = true
  try {
    const updated = await storeApi.toggleStoreItem(item.id, !item.isActive)
    toast.info(item.isActive ? 'Item Deactivated' : 'Item Activated')
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) items.value[idx] = updated
  } catch (e: any) { toast.error('Toggle Failed', e?.message) }
  toggleLoading.value[item.id] = false
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteTarget  = ref<any>(null)
const deleteConfirm = ref(false)
const deleteLoading = ref(false)

function openDelete(item: any) {
  deleteTarget.value  = item
  deleteConfirm.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await storeApi.deleteStoreItem(deleteTarget.value.id)
    toast.success('Item Deleted')
    deleteConfirm.value = false
    deleteTarget.value  = null
    await fetchItems()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

onMounted(fetchItems)
watch(() => pagination.value.page, fetchItems)

watch(
  () => createForm.value.category,
  (cat) => {
    if (cat !== 'special_id') createForm.value.level = ''
  },
)
watch(
  () => editForm.value.category,
  (cat) => {
    if (cat !== 'special_id') editForm.value.level = ''
  },
)
</script>

<template>
  <div class="page">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="search"
          placeholder="Search items..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <select v-model="categoryFilter" @change="handleSearch" class="filter-select">
          <option value="">All Categories</option>
          <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ formatCategory(cat) }}</option>
        </select>
        <select v-model="activeFilter" @change="handleSearch" class="filter-select">
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select v-model="saleFilter" @change="handleSearch" class="filter-select">
          <option value="">All Sale Status</option>
          <option value="true">For Sale</option>
          <option value="false">Not For Sale</option>
        </select>
        <button class="btn-primary" @click="handleSearch">Search</button>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <template v-if="isSuperAdmin">
          <button class="btn-ghost" :disabled="!selectedIds.length" @click="superPanel?.openBulkSale()">Bulk Sale Status</button>
          <button class="btn-ghost" :disabled="!selectedIds.length" @click="superPanel?.openSchedule()">Schedule Sale</button>
          <button class="btn-ghost" @click="superPanel?.loadAnalytics()">Analytics</button>
        </template>
        <button class="btn-ghost" @click="openBulkModal">Bulk Upload</button>
        <button class="btn-primary" @click="openCreate">+ Add Item</button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading store items...</div>
      <div v-else-if="items.length === 0" class="loading">No store items found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th v-if="isSuperAdmin" class="chk-th">
              <input type="checkbox" :checked="selectedIds.length === items.length && items.length > 0" @change="toggleSelectAll" />
            </th>
            <th>Item</th>
            <th>Category</th>
            <th>Tier</th>
            <th>Cost</th>
            <th>Duration</th>
            <th>Status</th>
            <th v-if="isSuperAdmin">Sale</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td v-if="isSuperAdmin" class="chk-td">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @change="toggleSelect(item.id)" />
            </td>
            <td>
              <div class="cell-item">
                <img v-if="storeItemThumbnail(item)" :src="storeItemThumbnail(item)" class="item-thumb" alt="preview" />
                <div class="item-thumb item-thumb-placeholder" v-else>🛍️</div>
                <div>
                  <div class="cell-name">{{ item.name }}</div>
                  <div class="cell-sub">{{ item.description || '—' }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="category-badge">{{ formatCategory(item.category) }}</span>
            </td>
            <td class="cell-sub">
              <span v-if="item.category === 'special_id' && item.level" class="tier-badge">{{ item.level }}</span>
              <span v-else>—</span>
            </td>
            <td>
              <span class="cost-badge">🪙 {{ Number(item.coinCost).toLocaleString() }}</span>
            </td>
            <td>{{ formatDuration(Number(item.durationDays)) }}</td>
            <td>
              <span class="badge" :class="item.isActive ? 'badge-active' : 'badge-inactive'">
                {{ item.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td v-if="isSuperAdmin">
              <span class="badge" :class="item.isForSale !== false ? 'badge-sale' : 'badge-nosale'">
                {{ item.isForSale !== false ? 'For Sale' : 'Not For Sale' }}
              </span>
            </td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openEdit(item)">Edit</RowActionMenuItem>
                <template v-if="isSuperAdmin">
                  <RowActionMenuItem @click="superPanel?.openSend(item)">Send Item</RowActionMenuItem>
                  <RowActionMenuItem @click="superPanel?.openDistribute(item)">Bulk Distribute</RowActionMenuItem>
                  <RowActionMenuItem @click="superPanel?.openDistribute(item, true)">Emergency (All Users)</RowActionMenuItem>
                  <RowActionMenuItem @click="superPanel?.toggleItemSale(item)">
                    {{ item.isForSale !== false ? 'Mark Not For Sale' : 'Mark For Sale' }}
                  </RowActionMenuItem>
                  <RowActionMenuItem @click="superPanel?.openHistory(item)">Sale History</RowActionMenuItem>
                </template>
                <RowActionMenuItem
                  :variant="item.isActive ? 'warning' : 'success'"
                  :disabled="!!toggleLoading[item.id]"
                  @click="toggleStatus(item)"
                >
                  {{ item.isActive ? 'Deactivate' : 'Activate' }}
                </RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openDelete(item)">Delete</RowActionMenuItem>
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
      @update:page="(p: number) => { pagination.page = p; fetchItems() }"
    />

  </div>

  <!-- Bulk Upload Modal -->
  <Teleport to="body">
    <div v-if="showBulkModal" class="modal-overlay" @click.self="showBulkModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Bulk Upload Store Items</h3>
          <button class="modal-close" @click="showBulkModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="field-hint">
            Upload a ZIP containing <code>manifest.csv</code> and your assets (PNG/JPG/WEBP and optional SVGA).
            For frames, set <code>category=frame</code> and <code>imageFile</code> to the PNG filename.
          </p>

          <button class="btn-sm btn-template" :disabled="templateDownloading" @click="downloadTemplate">
            {{ templateDownloading ? 'Downloading…' : 'Download Template ZIP' }}
          </button>

          <div v-if="bulkResult" class="bulk-result">
            <p class="bulk-summary">
              Created <b>{{ bulkResult.created.length }}</b> item(s),
              Failed <b>{{ bulkResult.failed.length }}</b> row(s).
            </p>
            <ul v-if="bulkResult.failed.length" class="bulk-failures">
              <li v-for="f in bulkResult.failed.slice(0, 8)" :key="f.row">
                Row {{ f.row }}<span v-if="f.name"> ({{ f.name }})</span>: {{ f.error }}
              </li>
              <li v-if="bulkResult.failed.length > 8">
                …and {{ bulkResult.failed.length - 8 }} more
              </li>
            </ul>
          </div>

          <div v-if="bulkError" class="error-msg">{{ bulkError }}</div>

          <div v-else-if="bulkSubmitting && bulkProgress?.total" class="bulk-progress">
            Uploaded {{ formatBytes(bulkProgress.loaded) }} / {{ formatBytes(bulkProgress.total) }}
          </div>

          <div class="upload-area bulk-upload">
            <label class="bulk-file-label">ZIP file</label>
            <input type="file" accept=".zip,application/zip" class="file-input" @change="onBulkZipChange" />
            <span v-if="bulkZipFile" class="file-name">{{ bulkZipFile.name }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" @click="showBulkModal = false">Close</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="bulkSubmitting || !bulkZipFile"
            @click="handleBulkSubmit"
          >
            <template v-if="bulkSubmitting">
              Uploading<span v-if="bulkProgress?.total"> {{ Math.min(99, Math.floor((bulkProgress.loaded / bulkProgress.total) * 100)) }}%</span>…
            </template>
            <template v-else>Import</template>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Create Modal -->
  <Teleport to="body">
    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal modal-box">
        <div class="modal-header">
          <h3>Add Store Item</h3>
          <button class="modal-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Name *</label>
            <input v-model="createForm.name" placeholder="Item name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="createForm.description" placeholder="Optional description" class="form-input" rows="2" />
          </div>
          <div class="form-group">
            <label>Thumbnail Image (PNG / JPG)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" class="form-input file-input" @change="onCreateImageChange" />
            <img v-if="createImagePreview" :src="createImagePreview" class="img-preview" alt="preview" />
          </div>

          <div class="form-group">
            <label>Animation (SVGA)</label>
            <input type="file" accept=".svga" class="form-input file-input" @change="onCreateSvgaChange" />
            <span v-if="createSvgaFile" class="file-name">{{ createSvgaFile.name }}</span>
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select v-model="createForm.category" class="form-input">
              <option value="">Select category</option>
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ formatCategory(cat) }}</option>
            </select>
          </div>
          <div v-if="createForm.category === 'special_id'" class="form-group">
            <label>Special ID tier</label>
            <select v-model="createForm.level" class="form-input">
              <option value="">— Optional —</option>
              <option v-for="lv in SPECIAL_ID_LEVELS.filter(Boolean)" :key="lv" :value="lv">{{ lv }}</option>
            </select>
            <p class="field-hint">Shown for special ID items (SSS / SS / S / A / B).</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Coin Cost *</label>
              <input v-model.number="createForm.coinCost" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label>Duration (days, 0 = Permanent) *</label>
              <input v-model.number="createForm.durationDays" type="number" min="0" class="form-input" />
            </div>
          </div>
          <div v-if="createError" class="error-msg">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="createModal = false">Cancel</button>
          <button class="btn-primary" :disabled="createLoading" @click="submitCreate">
            {{ createLoading ? 'Adding...' : 'Add Item' }}
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
          <h3>Edit Store Item</h3>
          <button class="modal-close" @click="editModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Name</label>
            <input v-model="editForm.name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="editForm.description" class="form-input" rows="2" />
          </div>
          <div class="form-group">
            <label>Thumbnail Image (PNG / JPG) — leave empty to keep current</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" class="form-input file-input" @change="onEditImageChange" />
            <img
              v-if="editImagePreview && !editImagePreview.endsWith('.svga')"
              :src="editImagePreview"
              class="img-preview"
              alt="preview"
            />
            <div v-else-if="editImagePreview && editImagePreview.endsWith('.svga')" class="svga-current-badge">
              <span class="svga-badge-pill">SVGA</span>
              <span class="svga-badge-name">{{ editImagePreview.split('/').pop() }}</span>
            </div>
          </div>
          <div class="form-group">
            <label>Animation (SVGA) — leave empty to keep current</label>
            <input type="file" accept=".svga" class="form-input file-input" @change="onEditSvgaChange" />
            <span v-if="editSvgaFile" class="file-name">{{ editSvgaFile.name }}</span>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="editForm.category" class="form-input">
              <option value="">Select category</option>
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ formatCategory(cat) }}</option>
            </select>
          </div>
          <div v-if="editForm.category === 'special_id'" class="form-group">
            <label>Special ID tier</label>
            <select v-model="editForm.level" class="form-input">
              <option value="">— Optional —</option>
              <option v-for="lv in SPECIAL_ID_LEVELS.filter(Boolean)" :key="lv" :value="lv">{{ lv }}</option>
            </select>
            <p class="field-hint">Tier label for this special ID listing.</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Coin Cost</label>
              <input v-model.number="editForm.coinCost" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label>Duration (days, 0 = Permanent)</label>
              <input v-model.number="editForm.durationDays" type="number" min="0" class="form-input" />
            </div>
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

  <StoreSuperAdminPanel
    v-if="isSuperAdmin"
    ref="superPanel"
    :items="items"
    :selected-ids="selectedIds"
    @refresh="fetchItems"
    @update:selected-ids="selectedIds = $event"
  />

  <!-- Delete Confirm -->
  <ConfirmDialog
    :show="deleteConfirm"
    title="Delete Store Item"
    :message="`Permanently delete '${deleteTarget?.name}'? This cannot be undone.`"
    confirm-text="Delete"
    confirm-color="#ff4d4d"
    @confirm="confirmDelete"
    @cancel="deleteConfirm = false"
  />
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
.loading { padding: 40px; text-align: center; color: var(--text-dim); }

/* Item cell */
.cell-item { display: flex; align-items: center; gap: 10px; }
.item-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.item-thumb-placeholder { background: var(--surface-elevated); display: flex; align-items: center; justify-content: center; font-size: 18px; border: 1px solid var(--border); }
.cell-name { font-weight: 600; }
.cell-sub  { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

/* Category badge */
.category-badge { background: #7b4fff22; color: #9d7fff; padding: 3px 8px; border-radius: 99px; font-size: 12px; font-weight: 600; }

/* Cost badge */
.cost-badge { background: #e8a02022; color: #e8a020; padding: 3px 8px; border-radius: 99px; font-size: 12px; font-weight: 700; }

/* Badges */
.badge         { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-active  { background: #22c97a22; color: #22c97a; }
.badge-inactive { background: #55556a33; color: #9090aa; }
.badge-sale    { background: #22c97a22; color: #22c97a; }
.badge-nosale  { background: #e8a02022; color: #e8a020; }
.chk-th, .chk-td { width: 36px; text-align: center; }

/* Buttons */
.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost   { padding: 8px 16px; background: none; color: var(--text); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn-sm      { padding: 5px 10px; background: var(--surface-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; white-space: nowrap; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-warn    { background: #e8a02022; color: #e8a020; border-color: #e8a02040; }
.btn-success { background: #22c97a22; color: #22c97a; border-color: #22c97a40; }
.btn-danger  { background: #ff4d4d22; color: #ff4d4d; border-color: #ff4d4d40; }
.btn-template { margin-bottom: 8px; }

/* Action row in table */
.action-row { display: flex; gap: 6px; }

/* Modals */
.modal-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal    { background: #ffffff; border: 1px solid var(--card-border); border-top: 3px solid var(--primary); border-radius: 14px; width: 580px; max-width: 95vw; box-shadow: 0 25px 80px rgba(0,0,0,.25); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.modal-close  { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; }
.modal-body   { padding: 20px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }

/* Forms */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
.form-input { padding: 9px 12px; border-radius: 8px; border: 1px solid var(--card-border); background: var(--content-bg); color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box; }
.form-row   { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.error-msg  { color: #ff4d4d; font-size: 13px; }
.field-hint { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.4; }
.tier-badge { font-size: 11px; font-weight: 700; color: #7c3aed; background: #f3e8ff; padding: 2px 8px; border-radius: 6px; }
.file-input { padding: 6px 10px; cursor: pointer; }
.img-preview { width: 80px; height: 80px; object-fit: contain; border-radius: 8px; border: 1px solid var(--card-border); margin-top: 6px; background: var(--surface-elevated); }
.file-name  { font-size: 12px; color: var(--text-muted); margin-top: 4px; display: block; }
.svga-current-badge { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 6px 10px; background: #F3E8FF; border-radius: 8px; border: 1px solid #E9D5FF; }
.svga-badge-pill { padding: 2px 8px; background: #7C3AED; color: #fff; border-radius: 99px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.svga-badge-name { font-size: 11px; color: #6D28D9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Bulk upload */
.bulk-result { margin-bottom: 12px; padding: 10px 12px; background: var(--content-bg); border-radius: 8px; border: 1px solid var(--card-border); }
.bulk-summary { margin: 0 0 8px; font-size: 13px; }
.bulk-failures { margin: 0; padding-left: 18px; font-size: 12px; color: var(--danger); }
.bulk-failures li { margin-bottom: 4px; }
.bulk-progress { margin-bottom: 12px; font-size: 12px; color: var(--text-muted); }
.upload-area.bulk-upload { display: flex; flex-direction: column; gap: 6px; }
.bulk-file-label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
</style>
