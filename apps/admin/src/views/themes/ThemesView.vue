<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as themesApi from '@/api/themes'
import type { Theme } from '@/api/themes'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()
const themes = ref<Theme[]>([])
const loading = ref(true)

const showModal = ref(false)
const editTarget = ref<Theme | null>(null)
const saving = ref(false)
const formError = ref('')

const bgFile = ref<File | null>(null)
const svgaFile = ref<File | null>(null)

const form = ref({
  name: '',
  gradientFrom: '#1E1A3C',
  gradientTo: '#2A2550',
  accentColor: '#7c3aed',
  chatBubbleColor: '#2A2550',
  storeItemId: '',
  coinCost: 0,
})

const openSections = ref({
  basicInfo: true,
  appearance: true,
  assets: false,
  store: false,
  details: false,
})

function toggleSection(key: keyof typeof openSections.value) {
  openSections.value[key] = !openSections.value[key]
}

const deleteTarget = ref<Theme | null>(null)
const deleteLoading = ref(false)

async function fetchThemes() {
  loading.value = true
  try {
    themes.value = await themesApi.listThemes()
  } catch (e: any) {
    toast.error('Failed to load themes', e?.message)
  }
  loading.value = false
}

function resetSections() {
  openSections.value = { basicInfo: true, appearance: true, assets: false, store: false, details: false }
}

function openCreate() {
  formError.value = ''
  editTarget.value = null
  form.value = { name: '', gradientFrom: '#1E1A3C', gradientTo: '#2A2550', accentColor: '#7c3aed', chatBubbleColor: '#2A2550', storeItemId: '', coinCost: 0 }
  bgFile.value = null
  svgaFile.value = null
  resetSections()
  showModal.value = true
}

function openEdit(t: Theme) {
  formError.value = ''
  editTarget.value = t
  form.value = {
    name: t.name,
    gradientFrom: t.gradientFrom,
    gradientTo: t.gradientTo,
    accentColor: t.accentColor,
    chatBubbleColor: t.chatBubbleColor,
    storeItemId: t.storeItemId ?? '',
    coinCost: t.storeItem?.coinCost ?? 0,
  }
  bgFile.value = null
  svgaFile.value = null
  resetSections()
  showModal.value = true
}

async function save() {
  formError.value = ''
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('name', form.value.name)
    fd.append('gradientFrom', form.value.gradientFrom)
    fd.append('gradientTo', form.value.gradientTo)
    fd.append('accentColor', form.value.accentColor)
    fd.append('chatBubbleColor', form.value.chatBubbleColor)
    fd.append('coinCost', String(form.value.coinCost))
    if (form.value.storeItemId) fd.append('storeItemId', form.value.storeItemId)
    if (bgFile.value) fd.append('backgroundImage', bgFile.value)
    if (svgaFile.value) fd.append('svga', svgaFile.value)

    if (editTarget.value) {
      await themesApi.updateTheme(editTarget.value.id, fd)
      toast.success('Theme Updated')
    } else {
      await themesApi.createTheme(fd)
      toast.success('Theme Created')
    }
    showModal.value = false
    await fetchThemes()
  } catch (e: any) {
    formError.value = e?.message || 'Failed to save theme'
  }
  saving.value = false
}

async function remove() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await themesApi.deleteTheme(deleteTarget.value.id)
    toast.success('Theme Deleted')
    deleteTarget.value = null
    await fetchThemes()
  } catch (e: any) {
    toast.error('Delete Failed', e?.message)
  }
  deleteLoading.value = false
}

