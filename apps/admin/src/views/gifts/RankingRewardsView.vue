<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as api from '@/api/rankingRewards';

const BOARDS: { key: api.RewardBoard; label: string }[] = [
  { key: 'creator', label: 'Activity' },
  { key: 'agent', label: 'Agent' },
];

const board = ref<api.RewardBoard>('creator');
const config = ref<api.RankingRewardConfigRow | null>(null);
const rewards = ref<api.RankingRewardRow[]>([]);
// Local editable copy of the tiers (committed only on Save).
const tiers = ref<api.RankingRewardTier[]>([]);
const house = ref<api.HouseEntryRow[]>([]);
const houseForm = ref({ idOrHaka: '', income: 0, note: '' });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

const isAgent = computed(() => board.value === 'agent');

async function load() {
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const [cfg, items, houseItems] = await Promise.all([
      api.getConfig(board.value),
      api.listRewards(board.value, 100),
      api.listHouseEntries(board.value),
    ]);
    config.value = cfg;
    tiers.value = cfg.rewardTiers.map((t) => ({ ...t }));
    rewards.value = items;
    house.value = houseItems;
  } catch {
    error.value = 'Failed to load ranking reward settings.';
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
    await api.addHouseEntry(
      board.value,
      houseForm.value.idOrHaka.trim(),
      Number(houseForm.value.income),
      houseForm.value.note,
    );
    houseForm.value = { idOrHaka: '', income: 0, note: '' };
    house.value = await api.listHouseEntries(board.value);
    notice.value = 'House entry saved.';
  } catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Could not add house entry.';
  }
  saving.value = false;
}

async function toggleHouse(row: api.HouseEntryRow) {
  saving.value = true;
  try {
    await api.setHouseEntryActive(row.id, !row.active);
    house.value = await api.listHouseEntries(board.value);
  } catch {
    error.value = 'Could not update house entry.';
  }
  saving.value = false;
}

async function removeHouse(row: api.HouseEntryRow) {
  saving.value = true;
  try {
    await api.deleteHouseEntry(row.id);
    house.value = await api.listHouseEntries(board.value);
  } catch {
    error.value = 'Could not remove house entry.';
  }
  saving.value = false;
}

async function switchBoard(next: api.RewardBoard) {
  if (board.value === next) return;
  board.value = next;
  await load();
}

async function patch(body: Partial<api.RankingRewardConfigRow>) {
  if (!config.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    config.value = await api.patchConfig(board.value, body);
    tiers.value = config.value.rewardTiers.map((t) => ({ ...t }));
    notice.value = 'Saved.';
  } catch {
    error.value = 'Could not update config.';
  }
  saving.value = false;
}

function toggleEnabled() {
  if (!config.value) return;
  patch({ enabled: !config.value.enabled });
}
function toggleFaceGate() {
  if (!config.value) return;
  patch({ requireFaceVerification: !config.value.requireFaceVerification });
}
function setPeriod(e: Event) {
  patch({ period: (e.target as HTMLSelectElement).value as api.RankingRewardConfigRow['period'] });
}

function addTier() {
  const last = tiers.value[tiers.value.length - 1];
  const start = last ? last.rankMax + 1 : 1;
  tiers.value.push({ rankMin: start, rankMax: start, amount: 0 });
}
function removeTier(i: number) {
  tiers.value.splice(i, 1);
}
function saveTiers() {
  // Persist numbers only; the backend re-validates and drops anything malformed.
  patch({
    rewardTiers: tiers.value.map((t) => ({
      rankMin: Number(t.rankMin),
      rankMax: Number(t.rankMax),
      amount: Number(t.amount),
    })),
  });
}

onMounted(load);
</script>

