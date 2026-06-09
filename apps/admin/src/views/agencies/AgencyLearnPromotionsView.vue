<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as promosApi from '@/api/agencyLearnPromotions'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const promotions = ref<any[]>([])
const loading = ref(true)

const formModal = ref(false)
const isEdit = ref(false)
const editTarget = ref<any>(null)
const formLoading = ref(false)
const formError = ref('')

function emptyForm() {
  return {
    imageUrl: '',
    title: '',
    description: '',
    linkUrl: '',
    viewCount: 0,
    likeCount: 0,
    tag: 'Original',
    sortOrder: 0,
    isActive: true,
  }
}

const form = ref(emptyForm())
const imageFile = ref<File | null>(null)
const imagePreview = ref<string>('')

const deleteConfirm = ref<any>(null)
const deleteLoading = ref(false)

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  imageFile.value = file
  if (file) {
    const reader = new FileReader()
    reader.onload = () => { imagePreview.value = reader.result as string }
    reader.readAsDataURL(file)
  } else {
    imagePreview.value = ''
  }
}

async function fetchPromotions() {
  loading.value = true
  try {
    const res = await promosApi.listAgencyLearnPromotions()
    promotions.value = res.data ?? res
  } catch {}
  loading.value = false
}

function openCreate() {
  isEdit.value = false
  editTarget.value = null
  form.value = emptyForm()
  imageFile.value = null
  imagePreview.value = ''
  formModal.value = true
}

function openEdit(row: any) {
  isEdit.value = true
  editTarget.value = row
  form.value = {
    imageUrl: row.imageUrl,
    title: row.title,
    description: row.description ?? '',
    linkUrl: row.linkUrl ?? '',
    viewCount: row.viewCount ?? 0,
    likeCount: row.likeCount ?? 0,
    tag: row.tag ?? 'Original',
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive,
  }
  imageFile.value = null
  imagePreview.value = row.imageUrl ?? ''
  formModal.value = true
}

function buildPayload() {
  if (imageFile.value) {
    const fd = new FormData()
    fd.append('imageFile', imageFile.value)
    for (const [k, v] of Object.entries(form.value)) {
      if (v === null || v === undefined) continue
      if (k === 'imageUrl' && !v) continue
      fd.append(k, String(v))
    }
    return fd
  }
  return form.value
}

async function submitForm() {
  formError.value = ''
  formLoading.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value && editTarget.value) {
      await promosApi.updateAgencyLearnPromotion(editTarget.value.id, payload)
      toast.success('Promotion Updated')
    } else {
      await promosApi.createAgencyLearnPromotion(payload)
      toast.success('Promotion Created', form.value.title)
    }
    formModal.value = false
    await fetchPromotions()
  } catch (e: any) {
    formError.value = e?.message || 'Failed'
  }
  formLoading.value = false
}

async function handleToggle(row: any) {
  try {
    await promosApi.toggleAgencyLearnPromotion(row.id, !row.isActive)
    toast.info('Promotion ' + (row.isActive ? 'Deactivated' : 'Activated'))
    await fetchPromotions()
  } catch (e: any) {
    toast.error('Toggle Failed', e?.message)
  }
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  deleteLoading.value = true
  try {
    await promosApi.deleteAgencyLearnPromotion(deleteConfirm.value.id)
    toast.success('Promotion Deleted')
    deleteConfirm.value = null
    await fetchPromotions()
  } catch (e: any) {
    toast.error('Delete Failed', e?.message)
  }
  deleteLoading.value = false
}

function formatStat(n: number) {
  return Number(n).toLocaleString()
}

