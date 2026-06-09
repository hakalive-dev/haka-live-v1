<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as dashboardApi from '@/api/dashboard'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

const stats = ref<any>(null)
const recentUsers = ref<any[]>([])
const recentRooms = ref<any[]>([])
const topHosts = ref<any[]>([])
const topAgents = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [s, u, r, h, a] = await Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getRecentUsers(8),
      dashboardApi.getRecentRooms(5),
      dashboardApi.getTopHosts(5),
      dashboardApi.getTopAgents(5),
    ])
    stats.value = s
    recentUsers.value = u
    recentRooms.value = r
    topHosts.value = h
    topAgents.value = a
  } catch { /* handled by interceptor */ }
  loading.value = false
})
</script>

<template>
  <div v-if="loading" class="loading">Loading dashboard...</div>

  <div v-else-if="stats" class="dashboard">
    <!-- Primary stat cards -->
    <div class="stats-grid">
      <StatCard title="Total Users" :value="stats.totalUsers" icon="👥" />
      <StatCard title="Active Users" :value="stats.activeUsers" icon="✅" color="var(--success)" />
      <StatCard title="Verified (KYC)" :value="stats.verifiedUsers" icon="🔵" color="#0369a1" />
      <StatCard title="Live Rooms" :value="stats.liveRooms" icon="🔴" color="var(--danger)" />
      <StatCard title="Total Rooms" :value="stats.totalRooms" icon="🎙️" />
      <StatCard title="Gift Transactions" :value="stats.totalGiftTransactions" icon="🎁" color="var(--primary)" />
      <StatCard title="Wallet Transactions" :value="stats.totalWalletTransactions" icon="💰" color="var(--warning)" />
      <StatCard title="Beans Distributed" :value="stats.totalBeansDistributed.toLocaleString()" icon="🫘" color="var(--success)" />
      <StatCard title="Total Agencies" :value="stats.totalAgencies" icon="🏢" color="var(--primary)" />
      <StatCard title="Active Hosts" :value="stats.activeHosts" icon="🎤" color="var(--success)" />
    </div>

    <!-- Alert pills -->
    <div class="alert-row">
      <div v-if="stats.pendingWithdrawals > 0" class="alert-pill alert-warning">
        ⏳ <strong>{{ stats.pendingWithdrawals }}</strong> pending withdrawal{{ stats.pendingWithdrawals !== 1 ? 's' : '' }}
        <router-link to="/withdrawals">Review →</router-link>
      </div>
      <div v-if="stats.pendingReports > 0" class="alert-pill alert-danger">
        🚨 <strong>{{ stats.pendingReports }}</strong> pending report{{ stats.pendingReports !== 1 ? 's' : '' }}
        <router-link to="/moderation">Review →</router-link>
      </div>
    </div>

    <!-- New users row -->
    <div class="mini-stats">
      <div class="mini-stat">
        <div class="mini-label">New Today</div>
        <div class="mini-value">{{ stats.newUsersToday }}</div>
      </div>
      <div class="mini-stat">
        <div class="mini-label">New This Week</div>
        <div class="mini-value">{{ stats.newUsersThisWeek }}</div>
      </div>
      <div class="mini-stat">
        <div class="mini-label">New This Month</div>
        <div class="mini-value">{{ stats.newUsersThisMonth }}</div>
      </div>
    </div>

    <!-- Panels row 1 -->
    <div class="panels">
      <!-- Recent Users -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Recent Users</h2>
          <router-link to="/users" class="panel-link">View all</router-link>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in recentUsers" :key="user.id">
              <td>
                <div class="user-cell">
                  <div class="avatar-sm">{{ user.displayName?.charAt(0) || '?' }}</div>
                  <div>
                    <div class="cell-primary">{{ user.displayName || 'Unnamed' }}</div>
                    <div class="cell-secondary">{{ user.hakaId || user.username || '—' }}</div>
                  </div>
                </div>
              </td>
              <td><StatusBadge :value="user.role" /></td>
              <td><StatusBadge :value="user.isActive ? 'active' : 'inactive'" /></td>
              <td class="cell-secondary">{{ new Date(user.createdAt).toLocaleDateString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Live Rooms -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Live Rooms</h2>
          <router-link to="/rooms" class="panel-link">View all</router-link>
        </div>
        <table class="data-table" v-if="recentRooms.length">
          <thead>
            <tr>
              <th>Room</th>
              <th>Host</th>
              <th>Status</th>
              <th>Viewers</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in recentRooms" :key="room.id">
              <td class="cell-primary">{{ room.title }}</td>
              <td>{{ room.host?.displayName || '—' }}</td>
              <td><StatusBadge :value="room.status" /></td>
              <td>{{ room.viewerCount }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">No live rooms right now</div>
      </div>
    </div>

    <!-- Panels row 2: Top Hosts + Top Agents -->
    <div class="panels panels-mt">
      <!-- Top Hosts -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">🏆 Top Hosts</h2>
          <router-link to="/users?role=host" class="panel-link">View all</router-link>
        </div>
        <table class="data-table" v-if="topHosts.length">
          <thead>
            <tr>
              <th>#</th>
              <th>Host</th>
              <th>Type</th>
              <th>Gifts Received</th>
              <th>Rooms</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in topHosts" :key="h.id">
              <td class="rank">{{ h.rank }}</td>
              <td>
                <div class="user-cell">
                  <div class="avatar-sm">{{ h.displayName?.charAt(0) || '?' }}</div>
                  <div>
                    <div class="cell-primary">{{ h.displayName }}</div>
                    <div class="cell-secondary mono">{{ h.hakaId ?? '' }}</div>
                  </div>
                </div>
              </td>
              <td><StatusBadge :value="h.hostType || 'host'" /></td>
              <td class="cell-primary">{{ h.giftsReceived.toLocaleString() }}</td>
              <td class="cell-secondary">{{ h.roomsHosted }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">No hosts yet</div>
      </div>

      <!-- Top Agents -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">🌟 Top Agents</h2>
          <router-link to="/users?role=agent" class="panel-link">View all</router-link>
        </div>
        <table class="data-table" v-if="topAgents.length">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Hosts Managed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in topAgents" :key="a.id">
              <td class="rank">{{ a.rank }}</td>
              <td>
                <div class="user-cell">
                  <div class="avatar-sm">{{ a.displayName?.charAt(0) || '?' }}</div>
                  <div>
                    <div class="cell-primary">{{ a.displayName }}</div>
                    <div class="cell-secondary mono">{{ a.hakaId ?? '' }}</div>
                  </div>
                </div>
              </td>
              <td class="cell-primary">{{ a.hostsCount }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">No agents yet</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading { text-align: center; padding: 60px; color: var(--text-muted); font-size: 15px; }

.dashboard { padding: 24px; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.alert-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.alert-pill {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 8px; font-size: 13px;
}
.alert-pill a { color: inherit; font-weight: 700; margin-left: 4px; }
.alert-warning { background: #fff3cd; color: #856404; }
.alert-danger { background: #fee2e2; color: #991b1b; }

.mini-stats {
  display: flex; gap: 16px; margin-bottom: 24px;
}
.mini-stat {
  background: #f8fafc; border: 1px solid #eee; border-radius: 8px;
  padding: 12px 20px; flex: 1;
}
.mini-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; }
.mini-value { font-size: 24px; font-weight: 700; color: #222; margin-top: 4px; }

.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.panels-mt { margin-top: 24px; }

.panel {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--card-border);
}

.panel-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
.panel-link { font-size: 13px; color: var(--primary); text-decoration: none; font-weight: 600; }
.panel-link:hover { text-decoration: underline; }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 700;
  text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; letter-spacing: 0.5px;
}
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; }
.data-table tr:hover td { background: var(--row-hover); }

.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar-sm {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; flex-shrink: 0;
}

.cell-primary { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.cell-secondary { font-size: 12px; color: var(--text-muted); }
.mono { font-family: monospace; }
.rank { font-weight: 700; color: #888; font-size: 13px; }
.empty-state { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }
</style>
