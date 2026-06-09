<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as paymentsApi from '@/api/payments'
import type { CurrencyRate } from '@/api/payments'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const rows = ref<CurrencyRate[]>([])
const loading = ref(true)
const syncing = ref(false)
const importing = ref(false)
const searchQuery = ref('')
const activeFilter = ref<'' | 'active' | 'inactive'>('')
const selectedCodes = ref<Set<string>>(new Set())

type FormState = {
  id: string | null
  countryCode: string
  countryName: string
  currency: string
  symbol: string
  usdRate: number
  minWithdrawalBeans: number
  isActive: boolean
}

const emptyForm = (): FormState => ({
  id: null,
  countryCode: '',
  countryName: '',
  currency: '',
  symbol: '',
  usdRate: 1,
  minWithdrawalBeans: 10000,
  isActive: true,
})

const modalOpen = ref(false)
const form = ref<FormState>(emptyForm())
const saving = ref(false)

const COUNTRY_CODE_RE = /^[A-Z]{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/

const errors = computed(() => {
  const f = form.value
  return {
    countryCode: f.countryCode && !COUNTRY_CODE_RE.test(f.countryCode.toUpperCase())
      ? 'Must be 2 letters (e.g. US, IN, BD)' : '',
    countryName: '',
    currency: f.currency && !CURRENCY_RE.test(f.currency.toUpperCase())
      ? 'Must be 3 letters (e.g. USD, INR, BDT)' : '',
    symbol: '',
    usdRate: f.usdRate <= 0 ? 'Rate must be greater than 0' : '',
  }
})

const filteredRows = computed(() => {
  let list = rows.value
  if (activeFilter.value === 'active') list = list.filter((r) => r.isActive)
  else if (activeFilter.value === 'inactive') list = list.filter((r) => !r.isActive)
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (r) =>
      r.countryName.toLowerCase().includes(q) ||
      r.countryCode.toLowerCase().includes(q) ||
      r.currency.toLowerCase().includes(q),
  )
})

const allFilteredSelected = computed(() => {
  const visible = filteredRows.value
  return visible.length > 0 && visible.every((r) => selectedCodes.value.has(r.countryCode))
})

const canSave = computed(() => {
  const f = form.value
  const e = errors.value
  return (
    COUNTRY_CODE_RE.test(f.countryCode.toUpperCase()) &&
    f.countryName.trim().length > 0 &&
    CURRENCY_RE.test(f.currency.toUpperCase()) &&
    f.symbol.trim().length > 0 &&
    f.usdRate > 0 &&
    !e.countryCode && !e.currency && !e.usdRate
  )
})

async function fetchRates() {
  loading.value = true
  try {
    rows.value = await paymentsApi.listCurrencies()
  } catch (e: any) {
    toast.error('Failed to load', e?.message)
  }
  loading.value = false
}

function openAdd() {
  form.value = emptyForm()
  modalOpen.value = true
}

function openEdit(row: CurrencyRate) {
  form.value = {
    id: row.id,
    countryCode: row.countryCode,
    countryName: row.countryName,
    currency: row.currency,
    symbol: row.symbol,
    usdRate: row.usdRate,
    minWithdrawalBeans: row.minWithdrawalBeans ?? 10000,
    isActive: row.isActive,
  }
  modalOpen.value = true
}