onMounted(fetchThemes)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-title">Theme Management</h2>
      <button v-if="auth.hasPermission('gift.manage')" class="btn btn-primary" @click="openCreate">+ New Theme</button>
    </div>

    <div v-if="loading" class="loading">Loading themes...</div>

    <div v-else-if="themes.length === 0" class="empty">
      <div class="empty-icon">🎨</div>
      <div class="empty-title">No themes yet</div>
      <div class="empty-sub">Create room and chat themes that users can purchase and apply.</div>
    </div>

    <div v-else class="themes-grid">
      <div v-for="t in themes" :key="t.id" class="theme-card">
        <div
          class="theme-preview"
          :style="{
            background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})`,
          }"
        >
          <img v-if="t.backgroundImageUrl" :src="t.backgroundImageUrl" class="preview-bg-img" alt="" />
          <div class="preview-swatches">
            <span class="swatch" :style="{ background: t.accentColor }" title="Accent"></span>
            <span class="swatch" :style="{ background: t.chatBubbleColor }" title="Chat bubble"></span>
          </div>
          <div v-if="t.storeItem" class="preview-price">
            {{ t.storeItem.coinCost }} coins
          </div>
          <div v-else class="preview-price free-badge">Free</div>
        </div>
        <div class="theme-body">
          <div class="theme-name">{{ t.name }}</div>
          <div class="theme-meta">
            <span class="meta-pill">{{ t.gradientFrom }}</span>
            <span class="meta-pill">{{ t.gradientTo }}</span>
          </div>
          <div v-if="t.svgaUrl" class="theme-svga">SVGA: {{ t.svgaUrl }}</div>
        </div>
        <div v-if="auth.hasPermission('gift.manage')" class="theme-actions">
          <button class="btn-row" @click="openEdit(t)">Edit</button>
          <button class="btn-row danger" @click="deleteTarget = t">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Create/Edit modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>{{ editTarget ? 'Edit Theme' : 'New Theme' }}</h3>
          <button class="btn-close" @click="showModal = false">✕</button>
        </div>
        <div class="modal-body">

          <!-- ── Section 1: Basic Info ── -->
          <div class="accordion-section">
            <button class="accordion-header" @click="toggleSection('basicInfo')">
              <span class="accordion-title">Basic Info</span>
              <span class="accordion-chevron" :class="{ open: openSections.basicInfo }">›</span>
            </button>
            <div v-show="openSections.basicInfo" class="accordion-body">
              <div class="form-group">
                <label>Theme Name</label>
                <input v-model="form.name" class="form-input" placeholder="e.g. Midnight Purple" required />
              </div>
              <div class="form-group">
                <label>Coin Cost</label>
                <div class="coin-cost-row">
                  <span class="coin-prefix">🪙</span>
                  <input
                    v-model.number="form.coinCost"
                    type="number"
                    min="0"
                    step="1"
                    class="form-input coin-input"
                    placeholder="0"
                  />
                  <span class="coin-suffix">coins</span>
                </div>
                <div class="file-hint" :class="form.coinCost > 0 ? 'paid-hint' : ''">
                  {{ form.coinCost > 0 ? `🪙 ${form.coinCost} coins — a Store Item will be auto-created` : 'Set to 0 for a free theme' }}
                </div>
              </div>
            </div>
          </div>

          <!-- ── Section 2: Appearance ── -->
          <div class="accordion-section">
            <button class="accordion-header" @click="toggleSection('appearance')">
              <span class="accordion-title">Appearance</span>
              <div class="accordion-header-meta">
                <span class="color-dot" :style="{ background: form.gradientFrom }"></span>
                <span class="color-dot" :style="{ background: form.gradientTo }"></span>
                <span class="color-dot" :style="{ background: form.accentColor }"></span>
                <span class="color-dot" :style="{ background: form.chatBubbleColor }"></span>
              </div>
              <span class="accordion-chevron" :class="{ open: openSections.appearance }">›</span>
            </button>
            <div v-show="openSections.appearance" class="accordion-body">
              <div class="section-label">Gradient</div>
              <div class="form-row">
                <div class="form-group">
                  <label>From</label>
                  <div class="color-row">
                    <input type="color" v-model="form.gradientFrom" class="color-picker" />
                    <input v-model="form.gradientFrom" class="form-input" placeholder="#1E1A3C" />
                  </div>
                </div>
                <div class="form-group">
                  <label>To</label>
                  <div class="color-row">
                    <input type="color" v-model="form.gradientTo" class="color-picker" />
                    <input v-model="form.gradientTo" class="form-input" placeholder="#2A2550" />
                  </div>
                </div>
              </div>
              <div class="section-label" style="margin-top: 8px;">UI Colors</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Accent</label>
                  <div class="color-row">
                    <input type="color" v-model="form.accentColor" class="color-picker" />
                    <input v-model="form.accentColor" class="form-input" placeholder="#7c3aed" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Chat Bubble</label>
                  <div class="color-row">
                    <input type="color" v-model="form.chatBubbleColor" class="color-picker" />
                    <input v-model="form.chatBubbleColor" class="form-input" placeholder="#2A2550" />
                  </div>
                </div>
              </div>
              <div class="gradient-preview" :style="{ background: `linear-gradient(135deg, ${form.gradientFrom}, ${form.gradientTo})` }">
                <span class="gradient-preview-label">Preview</span>
                <div class="gradient-swatches">
                  <span class="swatch" :style="{ background: form.accentColor }" title="Accent"></span>
                  <span class="swatch" :style="{ background: form.chatBubbleColor }" title="Chat bubble"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Section 3: Assets ── -->
          <div class="accordion-section">
            <button class="accordion-header" @click="toggleSection('assets')">
              <span class="accordion-title">Assets</span>
              <div v-if="bgFile || svgaFile || editTarget?.backgroundImageUrl || editTarget?.svgaUrl" class="accordion-badge">
                {{ [bgFile || editTarget?.backgroundImageUrl, svgaFile || editTarget?.svgaUrl].filter(Boolean).length }} file(s)
              </div>
              <span class="accordion-chevron" :class="{ open: openSections.assets }">›</span>
            </button>
            <div v-show="openSections.assets" class="accordion-body">
              <div class="form-group">
                <label>Background Image</label>
                <input
                  type="file"
                  accept="image/*"
                  class="form-input file-input"
                  @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; bgFile = f ?? null }"
                />
                <div v-if="bgFile" class="file-hint">Selected: {{ bgFile.name }}</div>
                <div v-else-if="editTarget?.backgroundImageUrl" class="file-hint existing">
                  Current: {{ editTarget.backgroundImageUrl }}
                </div>
              </div>
              <div class="form-group">
                <label>SVGA Animation</label>
                <input
                  type="file"
                  accept=".svga"
                  class="form-input file-input"
                  @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; svgaFile = f ?? null }"
                />
                <div v-if="svgaFile" class="file-hint">Selected: {{ svgaFile.name }}</div>
                <div v-else-if="editTarget?.svgaUrl" class="file-hint existing">
                  Current: {{ editTarget.svgaUrl }}
                </div>
              </div>
            </div>
          </div>

          <!-- ── Section 4: Store & Availability ── -->
          <div class="accordion-section">
            <button class="accordion-header" @click="toggleSection('store')">
              <span class="accordion-title">Store & Availability</span>
              <div class="accordion-badge" :class="editTarget?.storeItem ? 'paid' : 'free-tag'">
                {{ editTarget?.storeItem ? 'Paid' : 'Free' }}
              </div>
              <span class="accordion-chevron" :class="{ open: openSections.store }">›</span>
            </button>
            <div v-show="openSections.store" class="accordion-body">
              <div class="form-group">
                <label>Store Item ID</label>
                <input v-model="form.storeItemId" class="form-input" placeholder="Leave blank for free theme" />
                <div class="file-hint">Link an existing Store Item UUID to make this theme purchasable.</div>
              </div>
              <div v-if="editTarget?.storeItem" class="store-item-card">
                <div class="store-item-row">
                  <span class="store-item-label">Item Name</span>
                  <span class="store-item-value">{{ editTarget.storeItem.name }}</span>
                </div>
                <div class="store-item-row">
                  <span class="store-item-label">Coin Cost</span>
                  <span class="store-item-value highlight">🪙 {{ editTarget.storeItem.coinCost }}</span>
                </div>
                <div class="store-item-row">
                  <span class="store-item-label">Item ID</span>
                  <span class="store-item-value mono">{{ editTarget.storeItem.id }}</span>
                </div>
              </div>
              <div v-else class="store-empty-note">
                No store item linked — this theme will be available for free.
              </div>
            </div>
          </div>

          <!-- ── Section 5: Theme Details (edit only) ── -->
          <div v-if="editTarget" class="accordion-section">
            <button class="accordion-header" @click="toggleSection('details')">
              <span class="accordion-title">Theme Details</span>
              <span class="accordion-chevron" :class="{ open: openSections.details }">›</span>
            </button>
            <div v-show="openSections.details" class="accordion-body">
              <div class="details-grid">
                <div class="detail-row">
                  <span class="detail-label">Special ID</span>
                  <span class="detail-value mono selectable">{{ editTarget.id }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Theme Name</span>
                  <span class="detail-value">{{ editTarget.name }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Created At</span>
                  <span class="detail-value">{{ new Date(editTarget.createdAt).toLocaleString() }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status</span>
                  <span class="detail-value">
                    <span class="status-pill" :class="editTarget.storeItem ? 'status-paid' : 'status-free'">
                      {{ editTarget.storeItem ? 'Store Item — ' + editTarget.storeItem.coinCost + ' coins' : 'Free' }}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="formError" class="form-error">{{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving...' : (editTarget ? 'Save Changes' : 'Create Theme') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Delete Theme</h3>
          <button class="btn-close" @click="deleteTarget = null">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-sub">Delete theme <strong>{{ deleteTarget.name }}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteTarget = null">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="remove">
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

.themes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.theme-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }

.theme-preview {
  position: relative;
  height: 120px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 10px;
}
.preview-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.35;
}
.preview-swatches {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 6px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.5);
  display: inline-block;
}
.preview-price {
  position: relative;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}
.free-badge { background: rgba(34,201,122,0.75); }

.theme-body { padding: 12px 14px 8px; }
.theme-name { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.theme-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.meta-pill {
  padding: 2px 8px;
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  color: var(--text-muted);
}
.theme-svga { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.theme-actions { padding: 0 14px 12px; display: flex; gap: 6px; }
.btn-row { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; }
.btn-row.danger { color: #FF4D4D; border-color: #FF4D4D; }
.btn-row:hover { background: var(--row-hover); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(560px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); flex-shrink: 0; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.modal-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--card-border); display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.modal-sub { margin: 0; font-size: 14px; color: var(--text-muted); }
.form-row { display: flex; gap: 12px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: var(--primary); }
.file-input { height: auto; padding: 8px 12px; }
.color-row { display: flex; gap: 8px; align-items: center; }
.color-picker { width: 38px; height: 38px; padding: 2px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--content-bg); cursor: pointer; flex-shrink: 0; }
.file-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-hint.existing { color: var(--primary); }
.form-error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }

/* ── Accordion ── */
.accordion-section {
  border: 1px solid var(--card-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--content-bg);
}
.accordion-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.15s;
}
.accordion-header:hover { background: var(--row-hover); }
.accordion-title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}
.accordion-header-meta {
  display: flex;
  gap: 4px;
  align-items: center;
}
.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.25);
  display: inline-block;
  flex-shrink: 0;
}
.accordion-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--card-border);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.accordion-badge.paid { background: rgba(251,191,36,0.2); color: #d97706; }
.accordion-badge.free-tag { background: rgba(34,197,94,0.15); color: #16a34a; }
.accordion-chevron {
  font-size: 18px;
  color: var(--text-muted);
  line-height: 1;
  transition: transform 0.2s;
  display: inline-block;
  transform: rotate(0deg);
}
.accordion-chevron.open { transform: rotate(90deg); }
.accordion-body {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--card-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Section label divider ── */
.section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
}

/* ── Coin cost input ── */
.coin-cost-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.coin-prefix { font-size: 16px; flex-shrink: 0; }
.coin-input { flex: 1; }
.coin-suffix { font-size: 12px; color: var(--text-muted); flex-shrink: 0; font-weight: 600; }
.paid-hint { color: #d97706 !important; }

/* ── Gradient preview ── */
.gradient-preview {
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}
.gradient-preview-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.gradient-swatches { display: flex; gap: 6px; }

/* ── Store item card ── */
.store-item-card {
  border: 1px solid var(--card-border);
  border-radius: 8px;
  overflow: hidden;
}
.store-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid var(--card-border);
  font-size: 12px;
}
.store-item-row:last-child { border-bottom: none; }
.store-item-label { color: var(--text-muted); font-weight: 600; }
.store-item-value { color: var(--text-primary); }
.store-item-value.highlight { color: #d97706; font-weight: 700; }
.store-item-value.mono { font-family: monospace; font-size: 10px; color: var(--text-muted); }
.store-empty-note {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px;
  text-align: center;
  background: var(--card-bg);
  border-radius: 6px;
  border: 1px dashed var(--card-border);
}

/* ── Theme Details grid ── */
.details-grid { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden; }
.detail-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 12px;
  border-bottom: 1px solid var(--card-border);
  font-size: 12px;
  gap: 12px;
}
.detail-row:last-child { border-bottom: none; }
.detail-label {
  width: 96px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 11px;
  padding-top: 1px;
}
.detail-value { color: var(--text-primary); word-break: break-all; }
.detail-value.mono { font-family: monospace; font-size: 10px; }
.selectable { user-select: all; cursor: text; }
.status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.status-paid { background: rgba(251,191,36,0.15); color: #d97706; }
.status-free { background: rgba(34,197,94,0.12); color: #16a34a; }
</style>
