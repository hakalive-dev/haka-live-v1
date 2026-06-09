<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as settingsApi from '@/api/settings'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const settings = ref<any[]>([])
const loading = ref(true)
const showForm = ref(false)
const editingKey = ref('')
const form = ref({ key: '', value: '' })
const formError = ref('')
const deleteConfirm = ref<string | null>(null)

async function fetchSettings() {
  loading.value = true
  try { settings.value = await settingsApi.listSettings() } catch {}
  loading.value = false
}

function openCreate() {
  editingKey.value = ''
  form.value = { key: '', value: '' }
  showForm.value = true
}

function openEdit(setting: any) {
  editingKey.value = setting.key
  form.value = { key: setting.key, value: JSON.stringify(setting.value, null, 2) }
  showForm.value = true
}

async function handleSubmit() {
  formError.value = ''
  try {
    let parsed: unknown
    try { parsed = JSON.parse(form.value.value) } catch { parsed = form.value.value }
    const key = editingKey.value || form.value.key
    await settingsApi.upsertSetting(key, parsed)
    showForm.value = false
    await fetchSettings()
  } catch (err: any) { formError.value = err.message }
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  const key = deleteConfirm.value
  deleteConfirm.value = null
  try { await settingsApi.deleteSetting(key); await fetchSettings() } catch {}
}

onMounted(fetchSettings)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <h2 class="page-subtitle">System Settings</h2>
      <button v-if="auth.isSuperAdmin" class="btn btn-primary" @click="openCreate">+ Add Setting</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading...</div>
      <table v-else-if="settings.length" class="data-table">
        <thead><tr><th>Key</th><th>Value</th><th>Updated By</th><th>Updated</th><th v-if="auth.isSuperAdmin" class="actions-th">Actions</th></tr></thead>
        <tbody>
          <tr v-for="s in settings" :key="s.id">
            <td class="cell-primary">{{ s.key }}</td>
            <td><code class="value-code">{{ JSON.stringify(s.value) }}</code></td>
            <td class="dim">{{ s.updatedBy || '—' }}</td>
            <td class="dim">{{ new Date(s.updatedAt).toLocaleString() }}</td>
            <td v-if="auth.isSuperAdmin" class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem @click="openEdit(s)">Edit</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="deleteConfirm = s.key">Delete</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state">No settings configured yet</div>
    </div>

    <Teleport to="body">
      <!-- Delete confirm modal -->
      <div v-if="deleteConfirm" class="modal-overlay" @click.self="deleteConfirm = null">
        <div class="modal-box">
          <h3>Delete Setting</h3>
          <p class="modal-sub">Delete <code class="key-chip">{{ deleteConfirm }}</code>? This cannot be undone.</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="deleteConfirm = null">Cancel</button>
            <button class="btn btn-del-confirm" @click="confirmDelete">Yes, Delete</button>
          </div>
        </div>
      </div>

      <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
        <div class="modal-box">
          <h3>{{ editingKey ? `Edit: ${editingKey}` : 'Add Setting' }}</h3>
          <div v-if="formError" class="form-error">{{ formError }}</div>
          <form @submit.prevent="handleSubmit" class="settings-form">
            <div class="form-group" v-if="!editingKey">
              <label>Key</label>
              <input v-model="form.key" required class="form-input" placeholder="e.g. maintenance_mode" />
            </div>
            <div class="form-group">
              <label>Value (JSON or string)</label>
              <textarea v-model="form.value" class="form-textarea" rows="4" placeholder='e.g. true or {"key": "value"}'></textarea>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="showForm = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.page-subtitle { font-size: 16px; font-weight: 600; margin: 0; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.empty-state { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; }
.cell-primary { font-weight: 600; color: var(--primary); }
.value-code { background: var(--content-bg); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.dim { color: var(--text-muted); font-size: 12px; }
.action-btns { display: flex; gap: 6px; }
.btn-edit { padding: 4px 10px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-del { padding: 4px 10px; background: #fff; color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; font-size: 12px; cursor: pointer; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--card-bg); border-radius: 16px; padding: 24px; min-width: min(480px, 95vw); }
.modal-sub { font-size: 14px; color: var(--text-muted); margin: 8px 0 20px; }
.key-chip { background: var(--content-bg); padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 13px; }
.btn-del-confirm { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; background: var(--danger); color: #fff; }
.modal-box h3 { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
.form-error { background: var(--danger-soft); color: var(--danger); padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.settings-form { display: flex; flex-direction: column; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; outline: none; }
.form-textarea { padding: 10px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; font-family: monospace; outline: none; resize: vertical; }
.form-input:focus, .form-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
