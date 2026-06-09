<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import * as api from "@/api/commissionConfig";
import RowActionMenu from "@/components/common/RowActionMenu.vue";
import RowActionMenuItem from "@/components/common/RowActionMenuItem.vue";

const POLL_MS = 30_000;
const lastSyncedAt = ref<Date | null>(null);
const lastSyncedDisplay = computed(() =>
  lastSyncedAt.value ? lastSyncedAt.value.toLocaleString() : "—",
);

let pollTimer: ReturnType<typeof setInterval> | null = null;

function onVisibilityRefresh() {
  if (document.visibilityState === "visible") void refreshAll();
}

async function refreshAll() {
  await Promise.all([fetchTiers(), fetchGiftBonusTiers(), fetchBonus()]);
  lastSyncedAt.value = new Date();
}

// ── Tiers ─────────────────────────────────────────────────────────────────────
const tiers = ref<api.TierDTO[]>([]);
const loadingTiers = ref(true);
const tierError = ref("");

async function fetchTiers() {
  loadingTiers.value = true;
  tierError.value = "";
  try {
    tiers.value = await api.listTiers();
  } catch {
    tierError.value = "Failed to load tiers.";
  }
  loadingTiers.value = false;
}

// ── Add tier form ─────────────────────────────────────────────────────────────
const showAddForm = ref(false);
const addName = ref("");
const addIncome = ref("");
const addRate = ref("");
const addSaving = ref(false);
const addError = ref("");

async function submitAdd() {
  addError.value = "";
  const rate = parseFloat(addRate.value) / 100;
  if (!addName.value.trim()) {
    addError.value = "Name is required.";
    return;
  }
  if (!/^\d+$/.test(addIncome.value)) {
    addError.value = "Min income must be a whole number.";
    return;
  }
  if (isNaN(rate) || rate < 0 || rate > 1) {
    addError.value = "Rate must be 0–100%.";
    return;
  }
  addSaving.value = true;
  try {
    await api.createTier({
      name: addName.value.trim(),
      minHostIncome: addIncome.value,
      commissionRate: rate,
    });
    addName.value = "";
    addIncome.value = "";
    addRate.value = "";
    showAddForm.value = false;
    await fetchTiers();
  } catch (e: any) {
    addError.value = e?.response?.data?.message ?? "Failed to create tier.";
  }
  addSaving.value = false;
}

// ── Inline edit ───────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editName = ref("");
const editIncome = ref("");
const editRate = ref("");
const editSaving = ref(false);
const editError = ref("");

function startEdit(t: api.TierDTO) {
  editingId.value = t.id;
  editName.value = t.name;
  editIncome.value = t.minHostIncome;
  editRate.value = (t.commissionRate * 100).toFixed(2);
  editError.value = "";
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  editError.value = "";
  const rate = parseFloat(editRate.value) / 100;
  if (!editName.value.trim()) {
    editError.value = "Name required.";
    return;
  }
  if (!/^\d+$/.test(editIncome.value)) {
    editError.value = "Income must be a whole number.";
    return;
  }
  if (isNaN(rate) || rate < 0 || rate > 1) {
    editError.value = "Rate must be 0–100%.";
    return;
  }
  editSaving.value = true;
  try {
    await api.updateTier(editingId.value!, {
      name: editName.value.trim(),
      minHostIncome: editIncome.value,
      commissionRate: rate,
    });
    editingId.value = null;
    await fetchTiers();
  } catch (e: any) {
    editError.value = e?.response?.data?.message ?? "Save failed.";
  }
  editSaving.value = false;
}

// ── Delete tier ───────────────────────────────────────────────────────────────
const deletingId = ref<string | null>(null);

async function deleteTier(id: string) {
  if (!confirm("Delete this tier?")) return;
  deletingId.value = id;
  try {
    await api.deleteTier(id);
    await fetchTiers();
  } catch (e: any) {
    alert(e?.response?.data?.message ?? "Delete failed.");
  }
  deletingId.value = null;
}