onMounted(fetchPromotions)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">Agency Learn Promotions</h2>
      <button v-if="auth.hasPermission('agency.manage')" class="btn btn-primary" @click="openCreate">+ New Promotion</button>
    </div>

    <p class="page-hint">Shown on Agency Center → Make Money → Earn Money - Learn Promotion. Tap opens Link URL in the user&apos;s browser.</p>

    <div v-if="loading" class="loading">Loading promotions...</div>

    <div v-else-if="promotions.length === 0" class="empty">
      <div class="empty-icon">📚</div>
      <div class="empty-title">No learn promotions yet</div>
      <div class="empty-sub">Create cards with image, title, description, link, and display stats.</div>
    </div>

    <div v-else class="promos-grid">
      <div v-for="row in promotions" :key="row.id" class="promo-card">
        <div class="promo-preview">
          <img v-if="row.imageUrl" :src="row.imageUrl" :alt="row.title" class="promo-img" />
          <div v-else class="promo-no-img">No Image</div>
          <div class="promo-sort">#{{ row.sortOrder }}</div>
          <div :class="['promo-status', row.isActive ? 'status-on' : 'status-off']">
            {{ row.isActive ? 'Active' : 'Inactive' }}
          </div>
        </div>
        <div class="promo-body">
          <div class="promo-title">{{ row.title }}</div>
          <div v-if="row.description" class="promo-desc">{{ row.description }}</div>
          <div class="promo-stats">
            <span>👁 {{ formatStat(row.viewCount) }}</span>
            <span>♥ {{ formatStat(row.likeCount) }}</span>
            <span v-if="row.tag" class="meta-tag">{{ row.tag }}</span>
          </div>
          <div v-if="row.linkUrl" class="promo-link">{{ row.linkUrl }}</div>
        </div>
        <div v-if="auth.hasPermission('agency.manage')" class="promo-actions">
          <button class="btn-row" @click="openEdit(row)">Edit</button>
          <button class="btn-row" @click="handleToggle(row)">
            {{ row.isActive ? 'Deactivate' : 'Activate' }}
          </button>
          <button class="btn-row danger" @click="deleteConfirm = row">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="formModal" class="modal-overlay" @click.self="formModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>{{ isEdit ? 'Edit Promotion' : 'New Promotion' }}</h3>
          <button class="btn-close" @click="formModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Image</label>
            <input type="file" accept="image/*" class="form-input" @change="onFileSelected" />
            <div v-if="imagePreview" class="image-preview">
              <img :src="imagePreview" alt="Preview" />
            </div>
            <label class="hint-label">Or paste an image URL:</label>
            <input v-model="form.imageUrl" class="form-input" placeholder="https://cdn.example.com/promo.jpg" />
          </div>
          <div class="form-group">
            <label>Title</label>
            <input v-model="form.title" class="form-input" placeholder="Promotion title" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="form.description" class="form-textarea" rows="3" placeholder="Short subtitle shown on the card" />
          </div>
          <div class="form-group">
            <label>Link URL</label>
            <input v-model="form.linkUrl" class="form-input" placeholder="https://example.com/guide" />
            <span class="hint-label">Opens in the user&apos;s browser when they tap the card (http/https only).</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Views (display)</label>
              <input v-model.number="form.viewCount" type="number" min="0" class="form-input" />
            </div>
            <div class="form-group">
              <label>Likes (display)</label>
              <input v-model.number="form.likeCount" type="number" min="0" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tag</label>
              <input v-model="form.tag" class="form-input" placeholder="Original" />
            </div>
            <div class="form-group">
              <label>Sort order</label>
              <input v-model.number="form.sortOrder" type="number" class="form-input" />
            </div>
          </div>
          <label class="check-label">
            <input type="checkbox" v-model="form.isActive" />
            Active
          </label>
          <div v-if="formError" class="form-error">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="formModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="formLoading" @click="submitForm">
            {{ formLoading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Delete Promotion</h3>
          <button class="btn-close" @click="deleteConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">Delete <strong>{{ deleteConfirm.title }}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDelete">
            {{ deleteLoading ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-hint { margin: 0; font-size: 13px; color: var(--text-muted); }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger { background: #FF4D4D; color: #fff; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: var(--text-muted); }

.promos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.promo-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.promo-preview { position: relative; height: 120px; background: var(--content-bg); }
.promo-img { width: 100%; height: 100%; object-fit: cover; }
.promo-no-img { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
.promo-sort { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.promo-status { position: absolute; top: 8px; right: 8px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.status-on { background: #d1fae5; color: #065f46; }
.status-off { background: #fee2e2; color: #991b1b; }
.promo-body { padding: 12px 14px 8px; }
.promo-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.promo-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.promo-stats { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.meta-tag { padding: 2px 8px; background: #FF6B0018; color: #FF6B00; border-radius: 4px; font-size: 11px; font-weight: 600; }
.promo-link { font-size: 11px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.promo-actions { padding: 0 14px 12px; display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; }
.btn-row.danger { color: #FF4D4D; border-color: #FF4D4D; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(540px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); }
.form-row { display: flex; gap: 12px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); }
.form-textarea { padding: 10px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); resize: vertical; }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.hint-label { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: none; letter-spacing: 0; }
.image-preview { margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border); }
.image-preview img { display: block; width: 100%; max-height: 160px; object-fit: cover; }
</style>
