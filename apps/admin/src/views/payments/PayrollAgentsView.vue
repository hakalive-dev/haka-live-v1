<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as paymentsApi from '@/api/payments'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const agents = ref<paymentsApi.PayrollAgentRow[]>([])
const loading = ref(true)
const countryFilter = ref('')

const createModal = ref(false)
const createHakaId = ref('')
const createCountry = ref('IN')
const createCommission = ref(5)

async function fetchData() {
  loading.value = true
  try {
    agents.value = await paymentsApi.listPayrollAgentProfiles(
      countryFilter.value || undefined,
    )
  } catch {}
  loading.value = false
}

async function submitCreate() {
  try {
    await paymentsApi.createPayrollAgent({
      hakaId: createHakaId.value.trim(),
      countryCode: createCountry.value,
      commissionPercent: createCommission.value,
    })
    toast.success('Payroll agent created — agency agents keep agent role and gain Payroll on Profile')
    createModal.value = false
    createHakaId.value = ''
    await fetchData()
  } catch (e: any) {
    toast.error('Create failed', e?.message)
  }
}

async function toggleStatus(row: paymentsApi.PayrollAgentRow) {
  const next = row.status === 'active' ? 'frozen' : 'active'
  try {
    await paymentsApi.updatePayrollAgent(row.userId, { status: next })
    toast.success(`Agent ${next}`)
    await fetchData()
  } catch (e: any) {
    toast.error('Update failed', e?.message)
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Payroll agents</h2>
      <button class="btn btn-primary" @click="createModal = true">Add agent</button>
    </div>

    <p class="hint">
      Country payroll holders for bean withdrawals. One active agent per country is enforced.
    </p>

    <div class="toolbar">
      <input
        v-model="countryFilter"
        class="search-input"
        placeholder="Filter country (e.g. IN)"
        maxlength="2"
        @keyup.enter="fetchData"
      />
      <button class="btn btn-primary" @click="fetchData">Filter</button>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="agents.length === 0" class="empty">No payroll agents.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Payroll ID</th>
            <th>Country</th>
            <th>Commission %</th>
            <th>Status</th>
            <th>Take orders</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in agents" :key="a.userId">
            <td>
              <div class="bold">{{ a.user.displayName }}</div>
              <div class="dim small">Haka ID: {{ a.user.hakaId ?? '—' }}</div>
            </td>
            <td class="mono">{{ a.payrollId }}</td>
            <td>{{ a.countryCode }}</td>
            <td>{{ a.commissionPercent }}%</td>
            <td>{{ a.status }}</td>
            <td>{{ a.acceptingOrders ? 'Yes' : 'No' }}</td>
            <td class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem
                  :variant="a.status === 'active' ? 'warning' : 'success'"
                  @click="toggleStatus(a)"
                >
                  {{ a.status === 'active' ? 'Freeze' : 'Activate' }}
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="createModal" class="modal-overlay" @click.self="createModal = false">
      <div class="modal">
        <h3>Add payroll agent</h3>
        <div class="form-group">
          <label>Haka ID</label>
          <input
            v-model="createHakaId"
            class="search-input full"
            placeholder="e.g. 123456"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <label>Country code</label>
          <input v-model="createCountry" class="search-input full" maxlength="2" />
        </div>
        <div class="form-group">
          <label>Commission %</label>
          <input v-model.number="createCommission" type="number" class="search-input full" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="createModal = false">Cancel</button>
          <button class="btn btn-primary" @click="submitCreate">Create</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.hint { font-size: 13px; color: #555; margin-bottom: 16px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.search-input { height: 38px; padding: 0 12px; border: 1px solid #ddd; border-radius: 6px; }
.search-input.full { width: 100%; box-sizing: border-box; }
.btn { height: 38px; padding: 0 16px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
.btn-primary { background: #7B4FFF; color: #fff; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-sm { height: 30px; font-size: 12px; }
.table-card { background: #fff; border: 1px solid #eee; border-radius: 8px; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.bold { font-weight: 600; }
.dim { color: #888; }
.small { font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.loading, .empty { padding: 40px; text-align: center; color: #999; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; padding: 24px; border-radius: 12px; width: 420px; max-width: 90vw; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
</style>