// ── Gift Bonus Tiers (rolling 7-day agency host income) ───────────────────────
const giftBonusTiers = ref<api.GiftBonusTierDTO[]>([]);
const loadingGiftBonusTiers = ref(true);
const giftBonusTierError = ref("");

async function fetchGiftBonusTiers() {
  loadingGiftBonusTiers.value = true;
  giftBonusTierError.value = "";
  try {
    giftBonusTiers.value = await api.listGiftBonusTiers();
  } catch {
    giftBonusTierError.value = "Failed to load gift bonus tiers.";
  }
  loadingGiftBonusTiers.value = false;
}

const gbShowAddForm = ref(false);
const gbAddName = ref("");
const gbAddIncome = ref("");
const gbAddRate = ref("");
const gbAddSaving = ref(false);
const gbAddError = ref("");

async function submitGiftBonusTierAdd() {
  gbAddError.value = "";
  const rate = parseFloat(gbAddRate.value) / 100;
  if (!gbAddName.value.trim()) {
    gbAddError.value = "Name is required.";
    return;
  }
  if (!/^\d+$/.test(gbAddIncome.value)) {
    gbAddError.value = "Min rolling income must be a whole number (beans).";
    return;
  }
  if (isNaN(rate) || rate < 0 || rate > 1) {
    gbAddError.value = "Rate must be 0–100%.";
    return;
  }
  gbAddSaving.value = true;
  try {
    await api.createGiftBonusTier({
      name: gbAddName.value.trim(),
      minRollingIncome: gbAddIncome.value,
      bonusRate: rate,
    });
    gbAddName.value = "";
    gbAddIncome.value = "";
    gbAddRate.value = "";
    gbShowAddForm.value = false;
    await fetchGiftBonusTiers();
    await fetchBonus();
    lastSyncedAt.value = new Date();
  } catch (e: any) {
    gbAddError.value = e?.message ?? "Failed to create tier.";
  }
  gbAddSaving.value = false;
}

const gbEditingId = ref<string | null>(null);
const gbEditName = ref("");
const gbEditIncome = ref("");
const gbEditRate = ref("");
const gbEditSaving = ref(false);
const gbEditError = ref("");

function startGiftBonusTierEdit(t: api.GiftBonusTierDTO) {
  gbEditingId.value = t.id;
  gbEditName.value = t.name;
  gbEditIncome.value = t.minRollingIncome;
  gbEditRate.value = (t.bonusRate * 100).toFixed(2);
  gbEditError.value = "";
}

function cancelGiftBonusTierEdit() {
  gbEditingId.value = null;
}

async function saveGiftBonusTierEdit() {
  gbEditError.value = "";
  const rate = parseFloat(gbEditRate.value) / 100;
  if (!gbEditName.value.trim()) {
    gbEditError.value = "Name required.";
    return;
  }
  if (!/^\d+$/.test(gbEditIncome.value)) {
    gbEditError.value = "Income must be a whole number.";
    return;
  }
  if (isNaN(rate) || rate < 0 || rate > 1) {
    gbEditError.value = "Rate must be 0–100%.";
    return;
  }
  gbEditSaving.value = true;
  try {
    await api.updateGiftBonusTier(gbEditingId.value!, {
      name: gbEditName.value.trim(),
      minRollingIncome: gbEditIncome.value,
      bonusRate: rate,
    });
    gbEditingId.value = null;
    await fetchGiftBonusTiers();
    await fetchBonus();
    lastSyncedAt.value = new Date();
  } catch (e: any) {
    gbEditError.value = e?.message ?? "Save failed.";
  }
  gbEditSaving.value = false;
}

const gbDeletingId = ref<string | null>(null);

