<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import * as giftsApi from '@/api/gifts'
import GiftsSubnav from '@/components/gifts/GiftsSubnav.vue'
import type { BulkImportResult } from '@/api/gifts'
import StatusBadge from '@/components/common/StatusBadge.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'
import {
  formatGiftCategory,
  GIFT_CATEGORY_OPTIONS,
  normalizeGiftFormCategory,
} from '@/lib/giftCategories'

const auth = useAuthStore()

/** Returns true if the value is a full remote URL (Supabase / CDN). */
function isRemoteUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//.test(value)
}

const gifts = ref<any[]>([])
const categoryFilter = ref('')
const loading = ref(true)

const filteredGifts = computed(() => {
  if (!categoryFilter.value) return gifts.value
  return gifts.value.filter(
    (gift) => normalizeGiftFormCategory(gift.category) === categoryFilter.value,
  )
})
const showForm = ref(false)
const editingGift = ref<any>(null)
const form = ref({ name: '', coinCost: 0, beanValue: 0, category: 'bag', svgaAsset: '' })
const formError = ref('')
const submitting = ref(false)

// File upload state
const imageFile = ref<File | null>(null)
const svgaFile = ref<File | null>(null)
const imagePreview = ref<string>('')
const svgaFileName = ref<string>('')

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

async function fetchGifts() {
  loading.value = true
  try { gifts.value = await giftsApi.listGifts() } catch {}
  loading.value = false
}

function openCreate() {
  editingGift.value = null
  form.value = { name: '', coinCost: 0, beanValue: 0, category: 'bag', svgaAsset: '' }
  imageFile.value = null
  svgaFile.value = null
  imagePreview.value = ''
  svgaFileName.value = ''
  showForm.value = true
}

function openEdit(gift: any) {
  editingGift.value = gift
  form.value = {
    name: gift.name,
    coinCost: gift.coinCost,
    beanValue: gift.beanValue,
    category: normalizeGiftFormCategory(gift.category),
    svgaAsset: isRemoteUrl(gift.svgaAsset) ? gift.svgaAsset : '',
  }
  imageFile.value = null
  svgaFile.value = null
  imagePreview.value = isRemoteUrl(gift.image) ? gift.image : ''
  svgaFileName.value = gift.svgaAsset ? gift.svgaAsset.split('/').pop() : ''
  showForm.value = true
}

function onImageChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

function onSvgaChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  svgaFile.value = file
  svgaFileName.value = file.name
}

function buildFormData(): FormData {
  const fd = new FormData()
  fd.append('name', form.value.name)
  fd.append('coinCost', String(form.value.coinCost))
  fd.append('beanValue', String(form.value.beanValue))
  fd.append('category', form.value.category)
  if (!svgaFile.value && form.value.svgaAsset.trim().length > 0) fd.append('svgaAsset', form.value.svgaAsset.trim())
  if (imageFile.value) fd.append('imageFile', imageFile.value)
  if (svgaFile.value) fd.append('svgaFile', svgaFile.value)
  return fd
}

async function handleSubmit() {
  formError.value = ''
  submitting.value = true
  try {
    const fd = buildFormData()
    if (editingGift.value) {
      await giftsApi.updateGift(editingGift.value.id, fd)
    } else {
      await giftsApi.createGift(fd)
    }
    showForm.value = false
    await fetchGifts()
  } catch (err: any) {
    formError.value = err.message
  } finally {
    submitting.value = false
  }
}

async function toggleActive(gift: any) {
  try {
    const fd = new FormData()
    fd.append('isActive', String(!gift.isActive))
    await giftsApi.updateGift(gift.id, fd)
    await fetchGifts()
  } catch {}
}

function openBulkModal() {
  bulkZipFile.value = null
  bulkError.value = ''
  bulkResult.value = null
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
    const blob = await giftsApi.downloadBulkTemplate()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gifts-bulk-template.zip'
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
    bulkResult.value = await giftsApi.bulkUploadGifts(bulkZipFile.value, {
      onProgress: (p) => {
        bulkProgress.value = { loaded: p.loaded, total: p.total ?? bulkZipFile.value?.size }
      },
    })
    await fetchGifts()
  } catch (err: any) {
    bulkError.value = err.message
  } finally {
    bulkSubmitting.value = false
  }
}

onMounted(fetchGifts)
</script>

