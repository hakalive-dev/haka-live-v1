<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as analyticsApi from '@/api/analytics'

const period = ref<'day' | 'week' | 'month' | 'all'>('week')
const overview = ref<any>(null)
const topHosts = ref<any[]>([])
const topSenders = ref<any[]>([])
const userGrowth = ref<any[]>([])
const loading = ref(true)

async function fetchAll() {
  loading.value = true
  try {
    const [ov, hosts, senders, growth] = await Promise.all([
      analyticsApi.getOverview(period.value),
      analyticsApi.getTopHosts(period.value, 10),
      analyticsApi.getTopSenders(period.value, 10),
      analyticsApi.getUserGrowth(),
    ])
    overview.value = ov
    topHosts.value = hosts
    topSenders.value = senders
    userGrowth.value = growth
  } catch {}
  loading.value = false
}

onMounted(fetchAll)
watch(period, fetchAll)
</script>

<template>
  <div class="page">
    <!-- Period selector -->
    <div class="toolbar">
      <h2 class="page-title">Analytics & Reports</h2>
      <div class="period-tabs">
        <button v-for="p in [['day','Today'],['week','7 Days'],['month','This Month'],['all','All Time']]"
          :key="p[0]" :class="['ptab', period === p[0] ? 'ptab-active' : '']"
          @click="period = p[0] as any">{{ p[1] }}</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading analytics...</div>

    <template v-else-if="overview">
      <!-- KPI cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon">👤</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.newUsers.toLocaleString() }}</div>
            <div class="kpi-label">New Users</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">✅</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.activeUsers.toLocaleString() }}</div>
            <div class="kpi-label">Active Users (total)</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🎙️</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.newRooms.toLocaleString() }}</div>
            <div class="kpi-label">Rooms Created</div>
          </div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-icon">🔴</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.liveRooms.toLocaleString() }}</div>
            <div class="kpi-label">Live Right Now</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🎁</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.giftTxCount.toLocaleString() }}</div>
            <div class="kpi-label">Gifts Sent</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🪙</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.totalCoinsSpent.toLocaleString() }}</div>
            <div class="kpi-label">Coins Spent on Gifts</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🫘</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.totalBeansEarned.toLocaleString() }}</div>
            <div class="kpi-label">Beans Earned</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">💸</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.pendingWithdrawals.toLocaleString() }}</div>
            <div class="kpi-label">Pending Withdrawals</div>
          </div>
        </div>
      </div>

      <!-- User growth (last 7 days) -->
      <div class="section-card">
        <h3 class="section-title">User Growth — Last 7 Days</h3>
        <div class="growth-chart">
          <div v-for="day in userGrowth" :key="day.date" class="growth-col">
            <div class="growth-bar-wrap">
              <div class="growth-bar"
                :style="{ height: userGrowth.length ? Math.max(4, (day.count / Math.max(1, Math.max(...userGrowth.map((d:any) => d.count)))) * 100) + '%' : '4%' }" />
            </div>
            <div class="growth-count">{{ day.count }}</div>
            <div class="growth-label">{{ day.date.slice(5) }}</div>
          </div>
        </div>
      </div>

      <!-- Two-column leaderboards -->
      <div class="leaderboards">
        <!-- Top Hosts -->
        <div class="section-card">
          <h3 class="section-title">Top Hosts by Beans Earned</h3>
          <table class="lb-table">
            <thead><tr><th>#</th><th>Host</th><th>Beans</th><th>Coins Recv.</th><th>Gifts</th></tr></thead>
            <tbody>
              <tr v-for="(h, i) in topHosts" :key="h.user?.id || i">
                <td class="rank">{{ i + 1 }}</td>
                <td>
                  <div class="fw">{{ h.user?.displayName || 'Unknown' }}</div>
                  <div class="dim mono">{{ h.user?.hakaId }}</div>
                </td>
                <td class="beans fw">🫘 {{ h.totalBeans.toLocaleString() }}</td>
                <td class="coins dim">🪙 {{ h.totalCoinsReceived.toLocaleString() }}</td>
                <td class="dim">{{ h.giftCount }}</td>
              </tr>
              <tr v-if="topHosts.length === 0">
                <td colspan="5" class="empty">No data yet</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Top Senders (Gifters) -->
        <div class="section-card">
          <h3 class="section-title">Top Gift Senders (Spenders)</h3>
          <table class="lb-table">
            <thead><tr><th>#</th><th>User</th><th>Coins Spent</th><th>Gifts Sent</th></tr></thead>
            <tbody>
              <tr v-for="(s, i) in topSenders" :key="s.user?.id || i">
                <td class="rank">{{ i + 1 }}</td>
                <td>
                  <div class="fw">{{ s.user?.displayName || 'Unknown' }}</div>
                  <div class="dim mono">{{ s.user?.hakaId }}</div>
                </td>
                <td class="coins fw">🪙 {{ s.totalCoinsSpent.toLocaleString() }}</td>
                <td class="dim">{{ s.giftCount }}</td>
              </tr>
              <tr v-if="topSenders.length === 0">
                <td colspan="4" class="empty">No data yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-title { margin: 0; font-size: 20px; font-weight: 700; }
.period-tabs { display: flex; background: var(--content-bg); border-radius: 10px; padding: 3px; gap: 2px; border: 1px solid var(--card-border); }
.ptab { padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; border: none; cursor: pointer; background: none; color: var(--text-muted); transition: all 0.15s; }
.ptab-active { background: var(--card-bg); color: var(--primary); font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.loading { padding: 60px; text-align: center; color: var(--text-muted); }

/* KPI Grid */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.kpi-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 14px; }
.kpi-card.highlight { border-color: var(--danger); background: #fff5f5; }
.kpi-icon { font-size: 28px; }
.kpi-body { display: flex; flex-direction: column; gap: 2px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.kpi-label { font-size: 12px; color: var(--text-muted); }

/* Growth chart */
.section-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 20px; }
.section-title { margin: 0 0 16px; font-size: 15px; font-weight: 600; }
.growth-chart { display: flex; gap: 8px; align-items: flex-end; height: 120px; padding-bottom: 32px; position: relative; }
.growth-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.growth-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.growth-bar { width: 100%; background: var(--primary); border-radius: 4px 4px 0 0; transition: height 0.3s ease; min-height: 4px; }
.growth-count { font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
.growth-label { font-size: 10px; color: var(--text-muted); }

/* Leaderboards */
.leaderboards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 900px) { .leaderboards { grid-template-columns: 1fr; } }
.lb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lb-table th { padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.lb-table td { padding: 8px 12px; border-top: 1px solid #F1F5F9; }
.rank { font-weight: 700; color: var(--text-muted); width: 30px; }
.fw { font-weight: 500; color: var(--text-primary); }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.beans { color: #22C97A; }
.coins { color: var(--warning); }
.empty { padding: 20px; text-align: center; color: var(--text-muted); }
</style>
