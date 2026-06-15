<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as api from '@/api/rankingRewards';
import FemaleHostSearchPicker from '@/components/rank-management/FemaleHostSearchPicker.vue';

// The board is fixed per route (separate Activity / Agent sidebar pages).
const props = defineProps<{ board: api.RewardBoard }>();
const board = computed(() => props.board);
const title = computed(() => (props.board === 'agent' ? 'Agent Rewards' : 'Activity Rewards'));

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
    error.value = 'Select a female host.';
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
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ title }}</h1>
        <p class="page-sub">
          Beans paid to top rankers at period close. Ships disabled — set tiers, then enable.
          Super-admin only.
        </p>
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="notice" class="saved-note">{{ notice }}</p>
    <p v-if="loading" class="loading">Loading…</p>

    <p v-if="isAgent && !loading" class="warn-banner">
      ⚠️ The Agent board ranks by lifetime coins sold — it has no per-period window yet, so
      settlement is a no-op even if enabled. Configure here, but payouts need a daily-delta
      source before they run.
    </p>

    <!-- Configuration -->
    <section v-if="config && !loading" class="settings-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Configuration</h2>
          <p class="card-sub">Enable, period, and eligibility for this board.</p>
        </div>
        <button
          type="button"
          class="btn"
          :class="config.enabled ? 'btn-outline' : 'btn-primary'"
          :disabled="saving"
          @click="toggleEnabled"
        >
          {{ config.enabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
      <div class="card-body">
        <div class="field-row">
          <span class="field-label">Status</span>
          <span class="badge" :class="config.enabled ? 'badge-on' : 'badge-off'">
            {{ config.enabled ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
        <div class="field-row">
          <span class="field-label">Period</span>
          <select class="form-input form-select" :value="config.period" :disabled="saving" @change="setPeriod">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <label class="toggle-row">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="config.requireFaceVerification"
            :disabled="saving"
            @change="toggleFaceGate"
          />
          <span class="toggle-text">Require face verification</span>
        </label>
      </div>
    </section>

    <!-- Reward tiers -->
    <section v-if="config && !loading" class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Reward tiers</h2>
          <p class="card-sub">Beans paid to each rank range at period close.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-outline btn-sm" @click="addTier">+ Add tier</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveTiers">Save tiers</button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Rank from</th>
            <th>Rank to</th>
            <th>Beans each</th>
            <th class="actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(tier, i) in tiers" :key="i">
            <td><input class="form-input cell-input" type="number" min="1" v-model.number="tier.rankMin" /></td>
            <td><input class="form-input cell-input" type="number" min="1" v-model.number="tier.rankMax" /></td>
            <td><input class="form-input cell-input" type="number" min="0" v-model.number="tier.amount" /></td>
            <td class="actions">
              <button type="button" class="btn btn-danger btn-sm" @click="removeTier(i)">Remove</button>
            </td>
          </tr>
          <tr v-if="!tiers.length">
            <td colspan="4" class="empty">No tiers — nothing will pay out.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- House entries -->
    <section v-if="!loading" class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">House entries</h2>
          <p class="card-sub">
            Company-owned accounts placed into this ranking at a set income. They occupy ranks but
            are <strong>never paid</strong> by rewards. Deactivate to remove instantly.
          </p>
        </div>
      </div>
      <div class="add-form">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Female host</label>
            <FemaleHostSearchPicker v-model="houseForm.idOrHaka" :disabled="saving" />
          </div>
          <div class="form-field">
            <label class="form-label">Income</label>
            <input class="form-input" v-model.number="houseForm.income" type="number" min="0" />
          </div>
          <div class="form-field">
            <label class="form-label">Note (optional)</label>
            <input class="form-input" v-model="houseForm.note" />
          </div>
          <div class="form-field-action">
            <button type="button" class="btn btn-primary" :disabled="saving" @click="addHouse">Add</button>
          </div>
        </div>
      </div>
      <table v-if="house.length" class="data-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Income</th>
            <th>Note</th>
            <th>Active</th>
            <th class="actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in house" :key="row.id">
            <td>{{ row.user.displayName }} ({{ row.user.hakaId ?? row.userId.slice(0, 8) }})</td>
            <td>{{ row.income.toLocaleString() }}</td>
            <td>{{ row.note || '—' }}</td>
            <td>
              <button
                type="button"
                class="btn btn-sm"
                :class="row.active ? 'btn-outline' : 'btn-primary'"
                :disabled="saving"
                @click="toggleHouse(row)"
              >
                {{ row.active ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td class="actions">
              <button type="button" class="btn btn-danger btn-sm" @click="removeHouse(row)">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty pad">No house entries.</p>
    </section>

    <!-- Payouts -->
    <section v-if="!loading" class="table-card">
      <div class="card-header">
        <div><h2 class="card-title">Recent payouts</h2></div>
      </div>
      <table v-if="rewards.length" class="data-table">
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
      <p v-else class="empty pad">No payouts yet.</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.page-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  max-width: 640px;
}

.form-error {
  font-size: 13px;
  color: #ef4444;
  margin: 0;
}
.saved-note {
  font-size: 13px;
  color: #10b981;
  margin: 0;
}
.loading {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.warn-banner {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 12px 16px;
  color: #92400e;
  font-size: 13px;
  margin: 0;
}

/* Cards */
.settings-card,
.table-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--card-border, #e2e8f0);
  gap: 16px;
  flex-wrap: wrap;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.card-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  max-width: 560px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-body {
  padding: 16px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.field-label {
  font-size: 13px;
  color: var(--text-muted);
  min-width: 120px;
}
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.badge-on {
  background: #10b98119;
  color: #047857;
}
.badge-off {
  background: var(--row-hover, #f1f5f9);
  color: var(--text-muted);
}

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.toggle-input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}
.toggle-text {
  font-size: 13px;
  color: var(--text-primary);
}

/* Add form */
.add-form {
  padding: 16px 24px;
  border-bottom: 1px solid var(--card-border, #e2e8f0);
  background: var(--row-hover, rgba(0, 0, 0, 0.015));
}
.form-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 140px;
}
.form-field-action {
  flex: 0 0 auto;
}
.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}
.form-input {
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--card-border, #e2e8f0);
  background: var(--card-bg, #fff);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.form-select {
  max-width: 200px;
}
.cell-input {
  width: 120px;
}

/* Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  text-align: left;
  color: var(--text-muted);
  border-bottom: 1px solid var(--card-border, #e2e8f0);
}
.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--card-border, #e2e8f0);
}
.data-table tbody tr:last-child td {
  border-bottom: none;
}
.data-table tbody tr:hover {
  background: var(--row-hover, rgba(0, 0, 0, 0.02));
}
.data-table .actions {
  text-align: right;
}
.empty {
  color: var(--text-muted);
  font-size: 13px;
}
.pad {
  padding: 20px 24px;
  margin: 0;
}

/* Buttons */
.btn {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, var(--primary));
}
.btn-outline {
  background: transparent;
  border-color: var(--card-border, #e2e8f0);
  color: var(--text-primary);
}
.btn-outline:hover:not(:disabled) {
  background: var(--row-hover, rgba(0, 0, 0, 0.04));
}
.btn-danger {
  background: transparent;
  border-color: #ef444455;
  color: #ef4444;
}
.btn-danger:hover:not(:disabled) {
  background: #ef444415;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
</style>
