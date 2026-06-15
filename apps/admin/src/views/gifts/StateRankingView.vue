<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as api from '@/api/stateRanking';

const config = ref<api.StateRankingConfigRow | null>(null);
const rewards = ref<api.StateRankingRewardRow[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [cfg, items] = await Promise.all([api.getConfig(), api.listRewards(100)]);
    config.value = cfg;
    rewards.value = items;
  } catch {
    error.value = 'Failed to load state ranking settings.';
  }
  loading.value = false;
}

async function toggleEnabled() {
  if (!config.value) return;
  saving.value = true;
  try {
    config.value = await api.patchConfig({ enabled: !config.value.enabled });
  } catch {
    error.value = 'Could not update config.';
  }
  saving.value = false;
}

async function toggleFaceGate() {
  if (!config.value) return;
  saving.value = true;
  try {
    config.value = await api.patchConfig({
      requireFaceVerification: !config.value.requireFaceVerification,
    });
  } catch {
    error.value = 'Could not update config.';
  }
  saving.value = false;
}

onMounted(load);
</script>

<template>
  <div class="page">
    <h1>State Ranking</h1>
    <p class="subtitle">Daily state leaderboards — config and settlement history (super admin).</p>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading">Loading…</p>

    <section v-if="config && !loading" class="card">
      <h2>Configuration</h2>
      <dl class="kv">
        <dt>Enabled</dt>
        <dd>
          <button type="button" :disabled="saving" @click="toggleEnabled">
            {{ config.enabled ? 'Yes — click to disable' : 'No — click to enable' }}
          </button>
        </dd>
        <dt>Face verification gate</dt>
        <dd>
          <button type="button" :disabled="saving" @click="toggleFaceGate">
            {{ config.requireFaceVerification ? 'Required' : 'Off' }}
          </button>
        </dd>
        <dt>Top hosts rewarded per state</dt>
        <dd>{{ config.topHostsPerState }}</dd>
        <dt>Host split %</dt>
        <dd>{{ config.hostSplitPercentages.join(' / ') }}</dd>
      </dl>

      <h3>Prize tiers (beans per state rank)</h3>
      <table class="table">
        <thead>
          <tr>
            <th>State rank</th>
            <th>Daily pool</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tier in config.stateRankTiers" :key="tier.stateRankMin">
            <td>
              {{
                tier.stateRankMax === tier.stateRankMin
                  ? tier.stateRankMin
                  : `${tier.stateRankMin}–${tier.stateRankMax}`
              }}
            </td>
            <td>{{ tier.poolTotal.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="!loading" class="card">
      <h2>Recent rewards</h2>
      <table v-if="rewards.length" class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Host</th>
            <th>State</th>
            <th>State #</th>
            <th>Host #</th>
            <th>Beans</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rewards" :key="row.id">
            <td>{{ row.periodDate.slice(0, 10) }}</td>
            <td>{{ row.user.displayName }} ({{ row.user.hakaId ?? '—' }})</td>
            <td>{{ row.stateCode }}</td>
            <td>{{ row.stateRank }}</td>
            <td>{{ row.hostRank }}</td>
            <td>{{ row.rewardAmount.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No settlement records yet.</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding: 24px;
  max-width: 960px;
}
.subtitle {
  color: #666;
  margin-bottom: 24px;
}
.error {
  color: #c00;
}
.card {
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}
.kv {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  margin-bottom: 20px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th,
.table td {
  border-bottom: 1px solid #eee;
  padding: 8px 10px;
  text-align: left;
}
.muted {
  color: #888;
}
button {
  cursor: pointer;
}
</style>