<template>
  <div class="page">
    <h1>Ranking Rewards</h1>
    <p class="subtitle">
      Beans paid to top rankers at period close. Ships disabled — set tiers, then enable.
      Super-admin only.
    </p>

    <div class="tabs">
      <button
        v-for="b in BOARDS"
        :key="b.key"
        type="button"
        :class="{ active: board === b.key }"
        @click="switchBoard(b.key)"
      >
        {{ b.label }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="loading">Loading…</p>

    <p v-if="isAgent && !loading" class="warn">
      ⚠️ The Agent board ranks by lifetime coins sold — it has no per-period window yet, so
      settlement is a no-op even if enabled. Configure here, but payouts need a daily-delta
      source before they run.
    </p>

    <section v-if="config && !loading" class="card">
      <h2>Configuration</h2>
      <dl class="kv">
        <dt>Enabled</dt>
        <dd>
          <button type="button" :disabled="saving" @click="toggleEnabled">
            {{ config.enabled ? 'Yes — click to disable' : 'No — click to enable' }}
          </button>
        </dd>
        <dt>Period</dt>
        <dd>
          <select :value="config.period" :disabled="saving" @change="setPeriod">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </dd>
        <dt>Face verification gate</dt>
        <dd>
          <button type="button" :disabled="saving" @click="toggleFaceGate">
            {{ config.requireFaceVerification ? 'Required' : 'Off' }}
          </button>
        </dd>
      </dl>

      <h3>Reward tiers (beans per rank)</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Rank from</th>
            <th>Rank to</th>
            <th>Beans each</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(tier, i) in tiers" :key="i">
            <td><input type="number" min="1" v-model.number="tier.rankMin" /></td>
            <td><input type="number" min="1" v-model.number="tier.rankMax" /></td>
            <td><input type="number" min="0" v-model.number="tier.amount" /></td>
            <td><button type="button" class="link" @click="removeTier(i)">remove</button></td>
          </tr>
          <tr v-if="!tiers.length">
            <td colspan="4" class="muted">No tiers — nothing will pay out.</td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <button type="button" @click="addTier">+ Add tier</button>
        <button type="button" class="primary" :disabled="saving" @click="saveTiers">Save tiers</button>
      </div>
    </section>

    <section v-if="!loading" class="card">
      <h2>House entries</h2>
      <p class="hint">
        Company-owned accounts placed into this ranking at a set income to raise the bar. They
        occupy ranks but are <strong>never paid</strong> by rewards. Deactivate to remove instantly.
      </p>
      <div class="house-form">
        <input v-model="houseForm.idOrHaka" placeholder="User ID or Haka ID" />
        <input v-model.number="houseForm.income" type="number" min="0" placeholder="Income" />
        <input v-model="houseForm.note" placeholder="Note (optional)" />
        <button type="button" class="primary" :disabled="saving" @click="addHouse">Add</button>
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
      <h2>Recent payouts</h2>
      <table v-if="rewards.length" class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>User</th>
            <th>Rank</th>
            <th>Score</th>
            <th>Beans</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rewards" :key="row.id">
            <td>{{ row.periodDate.slice(0, 10) }}</td>
            <td>{{ row.user.displayName }} ({{ row.user.hakaId ?? '—' }})</td>
            <td>{{ row.rank }}</td>
            <td>{{ row.score.toLocaleString() }}</td>
            <td>{{ row.rewardAmount.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No payouts yet.</p>
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
  margin-bottom: 16px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.tabs button {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.tabs button.active {
  background: #1a1a2e;
  color: #fff;
  border-color: #1a1a2e;
}
.error {
  color: #c00;
}
.notice {
  color: #0a7d28;
}
.warn {
  background: #fff7e6;
  border: 1px solid #ffe1a8;
  border-radius: 8px;
  padding: 12px 14px;
  color: #8a5a00;
  margin-bottom: 16px;
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
.table input {
  width: 110px;
  padding: 4px 6px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.actions .primary {
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
}
.muted {
  color: #888;
}
.hint {
  color: #666;
  font-size: 13px;
  margin-bottom: 12px;
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