<template>
  <div class="page">
    <GiftsSubnav />

    <div
      v-if="auth.hasPermission('gift.manage')"
      class="lucky-banner"
    >
      <div>
        <p class="lucky-banner-title">Lucky gift win probability &amp; payouts</p>
        <p class="lucky-banner-sub">
          Configure win chance, multiplier, and host bean cut for all gifts in the Lucky category.
        </p>
      </div>
      <RouterLink to="/gifts/lucky-gifts" class="btn btn-primary btn-sm">
        Open Lucky Gift Settings
      </RouterLink>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-subtitle">Gift Catalogue</h2>
        <select v-model="categoryFilter" class="filter-select">
          <option value="">All Categories</option>
          <option
            v-for="opt in GIFT_CATEGORY_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
        <span class="stat-pill">{{ filteredGifts.length }} of {{ gifts.length }}</span>
      </div>
      <div class="toolbar-actions">
        <button
          v-if="auth.hasPermission('gift.manage')"
          type="button"
          class="btn btn-secondary"
          @click="openBulkModal"
        >
          Bulk Upload
        </button>
        <button
          v-if="auth.hasPermission('gift.manage')"
          type="button"
          class="btn btn-primary"
          @click="openCreate"
        >
          + Add Gift
        </button>
      </div>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading gifts...</div>
      <div v-else-if="filteredGifts.length === 0" class="loading">
        {{ categoryFilter ? 'No gifts in this category.' : 'No gifts found.' }}
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Gift</th>
            <th>Cost (coins)</th>
            <th>Value (beans)</th>
            <th>Category</th>
            <th>Assets</th>
            <th>Status</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="gift in filteredGifts" :key="gift.id">
            <td class="cell-gift">
              <img v-if="isRemoteUrl(gift.image)" :src="gift.image" class="gift-thumb" alt="" />
              <span v-else-if="gift.image" class="gift-thumb-placeholder" title="Bundled or relative image path">IMG</span>
              <span v-else class="gift-thumb-placeholder">{{ (gift.name || '?').charAt(0).toUpperCase() }}</span>
              <span class="gift-name">{{ gift.name }}</span>
            </td>
            <td>{{ gift.coinCost.toLocaleString() }}</td>
            <td>{{ gift.beanValue.toLocaleString() }}</td>
            <td><StatusBadge :value="formatGiftCategory(gift.category)" /></td>
            <td class="cell-assets">
              <span v-if="gift.image" class="asset-tag">IMG</span>
              <span v-if="gift.svgaAsset" class="asset-tag asset-svga">SVGA</span>
              <span v-if="!gift.image && !gift.svgaAsset" class="no-assets">—</span>
            </td>
            <td><StatusBadge :value="gift.isActive ? 'active' : 'inactive'" /></td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openEdit(gift)">Edit</RowActionMenuItem>
                <RowActionMenuItem @click="toggleActive(gift)">
                  {{ gift.isActive ? 'Disable' : 'Enable' }}
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Gift form modal -->
    <Teleport to="body">
      <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
        <div class="modal-box">
          <h3 class="modal-title">{{ editingGift ? 'Edit Gift' : 'Add Gift' }}</h3>
          <div v-if="formError" class="form-error">{{ formError }}</div>
          <form @submit.prevent="handleSubmit" class="gift-form">
            <div class="form-row">
              <div class="form-group form-group-full"><label>Name</label><input v-model="form.name" required class="form-input" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Coin Cost</label><input v-model.number="form.coinCost" type="number" required class="form-input" /></div>
              <div class="form-group"><label>Bean Value</label><input v-model.number="form.beanValue" type="number" required class="form-input" /></div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Category</label>
                <select v-model="form.category" class="form-input">
                  <option
                    v-for="opt in GIFT_CATEGORY_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <!-- File uploads -->
            <div class="form-row">
              <div class="form-group">
                <label>Thumbnail Image (PNG/JPG)</label>
                <div class="upload-area">
                  <img v-if="imagePreview" :src="imagePreview" class="upload-preview" alt="preview" />
                  <span v-else-if="editingGift?.image && !isRemoteUrl(editingGift.image)" class="bundled-badge">📦 Bundled asset — upload a new file to replace</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="file-input" @change="onImageChange" />
                  <span v-if="isRemoteUrl(editingGift?.image) && !imageFile" class="keep-hint">Current image kept if no new file chosen</span>
                </div>
              </div>
              <div class="form-group">
                <label>SVGA Animation</label>
                <div class="upload-area">
                  <div v-if="svgaFileName" class="svga-info">
                    <span class="asset-tag asset-svga">SVGA</span>
                    <span class="svga-name">{{ svgaFileName }}</span>
                  </div>
                  <input v-model="form.svgaAsset" placeholder="Paste Supabase public https://... URL (optional)" class="form-input" />
                  <input type="file" accept=".svga" class="file-input" @change="onSvgaChange" />
                  <span v-if="isRemoteUrl(editingGift?.svgaAsset) && !svgaFile" class="keep-hint">Current SVGA kept if no new file chosen</span>
                  <span v-else-if="editingGift?.svgaAsset && !isRemoteUrl(editingGift.svgaAsset) && !svgaFile" class="bundled-badge">📦 Bundled asset — upload a new file to replace</span>
                  <span v-if="form.svgaAsset && svgaFile" class="keep-hint">SVGA URL will be ignored because a new file is selected</span>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="showForm = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="submitting">
                {{ submitting ? 'Saving...' : (editingGift ? 'Update' : 'Create') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Bulk upload modal -->
    <Teleport to="body">
      <div v-if="showBulkModal" class="modal-overlay" @click.self="showBulkModal = false">
        <div class="modal-box">
          <h3 class="modal-title">Bulk Upload Gifts</h3>
          <p class="bulk-hint">
            Upload a ZIP containing <code>manifest.csv</code> plus image/SVGA files referenced in the CSV.
            Maximum 50 gifts per import.
          </p>
          <button
            type="button"
            class="btn btn-secondary btn-template"
            :disabled="templateDownloading"
            @click="downloadTemplate"
          >
            {{ templateDownloading ? 'Downloading...' : 'Download template ZIP' }}
          </button>
          <div v-if="bulkError" class="form-error">{{ bulkError }}</div>
          <div v-if="bulkResult" class="bulk-result">
            <p class="bulk-summary">
              Created <strong>{{ bulkResult.created.length }}</strong> gift(s).
              <span v-if="bulkResult.failed.length">
                {{ bulkResult.failed.length }} row(s) failed.
              </span>
            </p>
            <ul v-if="bulkResult.failed.length" class="bulk-failures">
              <li v-for="(f, idx) in bulkResult.failed" :key="idx">
                Row {{ f.row }}<span v-if="f.name"> ({{ f.name }})</span>: {{ f.error }}
              </li>
            </ul>
          </div>
          <div v-else-if="bulkSubmitting && bulkProgress?.total" class="bulk-progress">
            Uploaded {{ formatBytes(bulkProgress.loaded) }} / {{ formatBytes(bulkProgress.total) }}
          </div>
          <div class="upload-area bulk-upload">
            <label class="bulk-file-label">ZIP file</label>
            <input type="file" accept=".zip,application/zip" class="file-input" @change="onBulkZipChange" />
            <span v-if="bulkZipFile" class="keep-hint">{{ bulkZipFile.name }}</span>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showBulkModal = false">Close</button>
            <button
              type="button"
              class="btn btn-primary"
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
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.lucky-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 18px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 40%, var(--card-border));
  background: color-mix(in srgb, var(--primary) 8%, var(--card-bg));
}
.lucky-banner-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.lucky-banner-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.btn-sm { padding: 6px 12px; font-size: 12px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toolbar-actions { display: flex; gap: 8px; align-items: center; }
.filter-select { height: 36px; padding: 0 10px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); color: var(--text-primary); outline: none; cursor: pointer; }
.stat-pill { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 4px 10px; background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 999px; white-space: nowrap; }
.bulk-hint { font-size: 13px; color: var(--text-muted); margin: 0 0 12px; line-height: 1.5; }
.bulk-hint code { font-size: 12px; background: var(--content-bg); padding: 2px 6px; border-radius: 4px; }
.btn-template { margin-bottom: 12px; }
.bulk-result { margin-bottom: 12px; padding: 10px 12px; background: var(--content-bg); border-radius: 8px; border: 1px solid var(--card-border); }
.bulk-summary { margin: 0 0 8px; font-size: 13px; }
.bulk-failures { margin: 0; padding-left: 18px; font-size: 12px; color: var(--danger); }
.bulk-failures li { margin-bottom: 4px; }
.bulk-progress { margin-bottom: 12px; font-size: 12px; color: var(--text-muted); }
.bulk-upload { margin-bottom: 12px; }
.bulk-file-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.page-subtitle { font-size: 16px; font-weight: 600; margin: 0; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; }
.cell-gift { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.gift-thumb { width: 32px; height: 32px; object-fit: contain; border-radius: 6px; }
.gift-thumb-placeholder {
  width: 32px; height: 32px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  background: var(--content-bg); border: 1px solid var(--card-border);
  color: var(--text-muted);
}
.gift-name { font-weight: 500; }
.cell-assets { display: flex; gap: 4px; align-items: center; }
.asset-tag { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: #E0F2FE; color: #0369A1; }
.asset-svga { background: #F3E8FF; color: #7C3AED; }
.no-assets { color: var(--text-muted); }
.action-btns { display: flex; gap: 6px; }
.btn-edit { padding: 4px 10px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-toggle { padding: 4px 10px; background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); border-radius: 6px; font-size: 12px; cursor: pointer; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--card-bg); border-radius: 16px; padding: 24px; min-width: min(560px, 95vw); max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal-title { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
.form-error { background: var(--danger-soft); color: var(--danger); padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.gift-form { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group.form-group-full { grid-column: 1 / -1; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; outline: none; background: var(--content-bg); color: var(--text-primary); }
.form-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

.upload-area { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px dashed var(--card-border); border-radius: 8px; background: var(--content-bg); }
.upload-preview { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; border: 1px solid var(--card-border); }
.file-input { font-size: 12px; color: var(--text-primary); cursor: pointer; width: 100%; }
.file-input::file-selector-button { padding: 5px 12px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-right: 8px; }
.keep-hint { font-size: 11px; color: var(--text-muted); }
.svga-info { display: flex; align-items: center; gap: 6px; }
.svga-name { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.bundled-badge { font-size: 11px; color: #92400E; background: #FEF3C7; padding: 4px 8px; border-radius: 6px; border: 1px solid #FDE68A; }
</style>
