<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as api from '@/api/levelTasks'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const loading = ref(true)
const tiers = ref<any[]>([])
const settings = ref<any>(null)
const daily = ref<any[]>([])
const dailyUserId = ref('')

async function load() {
  loading.value = true
  try {
    const [t, s, d] = await Promise.all([
      api.listTiers(),
      api.getSettings(),
      api.listDaily({ limit: 20, userId: dailyUserId.value || undefined }),
    ])
    tiers.value = t.data ?? t
    settings.value = s.data ?? s
    daily.value = (d.data ?? d).items ?? []
  } catch (e: any) {
    toast.error('Load failed', e?.message ?? 'Error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function saveSettings() {
  if (!settings.value) return
  try {
    await api.updateSettings({
      ordinaryMaxSevenDayEarnings: settings.value.ordinaryMaxSevenDayEarnings,
      newHostProtectionDays: settings.value.newHostProtectionDays,
      newHostHourlyBeans: settings.value.newHostHourlyBeans,
      newHostHoursPerDay: settings.value.newHostHoursPerDay,
      newHostTotalCapBeans: settings.value.newHostTotalCapBeans,
      ordinaryLiveHourlyBeans: settings.value.ordinaryLiveHourlyBeans,
      ordinaryLiveHoursPerDay: settings.value.ordinaryLiveHoursPerDay,
      ordinaryIncomeHourlyBeans: settings.value.ordinaryIncomeHourlyBeans,
      ordinaryIncomeHoursPerDay: settings.value.ordinaryIncomeHoursPerDay,
      ordinaryHourlyMaxBeans: settings.value.ordinaryHourlyMaxBeans,
      ordinaryDailyMaxBeans: settings.value.ordinaryDailyMaxBeans,
      incomeTaskThresholdBeans: settings.value.incomeTaskThresholdBeans,
      countLiveMicTime: settings.value.countLiveMicTime,
    })
    toast.success('Settings saved')
    await load()
  } catch (e: any) {
    toast.error('Save failed', e?.message ?? 'Error')
  }
}
</script>

<template>
  <div class="page">
    <h1 class="text-2xl font-bold mb-4">New Level Task</h1>
    <p class="text-secondary mb-6">
      Configure level tiers (S–E), new-host protection, and ordinary-host caps.
      Eligibility: verified female hosts only. Live minutes count from voice rooms
      (<code>chat</code>) and video live (<code>live</code>); audio party uses chat mic seats.
      PK host presence is tracked separately. Daily counters reset at 00:00 UTC.
    </p>

    <div v-if="loading" class="loading">Loading…</div>

    <template v-else>
      <section class="card mb-6" v-if="settings">
        <h2 class="section-title">Settings</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label class="field">
            <span>Ordinary max 7d earnings</span>
            <input v-model="settings.ordinaryMaxSevenDayEarnings" type="number" class="form-input" />
          </label>
          <label class="field">
            <span>New host days</span>
            <input v-model.number="settings.newHostProtectionDays" type="number" class="form-input" />
          </label>
          <label class="field">
            <span>New host hourly beans</span>
            <input v-model.number="settings.newHostHourlyBeans" type="number" class="form-input" />
          </label>
          <label class="field">
            <span>New host hours/day</span>
            <input v-model.number="settings.newHostHoursPerDay" type="number" class="form-input" />
          </label>
          <label class="field">
            <span>New host total cap</span>
            <input v-model.number="settings.newHostTotalCapBeans" type="number" class="form-input" />
          </label>
          <label class="field">
            <span>Income threshold (today)</span>
            <input v-model.number="settings.incomeTaskThresholdBeans" type="number" class="form-input" />
          </label>
          <label class="field field-check">
            <input v-model="settings.countLiveMicTime" type="checkbox" />
            <span>Count live-room mic time (off = chat rooms only)</span>
          </label>
        </div>
        <button class="btn-primary mt-4" @click="saveSettings">Save settings</button>
      </section>

      <section class="card mb-6">
        <h2 class="section-title">Level tiers</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Min 7d earnings</th>
              <th>Daily task reward</th>
              <th>Hourly max</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tiers" :key="t.id">
              <td>{{ t.levelCode }}</td>
              <td>{{ t.minSevenDayEarnings }}</td>
              <td>{{ t.dailyTaskRewardBeans }}</td>
              <td>{{ t.hourlyMaxBeans }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2 class="section-title">Recent daily claims</h2>
        <div class="flex gap-2 mb-3">
          <input v-model="dailyUserId" placeholder="Filter by user UUID" class="form-input flex-1" />
          <button class="btn-secondary" @click="load">Filter</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Track</th>
              <th>Live beans</th>
              <th>Income claims</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in daily" :key="row.id">
              <td>{{ String(row.taskDate).slice(0, 10) }}</td>
              <td>{{ row.user?.hakaId ?? row.userId }}</td>
              <td>{{ row.track }}{{ row.levelCode ? ` (${row.levelCode})` : '' }}</td>
              <td>{{ row.liveBeansClaimed }}</td>
              <td>{{ row.incomeClaimsCount }}</td>
              <td>{{ row.totalBeansClaimed }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.section-title { font-weight: 600; margin-bottom: 12px; color: #7b4fff; }
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
.field span { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; }
.form-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th, .data-table td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; }
.btn-primary { background: #7b4fff; color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; }
.btn-secondary { background: #f1f5f9; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; }
.loading { padding: 40px; text-align: center; }
.mb-6 { margin-bottom: 24px; }
.mb-3 { margin-bottom: 12px; }
.mt-4 { margin-top: 16px; }
.flex { display: flex; }
.gap-2 { gap: 8px; }
.flex-1 { flex: 1; }
</style>
