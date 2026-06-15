<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as api from '@/api/stateRanking';
import * as houseApi from '@/api/rankingRewards';

const config = ref<api.StateRankingConfigRow | null>(null);
const rewards = ref<api.StateRankingRewardRow[]>([]);
const house = ref<houseApi.HouseEntryRow[]>([]);
const houseForm = ref({ idOrHaka: '', income: 0, note: '' });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const [cfg, items, houseItems] = await Promise.all([
      api.getConfig(),
      api.listRewards(100),
      houseApi.listHouseEntries('state'),
    ]);
    config.value = cfg;
    rewards.value = items;
    house.value = houseItems;
  } catch {
    error.value = 'Failed to load state ranking settings.';
  }
  loading.value = false;
}

async function addHouse() {
  if (!houseForm.value.idOrHaka.trim()) {
    error.value = 'Enter a user or Haka ID.';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    await houseApi.addHouseEntry(
      'state',
      houseForm.value.idOrHaka.trim(),
      Number(houseForm.value.income),
      houseForm.value.note,
    );
    houseForm.value = { idOrHaka: '', income: 0, note: '' };
    house.value = await houseApi.listHouseEntries('state');
    notice.value = 'House entry saved. The account\'s income rolls into its profile state.';
  } catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Could not add house entry.';
  }
  saving.value = false;
}

async function toggleHouse(row: houseApi.HouseEntryRow) {
  saving.value = true;
  try {
    await houseApi.setHouseEntryActive(row.id, !row.active);
    house.value = await houseApi.listHouseEntries('state');
  } catch {
    error.value = 'Could not update house entry.';
  }
  saving.value = false;
}

async function removeHouse(row: houseApi.HouseEntryRow) {
  saving.value = true;
  try {
    await houseApi.deleteHouseEntry(row.id);
    house.value = await houseApi.listHouseEntries('state');
  } catch {
    error.value = 'Could not remove house entry.';
  }
  saving.value = false;
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
    <p v-if="notice" class="notice">{{ notice }}</p>
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
      <h2>House entries</h2>
      <p class="subtitle">
        Company-owned accounts placed into the state rankings at a set income. Each account's income
        rolls into <strong>its profile state's</strong> total and ranks among that state's hosts, but
        house accounts are <strong>never paid</strong> at settlement. Deactivate to remove instantly.
      </p>
      <div class="house-form">
        <input v-model="houseForm.idOrHaka" placeholder="User ID or Haka ID" />
        <input v-model.number="houseForm.income" type="number" min="0" placeholder="Income" />
        <input v-model="houseForm.note" placeholder="Note (optional)" />
        <button type="button" :disabled="saving" @click="addHouse">Add</button>
      </div>
      <table v-if="house.length" class="table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Income</th>
            <th>Note</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in house" :key="row.id">
            <td>{{ row.user.displayName }} ({{ row.user.hakaId ?? row.userId.slice(0, 8) }})</td>
            <td>{{ row.income.toLocaleString() }}</td>
            <td>{{ row.note || '—' }}</td>
            <td>
              <button type="button" :disabled="saving" @click="toggleHouse(row)">
                {{ row.active ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td><button type="button" class="link" @click="removeHouse(row)">remove</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No house entries.</p>
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
.notice {
  color: #0a7d28;
}
.house-form {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.house-form input {
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
}
.link {
  background: none;
  border: none;
  color: #c00;
  cursor: pointer;
}
button {
  cursor: pointer;
}
</style>