async function deleteGiftBonusTierRow(id: string) {
  if (!confirm("Delete this gift bonus tier?")) return;
  gbDeletingId.value = id;
  try {
    await api.deleteGiftBonusTier(id);
    await fetchGiftBonusTiers();
    await fetchBonus();
    lastSyncedAt.value = new Date();
  } catch (e: any) {
    alert(e?.message ?? "Delete failed.");
  }
  gbDeletingId.value = null;
}

// ── Gift bonus singleton (global enable + fallback when no tier rows) ─────────
const bonus = ref<api.BonusSettingDTO | null>(null);
const loadingBonus = ref(true);
const giftBonusEnabled = ref(true);
const bonusRate = ref("");
const bonusSaving = ref(false);
const bonusError = ref("");
const bonusSaved = ref(false);

async function fetchBonus() {
  loadingBonus.value = true;
  try {
    bonus.value = await api.getBonusSetting();
    giftBonusEnabled.value = bonus.value.enabled;
    bonusRate.value = (bonus.value.bonusRate * 100).toFixed(2);
  } catch {}
  loadingBonus.value = false;
}

async function saveBonus() {
  bonusError.value = "";
  bonusSaved.value = false;
  const rate = parseFloat(bonusRate.value) / 100;
  if (isNaN(rate) || rate < 0 || rate > 1) {
    bonusError.value = "Rate must be 0–100%.";
    return;
  }
  bonusSaving.value = true;
  try {
    bonus.value = await api.updateBonusSetting({
      enabled: giftBonusEnabled.value,
      bonusRate: rate,
    });
    giftBonusEnabled.value = bonus.value.enabled;
    bonusSaved.value = true;
    lastSyncedAt.value = new Date();
    void fetchGiftBonusTiers();
    setTimeout(() => {
      bonusSaved.value = false;
    }, 2500);
  } catch (e: any) {
    bonusError.value = e?.message ?? "Save failed.";
  }
  bonusSaving.value = false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtIncome(s: string) {
  try {
    return BigInt(s).toLocaleString();
  } catch {
    return s;
  }
}

function fmtPct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

onMounted(() => {
  void refreshAll();
  pollTimer = setInterval(() => void refreshAll(), POLL_MS);
  document.addEventListener("visibilitychange", onVisibilityRefresh);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener("visibilitychange", onVisibilityRefresh);
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Commission Config</h1>
        <p class="page-sub">
          Agency commission tiers (30-day turnover coins), gift-bonus tiers
          (7-day agency-attributed gift income), global gift-bonus on/off, and
          fallback rate when no tiers exist
        </p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="btn btn-outline btn-sm"
          @click="refreshAll()"
        >
          Refresh now
        </button>
      </div>
    </div>

    <p class="sync-strip dim">
      Last synced: {{ lastSyncedDisplay }} · Auto-refresh every 30s while this
      page is open · Also refreshes when you return to this tab
    </p>

    <!-- ── Gift bonus (global) ─────────────────────────────────────────────── -->
    <div class="settings-card gift-bonus-master">
      <div class="card-header">
        <div>
          <h2 class="card-title">Gift bonus</h2>
          <p class="card-sub">
            Master switch for gift bonus payouts. When off, tiers, fallback
            rate, and per-agency overrides do not apply until you turn it back on.
          </p>
        </div>
      </div>

      <div v-if="loadingBonus" class="loading">Loading gift bonus settings…</div>
      <div v-else class="bonus-form">
        <label class="toggle-row">
          <input
            v-model="giftBonusEnabled"
            type="checkbox"
            class="toggle-input"
          />
          <span class="toggle-text">Gift bonus enabled</span>
        </label>
        <p v-if="!giftBonusEnabled" class="status-note">
          Gift bonus is <strong>off</strong> — no bonus beans are credited on gifts.
        </p>
        <div class="bonus-actions bonus-actions-top">
          <button
            class="btn btn-primary"
            :disabled="bonusSaving"
            @click="saveBonus"
          >
            {{ bonusSaving ? "Saving…" : "Save" }}
          </button>
          <span v-if="bonusSaved" class="saved-badge">Saved ✓</span>
        </div>
        <p v-if="bonusError" class="form-error">{{ bonusError }}</p>
      </div>
    </div>

    <!-- ── Commission Tiers ────────────────────────────────────────────────── -->
    <div class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Commission Tiers</h2>
          <p class="card-sub">
            Agencies are assigned a tier from rolling 30-day agency turnover
            (total gift turnover in coins to the agent and their agent_hosts)
          </p>
        </div>
        <button class="btn btn-primary" @click="showAddForm = !showAddForm">
          {{ showAddForm ? "Cancel" : "+ Add Tier" }}
        </button>
      </div>

      <!-- Add form -->
      <div v-if="showAddForm" class="add-form">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Tier Name</label>
            <input v-model="addName" class="form-input" placeholder="e.g. A" />
          </div>
          <div class="form-field">
            <label class="form-label">Min Turnover (coins / 30 days)</label>
            <input
              v-model="addIncome"
              class="form-input"
              placeholder="e.g. 0"
            />
          </div>
          <div class="form-field">
            <label class="form-label">Commission Rate (%)</label>
            <input
              v-model="addRate"
              class="form-input"
              placeholder="e.g. 4.00"
              type="number"
              min="0"
              max="100"
              step="0.01"
            />
          </div>
          <div class="form-field form-field-action">
            <label class="form-label">&nbsp;</label>
            <button
              class="btn btn-primary"
              :disabled="addSaving"
              @click="submitAdd"
            >
              {{ addSaving ? "Saving…" : "Save" }}
            </button>
          </div>
        </div>
        <p v-if="addError" class="form-error">{{ addError }}</p>
      </div>

      <div v-if="loadingTiers" class="loading">Loading tiers…</div>
      <div v-else-if="tierError" class="loading error-text">
        {{ tierError }}
      </div>
      <div v-else-if="tiers.length === 0" class="loading">
        No tiers defined yet.
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="num">Min Turnover (coins)</th>
            <th class="num">Commission Rate</th>
            <th class="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tiers" :key="t.id">
            <!-- Viewing row -->
            <template v-if="editingId !== t.id">
              <td class="fw">{{ t.name }}</td>
              <td class="num mono">{{ fmtIncome(t.minHostIncome) }}</td>
              <td class="num">{{ fmtPct(t.commissionRate) }}</td>
              <td class="actions actions-td">
                <RowActionMenu>
                  <RowActionMenuItem @click="startEdit(t)">Edit</RowActionMenuItem>
                  <RowActionMenuItem
                    variant="danger"
                    :disabled="deletingId === t.id"
                    @click="deleteTier(t.id)"
                  >
                    {{ deletingId === t.id ? "…" : "Delete" }}
                  </RowActionMenuItem>
                </RowActionMenu>
              </td>
            </template>

            <!-- Editing row -->
            <template v-else>
              <td><input v-model="editName" class="inline-input" /></td>
              <td class="num">
                <input v-model="editIncome" class="inline-input num-input" />
              </td>
              <td class="num">
                <input
                  v-model="editRate"
                  class="inline-input num-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </td>
              <td class="actions actions-td">
                <RowActionMenu>
                  <RowActionMenuItem
                    variant="success"
                    :disabled="editSaving"
                    @click="saveEdit"
                  >
                    {{ editSaving ? "…" : "Save" }}
                  </RowActionMenuItem>
                  <RowActionMenuItem @click="cancelEdit">Cancel</RowActionMenuItem>
                </RowActionMenu>
              </td>
            </template>
          </tr>
          <!-- Inline edit error -->
          <tr v-if="editingId && editError">
            <td colspan="4" class="edit-error">{{ editError }}</td>
          </tr>
        </tbody>
      </table>
    </div>


    <!-- ── Gift Bonus Tiers (rolling 7-day) ─────────────────────────────────── -->
    <div class="table-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Gift Bonus Tiers</h2>
          <p class="card-sub">
            Requires <strong>Gift bonus</strong> enabled above. Each agency’s
            gift bonus rate follows the
            <strong>highest</strong> tier whose minimum is at or below its
            rolling <strong>7-day</strong> agency-attributed gift income (direct
            agency gifts and gifts to hosts under the agency, beans, based on
            70% host return), excluding the current gift. Per-agency overrides
            still win when set.
          </p>
        </div>
        <button class="btn btn-primary" @click="gbShowAddForm = !gbShowAddForm">
          {{ gbShowAddForm ? "Cancel" : "+ Add Gift Bonus Tier" }}
        </button>
      </div>

      <div v-if="gbShowAddForm" class="add-form">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Tier Name</label>
            <input
              v-model="gbAddName"
              class="form-input"
              placeholder="e.g. Tier1"
            />
          </div>
          <div class="form-field">
            <label class="form-label"
              >Min rolling income (beans / 7 days)</label
            >
            <input
              v-model="gbAddIncome"
              class="form-input"
              placeholder="e.g. 300000"
            />
          </div>
          <div class="form-field">
            <label class="form-label">Bonus rate (% of host share)</label>
            <input
              v-model="gbAddRate"
              class="form-input"
              placeholder="e.g. 5.00"
              type="number"
              min="0"
              max="100"
              step="0.01"
            />
          </div>
          <div class="form-field form-field-action">
            <label class="form-label">&nbsp;</label>
            <button
              class="btn btn-primary"
              :disabled="gbAddSaving"
              @click="submitGiftBonusTierAdd"
            >
              {{ gbAddSaving ? "Saving…" : "Save" }}
            </button>
          </div>
        </div>
        <p v-if="gbAddError" class="form-error">{{ gbAddError }}</p>
      </div>

      <div v-if="loadingGiftBonusTiers" class="loading">
        Loading gift bonus tiers…
      </div>
      <div v-else-if="giftBonusTierError" class="loading error-text">
        {{ giftBonusTierError }}
      </div>
      <div v-else-if="giftBonusTiers.length === 0" class="loading">
        No gift bonus tiers. Add tiers above, or leave empty to use the
        <strong>fallback rate</strong> below.
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="num">Min rolling income (beans)</th>
            <th class="num">Bonus rate</th>
            <th class="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in giftBonusTiers" :key="t.id">
            <template v-if="gbEditingId !== t.id">
              <td class="fw">{{ t.name }}</td>
              <td class="num mono">{{ fmtIncome(t.minRollingIncome) }}</td>
              <td class="num">{{ fmtPct(t.bonusRate) }}</td>
              <td class="actions actions-td">
                <RowActionMenu>
                  <RowActionMenuItem @click="startGiftBonusTierEdit(t)">Edit</RowActionMenuItem>
                  <RowActionMenuItem
                    variant="danger"
                    :disabled="gbDeletingId === t.id"
                    @click="deleteGiftBonusTierRow(t.id)"
                  >
                    {{ gbDeletingId === t.id ? "…" : "Delete" }}
                  </RowActionMenuItem>
                </RowActionMenu>
              </td>
            </template>
            <template v-else>
              <td><input v-model="gbEditName" class="inline-input" /></td>
              <td class="num">
                <input v-model="gbEditIncome" class="inline-input num-input" />
              </td>
              <td class="num">
                <input
                  v-model="gbEditRate"
                  class="inline-input num-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </td>
              <td class="actions actions-td">
                <RowActionMenu>
                  <RowActionMenuItem
                    variant="success"
                    :disabled="gbEditSaving"
                    @click="saveGiftBonusTierEdit"
                  >
                    {{ gbEditSaving ? "…" : "Save" }}
                  </RowActionMenuItem>
                  <RowActionMenuItem @click="cancelGiftBonusTierEdit">Cancel</RowActionMenuItem>
                </RowActionMenu>
              </td>
            </template>
          </tr>
          <tr v-if="gbEditingId && gbEditError">
            <td colspan="4" class="edit-error">{{ gbEditError }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Gift bonus fallback (only when no tier rows exist) ─────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Gift bonus fallback rate</h2>
          <p class="card-sub">
            Requires <strong>Gift bonus</strong> enabled above. Live payouts use
            <strong>Gift Bonus Tiers</strong> when any tier rows exist. This
            percentage applies only when <strong>no</strong> tiers are configured.
          </p>
        </div>
      </div>

      <div v-if="loadingBonus" class="loading">Loading…</div>
      <div v-else class="bonus-form">
        <div class="bonus-row">
          <div class="bonus-rate-field">
            <label class="form-label">Fallback bonus rate (% of host share)</label>
            <input
              v-model="bonusRate"
              class="form-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 15.00"
              :disabled="!giftBonusEnabled"
            />
          </div>

          <div class="bonus-actions">
            <button
              class="btn btn-primary"
              :disabled="bonusSaving"
              @click="saveBonus"
            >
              {{ bonusSaving ? "Saving…" : "Save" }}
            </button>
            <span v-if="bonusSaved" class="saved-badge">Saved ✓</span>
          </div>
        </div>
        <p v-if="bonusError" class="form-error">{{ bonusError }}</p>
        <p v-if="bonus" class="bonus-meta dim">
          Last updated: {{ new Date(bonus.updatedAt).toLocaleString() }}
          <span v-if="bonus.updatedBy"> · by {{ bonus.updatedBy }}</span>
        </p>
      </div>
    </div>
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
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.sync-strip {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 16px;
  line-height: 1.45;
}

/* Cards */
.table-card,
.settings-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
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
}

/* Add form */
.add-form {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--row-hover, rgba(255, 255, 255, 0.02));
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
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.form-error {
  font-size: 12px;
  color: #ef4444;
  margin: 8px 0 0;
}

/* Table */
.loading {
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.error-text {
  color: #ef4444;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.data-table th.num {
  text-align: right;
}
.data-table th.actions {
  text-align: right;
  width: 160px;
}
.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-subtle, var(--border));
}
.data-table td.num {
  text-align: right;
}
.data-table td.actions {
  text-align: right;
}
.data-table tbody tr:last-child td {
  border-bottom: none;
}
.data-table tbody tr:hover {
  background: var(--row-hover, rgba(255, 255, 255, 0.03));
}

.fw {
  font-weight: 600;
}
.dim {
  color: var(--text-muted);
}
.mono {
  font-family: monospace;
  font-size: 12px;
}

/* Inline edit */
.inline-input {
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--primary);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.num-input {
  text-align: right;
}
.edit-error {
  font-size: 12px;
  color: #ef4444;
  padding: 4px 16px 8px !important;
}

/* Buttons */
.btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.btn-outline:hover:not(:disabled) {
  background: var(--row-hover, rgba(255, 255, 255, 0.05));
}
.btn-danger {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
}
.btn-danger:hover:not(:disabled) {
  background: #ef444415;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Gift Bonus */
.bonus-form {
  padding: 20px 24px;
}
.bonus-row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}

.bonus-rate-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bonus-rate-field .form-input {
  width: 140px;
}

.bonus-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.saved-badge {
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
}

.bonus-meta {
  font-size: 12px;
  margin: 12px 0 0;
}

.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
}
.toggle-input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}
.toggle-text {
  font-size: 14px;
  color: var(--text-primary);
}
.status-note {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 12px;
}
.bonus-actions-top {
  margin-top: 4px;
}
.gift-bonus-master {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 35%, transparent);
}

@media (max-width: 768px) {
  .form-row,
  .bonus-row {
    flex-direction: column;
    align-items: stretch;
  }
  .bonus-rate-field .form-input {
    width: 100%;
  }
}
</style>