function toggleSelect(code: string) {
  const next = new Set(selectedCodes.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  selectedCodes.value = next
}

function toggleSelectAll() {
  if (allFilteredSelected.value) {
    selectedCodes.value = new Set()
  } else {
    selectedCodes.value = new Set(filteredRows.value.map((r) => r.countryCode))
  }
}

async function submit() {
  if (!canSave.value) return
  saving.value = true
  try {
    await paymentsApi.upsertCurrency({
      countryCode: form.value.countryCode.toUpperCase(),
      countryName: form.value.countryName,
      currency: form.value.currency.toUpperCase(),
      symbol: form.value.symbol,
      usdRate: Number(form.value.usdRate),
      minWithdrawalBeans: Number(form.value.minWithdrawalBeans),
      isActive: form.value.isActive,
    })
    toast.success('Currency saved')
    modalOpen.value = false
    await fetchRates()
  } catch (e: any) {
    toast.error('Save failed', e?.message)
  }
  saving.value = false
}

async function remove(row: CurrencyRate) {
  if (!confirm(`Delete ${row.countryName} (${row.currency})?`)) return
  try {
    await paymentsApi.deleteCurrency(row.countryCode)
    toast.success('Deleted')
    await fetchRates()
  } catch (e: any) {
    toast.error('Delete failed', e?.message)
  }
}

async function runSync() {
  syncing.value = true
  try {
    const r = await paymentsApi.syncCurrencies()
    toast.success('FX synced', `Updated ${r.updated}, skipped ${r.skipped}`)
    await fetchRates()
  } catch (e: any) {
    toast.error('Sync failed', e?.message)
  }
  syncing.value = false
}

async function runImport() {
  if (!confirm('Import all countries from FX API? This may take a minute.')) return
  importing.value = true
  try {
    const r = await paymentsApi.importCurrencies()
    toast.success(
      'Import complete',
      `Created ${r.created}, updated ${r.updated}, skipped ${r.skipped}`,
    )
    await fetchRates()
  } catch (e: any) {
    toast.error('Import failed', e?.message)
  }
  importing.value = false
}

async function bulkSetActive(isActive: boolean) {
  const codes = [...selectedCodes.value]
  if (codes.length === 0) {
    toast.error('No selection', 'Select at least one country.')
    return
  }
  try {
    const r = await paymentsApi.bulkActivateCurrencies(codes, isActive)
    toast.success(isActive ? 'Activated' : 'Deactivated', `${r.updated} markets updated`)
    selectedCodes.value = new Set()
    await fetchRates()
  } catch (e: any) {
    toast.error('Bulk update failed', e?.message)
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

onMounted(fetchRates)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Currency Rates</h2>
      <span class="stat-pill">Total: {{ rows.length }}</span>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary" @click="openAdd">+ Add Currency</button>
      <button class="btn btn-secondary" :disabled="importing" @click="runImport">
        {{ importing ? 'Importing…' : 'Import all from FX API' }}
      </button>
      <button class="btn btn-secondary" :disabled="syncing" @click="runSync">
        {{ syncing ? 'Syncing…' : 'Sync rates' }}
      </button>
      <button
        class="btn btn-secondary"
        :disabled="selectedCodes.size === 0"
        @click="bulkSetActive(true)"
      >
        Activate selected
      </button>
      <button
        class="btn btn-secondary"
        :disabled="selectedCodes.size === 0"
        @click="bulkSetActive(false)"
      >
        Deactivate selected
      </button>
    </div>
    <div class="filter-row">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="Search country or currency…"
      />
      <select v-model="activeFilter" class="filter-select">
        <option value="">All</option>
        <option value="active">Active only</option>
        <option value="inactive">Inactive only</option>
      </select>
      <span class="stat-pill dim">Showing {{ filteredRows.length }} of {{ rows.length }}</span>
    </div>
    <p class="help-text">
      Import all countries from the public FX API, then activate markets for users. Manual rows keep their rate on sync.
    </p>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="filteredRows.length === 0" class="loading">No currencies match your filters.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th class="chk-col">
              <input type="checkbox" :checked="allFilteredSelected" @change="toggleSelectAll" />
            </th>
            <th>Country</th>
            <th>Code</th>
            <th>Currency</th>
            <th>Symbol</th>
            <th>1 USD =</th>
            <th>Min beans</th>
            <th>Source</th>
            <th>Last Sync</th>
            <th>Active</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRows" :key="r.id">
            <td class="chk-col">
              <input
                type="checkbox"
                :checked="selectedCodes.has(r.countryCode)"
                @change="toggleSelect(r.countryCode)"
              />
            </td>
            <td>{{ r.countryName }}</td>
            <td><code>{{ r.countryCode }}</code></td>
            <td>{{ r.currency }}</td>
            <td>{{ r.symbol }}</td>
            <td>{{ r.usdRate.toLocaleString() }}</td>
            <td>{{ (r.minWithdrawalBeans ?? 10000).toLocaleString() }}</td>
            <td>
              <span :class="['badge', r.source === 'manual' ? 'badge-purple' : 'badge-blue']">
                {{ r.source }}
              </span>
            </td>
            <td>{{ formatDate(r.lastSyncedAt) }}</td>
            <td>
              <span :class="['badge', r.isActive ? 'badge-green' : 'badge-gray']">
                {{ r.isActive ? 'Yes' : 'No' }}
              </span>
            </td>
            <td class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem @click="openEdit(r)">Edit</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="remove(r)">Delete</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="modalOpen = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ form.id ? 'Edit Currency' : 'Add Currency' }}</h3>
          <button class="modal-close" @click="modalOpen = false">×</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Country Code (ISO 3166) <span class="req">*</span></label>
            <input
              v-model="form.countryCode"
              maxlength="2"
              placeholder="US"
              :class="{ 'has-error': errors.countryCode }"
              @input="form.countryCode = form.countryCode.toUpperCase().replace(/[^A-Z]/g, '')"
            />
            <p v-if="errors.countryCode" class="field-error">{{ errors.countryCode }}</p>
          </div>
          <div class="field">
            <label>Country Name <span class="req">*</span></label>
            <input v-model="form.countryName" placeholder="United States" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Currency (ISO 4217) <span class="req">*</span></label>
              <input
                v-model="form.currency"
                maxlength="3"
                placeholder="USD"
                :class="{ 'has-error': errors.currency }"
                @input="form.currency = form.currency.toUpperCase().replace(/[^A-Z]/g, '')"
              />
              <p v-if="errors.currency" class="field-error">{{ errors.currency }}</p>
            </div>
            <div class="field">
              <label>Symbol <span class="req">*</span></label>
              <input v-model="form.symbol" placeholder="$" />
            </div>
          </div>
          <div class="field">
            <label>Rate (1 USD = ?) <span class="req">*</span></label>
            <input
              v-model.number="form.usdRate"
              type="number"
              step="0.0001"
              min="0"
              :class="{ 'has-error': errors.usdRate }"
            />
            <p v-if="errors.usdRate" class="field-error">{{ errors.usdRate }}</p>
          </div>
          <div class="field">
            <label>Min withdrawal (beans)</label>
            <input v-model.number="form.minWithdrawalBeans" type="number" min="1" step="1" />
          </div>
          <div class="field">
            <label class="checkbox-label">
              <input v-model="form.isActive" type="checkbox" />
              <span>Active (visible to users)</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="modalOpen = false">Cancel</button>
          <button class="btn btn-primary" :disabled="saving || !canSave" @click="submit">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }

.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.filter-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: -8px; }
.search-input {
  flex: 1; min-width: 200px; height: 38px; padding: 0 12px;
  border: 1px solid var(--card-border); border-radius: 8px; font-size: 14px;
}
.filter-select {
  height: 38px; padding: 0 12px; border: 1px solid var(--card-border);
  border-radius: 8px; font-size: 13px; background: #fff;
}
.chk-col { width: 40px; text-align: center; }
.stat-pill.dim { background: transparent; padding: 0; }
.help-text { margin: -8px 0 0; color: var(--text-muted); font-size: 12px; }
.help-text code {
  background: #F1F5F9; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; color: var(--primary-dark); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.btn { height: 38px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-secondary:hover { background: #e4e4e7; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700;
  text-transform: uppercase; color: var(--text-muted); background: #F8FAFC;
  letter-spacing: 0.04em;
}
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.data-table tbody tr:hover { background: var(--row-hover); }
.data-table code {
  background: #F1F5F9; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dim { color: var(--text-muted); }

.badge { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; display: inline-block; }
.badge-purple { background: var(--primary-soft); color: var(--primary-dark); }
.badge-blue { background: var(--info-soft); color: #1E6FD9; }
.badge-green { background: var(--success-soft); color: #15803d; }
.badge-gray { background: var(--muted-soft); color: var(--text-muted); }

.actions-cell { display: flex; gap: 6px; }
.btn-sm {
  height: 28px; padding: 0 12px; font-size: 12px; border-radius: 6px;
  border: 1px solid var(--card-border); background: #fff; color: var(--text-primary); cursor: pointer; font-weight: 500;
}
.btn-sm:hover { background: #F8FAFC; border-color: #CBD5E1; }
.btn-sm.btn-danger { border-color: #FECACA; color: var(--danger); }
.btn-sm.btn-danger:hover { background: #FEF2F2; border-color: #FCA5A5; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: #fff; border-radius: 12px; width: 460px; max-width: 90vw;
  box-shadow: 0 25px 80px rgba(0,0,0,.25); overflow: hidden;
  border-top: 3px solid var(--primary);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--card-border);
}
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.modal-close {
  background: none; border: none; font-size: 22px; line-height: 1;
  color: var(--text-muted); cursor: pointer; padding: 0 4px;
}
.modal-close:hover { color: var(--text-primary); }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid var(--card-border); background: #FAFBFC;
}

.field { margin-bottom: 14px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
.field input {
  width: 100%; height: 38px; padding: 0 12px;
  border: 1px solid var(--card-border); border-radius: 6px;
  font-size: 14px; background: #fff; outline: none; box-sizing: border-box;
}
.field input:focus { border-color: var(--primary); }
.field input.has-error { border-color: var(--danger); background: #FEF2F2; }
.field input.has-error:focus { border-color: var(--danger); }
.field-error { margin: 4px 0 0; font-size: 11px; color: var(--danger); }
.req { color: var(--danger); }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-weight: 400; cursor: pointer; }
.checkbox-label input { width: auto; height: auto; }
</style>
