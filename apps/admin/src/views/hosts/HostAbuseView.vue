<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listMultiAgencyAbuse } from '@/api/hosts'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const loading = ref(false)
const windowSize = ref<'7d' | '30d'>('30d')
const minChanges = ref(2)
const items = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    const res = await listMultiAgencyAbuse({ window: windowSize.value, minChanges: minChanges.value })
    items.value = res.items ?? []
  } catch (e: any) {
    toast.error(e?.message || 'Failed to load abuse signals')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2 class="page-title">Multi-Agency Abuse</h2>
        <div class="page-sub">Hosts flagged for frequent agency changes within a time window</div>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-secondary" @click="load">Refresh</button>
      </div>
    </div>

    <div class="filter-bar">
      <select v-model="windowSize" class="form-input filter-select" @change="load">
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
      <input
        v-model.number="minChanges"
        type="number"
        min="1"
        max="50"
        class="form-input filter-num"
        placeholder="Min changes"
        @keyup.enter="load"
      />
      <button class="btn btn-primary" @click="load">Apply</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading abuse signals…</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Host</th>
            <th>Haka ID</th>
            <th>Current Agency</th>
            <th>Changes</th>
            <th>Last Change</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.hostId">
            <td class="fw">{{ r.displayName }}</td>
            <td class="dim mono">{{ r.hakaId ?? '—' }}</td>
            <td class="dim">{{ r.currentAgency?.name ?? '—' }}</td>
            <td class="fw">{{ r.changeCount }}</td>
            <td class="dim">{{ r.lastChangeAt ? new Date(r.lastChangeAt).toLocaleString() : '—' }}</td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="5" class="empty">No flagged hosts.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.page-sub { margin-top: 3px; font-size: 12px; color: var(--text-muted); }
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.filter-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.filter-select { width: auto; min-width: 140px; }
.filter-num { width: 120px; }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--content-bg); color: var(--text-primary); border: 1px solid var(--card-border); }
.btn-secondary:hover { background: var(--row-hover); }

.form-input { height: 38px; padding: 0 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--content-bg); color: var(--text-primary); outline: none; }
.form-input:focus { border-color: var(--primary); }
select.form-input { cursor: pointer; }

.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; white-space: nowrap; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; }
.empty { padding: 26px 16px; text-align: center; color: var(--text-muted); }
</style>
