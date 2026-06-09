<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as bannersApi from '@/api/banners'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const banners = ref<any[]>([])
const loading = ref(true)

// Create/Edit modal
const formModal = ref(false)
const isEdit = ref(false)
const editTarget = ref<any>(null)
const formLoading = ref(false)
const formError = ref('')

const PLACEMENT_OPTIONS = [
  { value: 'home_top',      label: 'Home – Top' },
  { value: 'profile_agent', label: 'Profile – Agent Recruiting' },
  { value: 'discover_top',  label: 'Discover – Top' },
  { value: 'room_banner',   label: 'Live Room' },
] as const

function placementLabel(value: string) {
  return PLACEMENT_OPTIONS.find(o => o.value === value)?.label ?? value
}

function emptyForm() {
  return {
    imageUrl: '',
    title: '',
    subtitle: '',
    redirectType: 'external',
    redirectValue: '',
    placement: 'home_top',
    priority: 5,
    isActive: true,
    startDate: '',
    endDate: '',
  }
}

const form = ref(emptyForm())
const imageFile = ref<File | null>(null)
const imagePreview = ref<string>('')

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

// Delete confirm
const deleteConfirm = ref<any>(null)
const deleteLoading = ref(false)

async function fetchBanners() {
  loading.value = true
  try {
    const res = await bannersApi.listBanners()
    banners.value = res.data ?? res
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

function openEdit(banner: any) {
  isEdit.value = true
  editTarget.value = banner
  form.value = {
    imageUrl: banner.imageUrl,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    redirectType: banner.redirectType,
    redirectValue: banner.redirectValue ?? '',
    placement: banner.placement ?? 'home_top',
    priority: banner.priority ?? 5,
    isActive: banner.isActive,
    startDate: banner.startDate?.slice(0, 16) ?? '',
    endDate: banner.endDate?.slice(0, 16) ?? '',
  }
  imageFile.value = null
  imagePreview.value = banner.imageUrl ?? ''
  formModal.value = true
}

function buildPayload() {
  // If a file is selected, use FormData (multipart); otherwise send JSON.
  if (imageFile.value) {
    const fd = new FormData()
    fd.append('imageFile', imageFile.value)
    for (const [k, v] of Object.entries(form.value)) {
      if (v === null || v === undefined) continue
      if (k === 'imageUrl' && !v) continue // skip empty url when uploading a file
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
      await bannersApi.updateBanner(editTarget.value.id, payload)
      toast.success('Banner Updated')
    } else {
      await bannersApi.createBanner(payload)
      toast.success('Banner Created', form.value.title)
    }
    formModal.value = false
    await fetchBanners()
  } catch (e: any) { formError.value = e?.message || 'Failed' }
  formLoading.value = false
}

async function handleToggle(banner: any) {
  try {
    await bannersApi.toggleBanner(banner.id)
    toast.info('Banner ' + (banner.isActive ? 'Deactivated' : 'Activated'))
    await fetchBanners()
  } catch (e: any) { toast.error('Toggle Failed', e?.message) }
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  deleteLoading.value = true
  try {
    await bannersApi.deleteBanner(deleteConfirm.value.id)
    toast.success('Banner Deleted')
    deleteConfirm.value = null
    await fetchBanners()
  } catch (e: any) { toast.error('Delete Failed', e?.message) }
  deleteLoading.value = false
}

function redirectLabel(type: string) {
  return { event: 'Event', external: 'External URL', user_profile: 'User Profile', game: 'Game' }[type] || type
}

onMounted(fetchBanners)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">Banner Management</h2>
      <button v-if="auth.hasPermission('banner.manage')" class="btn btn-primary" @click="openCreate">+ New Banner</button>
    </div>

    <div v-if="loading" class="loading">Loading banners...</div>

    <div v-else-if="banners.length === 0" class="empty">
      <div class="empty-icon">🖼️</div>
      <div class="empty-title">No banners yet</div>
      <div class="empty-sub">Upload banner images to display on the home page slider.</div>
    </div>

    <div v-else class="banners-grid">
      <div v-for="banner in banners" :key="banner.id" class="banner-card">
        <div class="banner-preview">
          <img v-if="banner.imageUrl" :src="banner.imageUrl" :alt="banner.title" class="banner-img" />
          <div v-else class="banner-no-img">No Image</div>
          <div class="banner-priority">P{{ banner.priority }}</div>
          <div :class="['banner-status', banner.isActive ? 'status-on' : 'status-off']">
            {{ banner.isActive ? 'Active' : 'Inactive' }}
          </div>
        </div>
        <div class="banner-body">
          <div class="banner-title">{{ banner.title }}</div>
          <div v-if="banner.subtitle" class="banner-subtitle">{{ banner.subtitle }}</div>
          <div class="banner-meta">
            <span class="meta-tag placement">{{ placementLabel(banner.placement) }}</span>
            <span class="meta-tag">{{ redirectLabel(banner.redirectType) }}</span>
          </div>
          <div v-if="banner.redirectValue" class="banner-meta">
            <span class="meta-value">{{ banner.redirectValue }}</span>
          </div>
          <div class="banner-dates">
            {{ new Date(banner.startDate).toLocaleDateString() }} – {{ new Date(banner.endDate).toLocaleDateString() }}
          </div>
        </div>
        <div v-if="auth.hasPermission('banner.manage')" class="banner-actions">
          <button class="btn-row" @click="openEdit(banner)">Edit</button>
          <button class="btn-row" @click="handleToggle(banner)">
            {{ banner.isActive ? 'Deactivate' : 'Activate' }}
          </button>
          <button class="btn-row danger" @click="deleteConfirm = banner">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Create/Edit modal -->
    <div v-if="formModal" class="modal-overlay" @click.self="formModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>{{ isEdit ? 'Edit Banner' : 'New Banner' }}</h3>
          <button class="btn-close" @click="formModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Banner Image</label>
            <input type="file" accept="image/*" class="form-input" @change="onFileSelected" />
            <div v-if="imagePreview" class="image-preview">
              <img :src="imagePreview" alt="Preview" />
            </div>
            <label class="hint-label">Or paste an image URL:</label>
            <input v-model="form.imageUrl" class="form-input" placeholder="https://cdn.example.com/banner.jpg" />
          </div>
          <div class="form-row">
            <div class="form-group flex-2">
              <label>Title</label>
              <input v-model="form.title" class="form-input" placeholder="Banner title" />
            </div>
            <div class="form-group form-group-sm">
              <label>Priority (1-10)</label>
              <input v-model.number="form.priority" type="number" min="1" max="10" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label>Subtitle</label>
            <input v-model="form.subtitle" class="form-input" placeholder="Optional subtitle" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Placement</label>
              <select v-model="form.placement" class="form-input">
                <option v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Redirect Type</label>
              <select v-model="form.redirectType" class="form-input">
                <option value="event">Event</option>
                <option value="external">External URL</option>
                <option value="user_profile">User Profile</option>
                <option value="game">Game</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Redirect Value</label>
            <input v-model="form.redirectValue" class="form-input" placeholder="Event ID / URL / Haka ID" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Date</label>
              <input v-model="form.startDate" type="datetime-local" class="form-input" />
            </div>
            <div class="form-group">
              <label>End Date</label>
              <input v-model="form.endDate" type="datetime-local" class="form-input" />
            </div>
          </div>
          <label class="check-label">
            <input type="checkbox" v-model="form.isActive" />
            Active immediately
          </label>
          <div v-if="formError" class="form-error">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="formModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="formLoading" @click="submitForm">
            {{ formLoading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Banner') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Delete Banner</h3>
          <button class="btn-close" @click="deleteConfirm = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">Delete banner <strong>{{ deleteConfirm.title }}</strong>? This cannot be undone.</p>
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
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-danger { background: #FF4D4D; color: #fff; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: var(--text-muted); }

.banners-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.banner-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.banner-preview { position: relative; height: 140px; background: var(--content-bg); }
.banner-img { width: 100%; height: 100%; object-fit: cover; }
.banner-no-img { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
.banner-priority { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.banner-status { position: absolute; top: 8px; right: 8px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.status-on { background: #d1fae5; color: #065f46; }
.status-off { background: #fee2e2; color: #991b1b; }
.banner-body { padding: 12px 14px 8px; }
.banner-title { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
.banner-subtitle { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.banner-meta { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
.meta-tag { padding: 2px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 4px; font-size: 11px; font-weight: 600; }
.meta-tag.placement { background: #FFF3D6; color: #8A6400; }
.meta-value { font-size: 11px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.banner-dates { font-size: 11px; color: var(--text-muted); }
.banner-actions { padding: 0 14px 12px; display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; }
.btn-row.danger { color: #FF4D4D; border-color: #FF4D4D; }
.btn-row:hover { background: var(--row-hover); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(540px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); }
.form-row { display: flex; gap: 12px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.form-group.flex-2 { flex: 2; }
.form-group-sm { flex: 0 0 100px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; user-select: none; }
.check-label input { accent-color: var(--primary); }
.image-preview { margin-top: 8px; max-width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border); }
.image-preview img { display: block; width: 100%; max-height: 180px; object-fit: cover; }
.hint-label { margin-top: 10px; font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: none; letter-spacing: 0; }
</style>
