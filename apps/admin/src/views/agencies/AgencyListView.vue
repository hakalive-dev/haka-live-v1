<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import * as agenciesApi from "@/api/agencies";
import { listBds } from "@/api/bd";
import * as commissionApi from "@/api/commissionConfig";
import type { CommissionLedgerRowDTO } from "@/api/commissionConfig";
import * as staffApi from "@/api/staff";
import * as usersApi from "@/api/users";
import Pagination from "@/components/common/Pagination.vue";
import RowActionMenu from "@/components/common/RowActionMenu.vue";
import RowActionMenuItem from "@/components/common/RowActionMenuItem.vue";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";
import { useRouter } from "vue-router";

const toast = useToastStore();
const auth = useAuthStore();
const router = useRouter();

// ── List state ────────────────────────────────────────────────────────────────
const agencies = ref<any[]>([]);
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 });
const search = ref("");
const statusFilter = ref("");
const loading = ref(true);

function fmtBeans(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function fmtFraud(agency: any): string {
  const s = agency?.metrics?.fraudRiskScore;
  if (s == null) return "—";
  const lvl = agency?.metrics?.fraudRiskLevel ?? "none";
  return `${s} (${lvl})`;
}

function fmtLastActivity(agency: any): string {
  const iso = agency?.metrics?.lastActivityAt;
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

async function fetchAgencies() {
  loading.value = true;
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    };
    if (search.value) params.search = search.value;
    if (statusFilter.value) params.status = statusFilter.value;
    const result = await agenciesApi.listAgencies(params);
    agencies.value = result.agencies;
    pagination.value = result.pagination;
  } catch {}
  loading.value = false;
}

function handleSearch() {
  pagination.value.page = 1;
  fetchAgencies();
}

// ── Drawer ────────────────────────────────────────────────────────────────────
const drawerOpen = ref(false);
const drawerAgency = ref<any>(null);
const drawerLoading = ref(false);
const drawerTab = ref<"detail" | "analytics" | "wallet">("detail");
const analytics = ref<any>(null);
const analyticsPeriod = ref("month");
const analyticsLoading = ref(false);
const retention = ref<any>(null);
const retentionWindow = ref<'7d' | '30d'>('30d');
const retentionLoading = ref(false);
const wallet = ref<any>(null);
const walletLoading = ref(false);
const showActiveHostsOnly = ref(false);

const commissionOverridePct = ref("");
const giftBonusOverridePct = ref("");
const giftBonusProgramEnabled = ref(true);
const commissionValidUntilLocal = ref("");
const giftBonusValidUntilLocal = ref("");
const overrideSaving = ref<"commission" | "gift_bonus" | "gift_program" | null>(null);

const ledgerRows = ref<CommissionLedgerRowDTO[]>([]);
const ledgerCursor = ref<string | null>(null);
const ledgerLoading = ref(false);

async function openDrawer(agency: any) {
  drawerOpen.value = true;
  drawerTab.value = "detail";
  drawerLoading.value = true;
  drawerAgency.value = null;
  analytics.value = null;
  retention.value = null;
  wallet.value = null;
  showActiveHostsOnly.value = false;
  ledgerRows.value = [];
  ledgerCursor.value = null;
  commissionOverridePct.value = "";
  giftBonusOverridePct.value = "";
  commissionValidUntilLocal.value = "";
  giftBonusValidUntilLocal.value = "";
  try {
    drawerAgency.value = await agenciesApi.getAgencyDetail(agency.id);
    syncOverrideInputsFromAgency();
  } catch {}
  drawerLoading.value = false;
}

function pctInputFromRate(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  const p = Math.round(n * 1e6) / 1e4;
  if (Number.isInteger(p)) return String(p);
  return String(p);
}

/** `datetime-local` value in browser local timezone */
function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIsoUtc(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function syncOverrideInputsFromAgency() {
  const a = drawerAgency.value;
  if (!a) return;
  commissionOverridePct.value = pctInputFromRate(a.commissionRateOverride);
  giftBonusOverridePct.value = pctInputFromRate(a.giftBonusRateOverride);
  giftBonusProgramEnabled.value = a.giftBonusEnabled !== false;
  commissionValidUntilLocal.value = isoToDatetimeLocal(
    a.commissionRateOverrideValidUntil,
  );
  giftBonusValidUntilLocal.value = isoToDatetimeLocal(
    a.giftBonusRateOverrideValidUntil,
  );
}

function overridePromoHint(
  rate: unknown,
  validUntilIso: string | null | undefined,
): string {
  if (rate == null || rate === "") return "";
  if (!validUntilIso) return "No end date — override applies until cleared.";
  const until = new Date(validUntilIso).getTime();
  if (Number.isNaN(until)) return "";
  if (Date.now() > until) return "End date passed — new gifts use tier tables.";
  return `Active through ${new Date(validUntilIso).toLocaleString()} (server evaluates each gift’s time).`;
}

function parsePctInputToRate(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0 || n > 100) return null;
  return n / 100;
}

async function saveCommissionOverride() {
  if (!drawerAgency.value) return;
  const rate = parsePctInputToRate(commissionOverridePct.value);
  if (rate === null) {
    toast.error(
      "Invalid percentage",
      "Enter a number from 0 to 100, or use Clear override.",
    );
    return;
  }
  overrideSaving.value = "commission";
  try {
    await commissionApi.setAgencyCommissionOverride(
      drawerAgency.value.id,
      rate,
      datetimeLocalToIsoUtc(commissionValidUntilLocal.value),
    );
    toast.success("Commission override saved");
    await refreshDrawer();
  } catch (e: any) {
    toast.error("Save failed", e?.message);
  } finally {
    overrideSaving.value = null;
  }
}

async function clearCommissionOverride() {
  if (!drawerAgency.value) return;
  overrideSaving.value = "commission";
  try {
    await commissionApi.setAgencyCommissionOverride(
      drawerAgency.value.id,
      null,
    );
    toast.success("Commission override cleared");
    commissionOverridePct.value = "";
    commissionValidUntilLocal.value = "";
    await refreshDrawer();
  } catch (e: any) {
    toast.error("Clear failed", e?.message);
  } finally {
    overrideSaving.value = null;
  }
}

async function saveGiftBonusProgram() {
  if (!drawerAgency.value) return;
  overrideSaving.value = "gift_program";
  try {
    drawerAgency.value = await agenciesApi.updateAgency(drawerAgency.value.id, {
      giftBonusEnabled: giftBonusProgramEnabled.value,
    });
    syncOverrideInputsFromAgency();
    toast.success(
      "Saved",
      giftBonusProgramEnabled.value
        ? "Gift bonus program enabled for this agency."
        : "Gift bonus off for this agency (commission only; level tasks are host-level and unchanged).",
    );
    await fetchAgencies();
  } catch (e: any) {
    toast.error("Save failed", e?.message);
  }
  overrideSaving.value = null;
}

async function saveGiftBonusOverride() {
  if (!drawerAgency.value) return;
  const rate = parsePctInputToRate(giftBonusOverridePct.value);
  if (rate === null) {
    toast.error(
      "Invalid percentage",
      "Enter a number from 0 to 100, or use Clear override.",
    );
    return;
  }
  overrideSaving.value = "gift_bonus";
  try {
    await commissionApi.setAgencyGiftBonusOverride(
      drawerAgency.value.id,
      rate,
      datetimeLocalToIsoUtc(giftBonusValidUntilLocal.value),
    );
    toast.success("Gift bonus override saved");
    await refreshDrawer();
  } catch (e: any) {
    toast.error("Save failed", e?.message);
  } finally {
    overrideSaving.value = null;
  }
}

async function clearGiftBonusOverride() {
  if (!drawerAgency.value) return;
  overrideSaving.value = "gift_bonus";
  try {
    await commissionApi.setAgencyGiftBonusOverride(drawerAgency.value.id, null);
    toast.success("Gift bonus override cleared");
    giftBonusOverridePct.value = "";
    giftBonusValidUntilLocal.value = "";
    await refreshDrawer();
  } catch (e: any) {
    toast.error("Clear failed", e?.message);
  } finally {
    overrideSaving.value = null;
  }
}

function ledgerKindLabel(kind: string) {
  if (kind === "direct") return "Direct";
  if (kind === "parent_delta") return "Parent delta";
  if (kind === "gift_bonus") return "Gift bonus";
  return kind;
}

async function loadLedgerPage(append: boolean) {
  if (!drawerAgency.value) return;
  ledgerLoading.value = true;
  try {
    const page = await commissionApi.getAgencyCommissionLedger(
      drawerAgency.value.id,
      {
        cursor: append ? (ledgerCursor.value ?? undefined) : undefined,
        limit: 40,
      },
    );
    ledgerRows.value = append ? [...ledgerRows.value, ...page.rows] : page.rows;
    ledgerCursor.value = page.nextCursor;
  } catch (e: any) {
    toast.error("Ledger load failed", e?.message);
  } finally {
    ledgerLoading.value = false;
  }
}

async function loadAnalytics() {
  if (!drawerAgency.value) return;
  analyticsLoading.value = true;
  try {
    analytics.value = await agenciesApi.getAgencyAnalytics(
      drawerAgency.value.id,
      analyticsPeriod.value,
    );
  } catch {}
  analyticsLoading.value = false;
}

async function loadRetention() {
  if (!drawerAgency.value) return;
  retentionLoading.value = true;
  try {
    retention.value = await agenciesApi.getAgencyHostRetention(drawerAgency.value.id, retentionWindow.value);
  } catch {}
  retentionLoading.value = false;
}

async function loadWallet() {
  if (!drawerAgency.value) return;
  walletLoading.value = true;
  try {
    const result = await agenciesApi.getAgencyWallet(drawerAgency.value.id);
    wallet.value = result.wallet;
  } catch {}
  walletLoading.value = false;
}

watch(drawerTab, (tab) => {
  if (tab === "analytics" && !analytics.value) loadAnalytics();
  if (tab === "analytics" && !retention.value) loadRetention();
  if (tab === "wallet" && !wallet.value) loadWallet();
});

watch(analyticsPeriod, () => {
  if (drawerTab.value === "analytics") loadAnalytics();
});

watch(retentionWindow, () => {
  if (drawerTab.value === "analytics") loadRetention();
});

// ── Create modal ───────────────────────────────────────────────────────────────
const createModal = ref(false);
const createForm = ref({
  name: "",
  ownerMode: "link" as "link" | "create",
  ownerHakaId: "",
  newOwnerName: "",
  newOwnerPhone: "",
  newOwnerCountry: "",
  region: "",
  country: "",
  bdId: "",
  commissionPct: "",
  hostLimit: "",
  withdrawalLimitMonthly: "",
});
const bdOptions = ref<any[]>([]);
const createLoading = ref(false);
const createError = ref("");

async function openCreate() {
  createForm.value = {
    name: "",
    ownerMode: "link",
    ownerHakaId: "",
    newOwnerName: "",
    newOwnerPhone: "",
    newOwnerCountry: "",
    region: "",
    country: "",
    bdId: "",
    commissionPct: "",
    hostLimit: "",
    withdrawalLimitMonthly: "",
  };
  createError.value = "";
  try {
    const res = await listBds();
    bdOptions.value = res.items ?? [];
  } catch {
    bdOptions.value = [];
  }
  createModal.value = true;
}

async function refreshDrawer() {
  if (!drawerAgency.value) return;
  try {
    drawerAgency.value = await agenciesApi.getAgencyDetail(
      drawerAgency.value.id,
    );
    syncOverrideInputsFromAgency();
  } catch {}
}

async function removeHostFromAgency(host: any) {
  if (!drawerAgency.value) return;
  const okConfirm =
    typeof window === "undefined"
      ? true
      : window.confirm(
          `Remove ${host.displayName || "this host"} from ${drawerAgency.value.name}?`,
        );
  if (!okConfirm) return;
  try {
    await agenciesApi.removeHostFromAgency(drawerAgency.value.id, host.id);
    toast.success("Host removed from agency");
    await refreshDrawer();
    await fetchAgencies();
  } catch (e: any) {
    toast.error("Remove failed", e?.message);
  }
}

async function toggleBanHost(host: any) {
  const isBanned = !host.isActive;
  const okConfirm =
    typeof window === "undefined"
      ? true
      : window.confirm(
          `${isBanned ? "Unban" : "Ban"} ${host.displayName || "this host"}?`,
        );
  if (!okConfirm) return;
  try {
    if (isBanned) await usersApi.unbanUser(host.id);
    else await usersApi.banUser(host.id);
    toast.success(isBanned ? "Host unbanned" : "Host banned");
    await refreshDrawer();
  } catch (e: any) {
    toast.error("Action failed", e?.message);
  }
}

async function submitCreate() {
  createError.value = "";
  createLoading.value = true;
  try {
    const f = createForm.value;
    const owner =
      f.ownerMode === "link"
        ? { mode: "link" as const, hakaId: f.ownerHakaId.trim() }
        : {
            mode: "create" as const,
            displayName: f.newOwnerName.trim(),
            phone: f.newOwnerPhone.trim() || undefined,
            country: f.newOwnerCountry.trim() || undefined,
          };
    await agenciesApi.createAgency({
      name: f.name.trim(),
      owner,
      region: f.region.trim() || undefined,
      country: f.country.trim() || undefined,
      bdId: f.bdId || undefined,
      commissionPct: f.commissionPct === "" ? undefined : Number(f.commissionPct),
      hostLimit: f.hostLimit === "" ? undefined : Number(f.hostLimit),
      withdrawalLimitMonthly: f.withdrawalLimitMonthly.trim() || undefined,
    });
    toast.success("Agency created");
    createModal.value = false;
    await fetchAgencies();
  } catch (e: any) {
    createError.value = e?.message || "Failed to create agency";
  }
  createLoading.value = false;
}

// ── Edit modal ────────────────────────────────────────────────────────────────
const editModal = ref(false);
const editForm = ref({
  name: "",
  description: "",
  bdId: "",
  region: "",
  hostLimit: "0",
  withdrawalLimitBeans: "0",
});
const editLoading = ref(false);
const editError = ref("");

async function openEdit(agency: any) {
  editForm.value = {
    name: agency.name,
    description: agency.description || "",
    bdId: agency.bdId || "",
    region: agency.region || "",
    hostLimit: String(agency.hostLimit ?? 0),
    withdrawalLimitBeans: String(agency.withdrawalLimitBeans ?? 0),
  };
  editError.value = "";
  // Load BD options so the agency can be (re)assigned to a BD by name.
  try {
    const res = await listBds();
    bdOptions.value = res.items ?? [];
  } catch {
    bdOptions.value = [];
  }
  editModal.value = true;
}

async function submitEdit() {
  if (!drawerAgency.value) return;
  editError.value = "";
  editLoading.value = true;
  try {
    drawerAgency.value = await agenciesApi.updateAgency(drawerAgency.value.id, {
      name: editForm.value.name,
      description: editForm.value.description,
      bdId: editForm.value.bdId || null,
      region: editForm.value.region || null,
      hostLimit: Number(editForm.value.hostLimit),
      withdrawalLimitBeans: Number(editForm.value.withdrawalLimitBeans),
    });
    editModal.value = false;
    await fetchAgencies();
  } catch (e: any) {
    editError.value = e?.message || "Failed";
  }
  editLoading.value = false;
}

async function toggleFreezeWithdrawals(agency: any) {
  const isFrozen = Boolean(agency?.metrics?.frozen);
  const okConfirm =
    typeof window === "undefined"
      ? true
      : window.confirm(
          `${isFrozen ? "Unfreeze" : "Freeze"} withdrawals for ${agency.name}?`,
        );
  if (!okConfirm) return;
  try {
    if (isFrozen) {
      await agenciesApi.unfreezeAgencyWithdrawals(agency.id, {
        reason: "admin_unfreeze",
        severity: "high",
        duration: "permanent",
        cascadeToHosts: true,
      });
      toast.success("Withdrawals unfrozen");
    } else {
      await agenciesApi.freezeAgencyWithdrawals(agency.id, {
        reason: "admin_freeze",
        severity: "high",
        duration: "permanent",
        cascadeToHosts: true,
      });
      toast.warning("Withdrawals frozen", "Bean withdrawals are blocked (risk control).");
    }
    await fetchAgencies();
    if (drawerAgency.value?.id === agency.id) await refreshDrawer();
  } catch (e: any) {
    toast.error("Action failed", e?.message);
  }
}

function viewAgencyLogs(agency: any) {
  router.push({ path: "/audit-log", query: { targetId: agency.id } });
}

async function viewRevenue(agency: any) {
  await openDrawer(agency);
  drawerTab.value = "analytics";
}

// ── Status modal ──────────────────────────────────────────────────────────────
const statusModal = ref(false);
const newStatus = ref("");
const statusLoading = ref(false);

function openStatusModal(agency: any) {
  newStatus.value = agency.status;
  statusModal.value = true;
}

async function submitStatus() {
  if (!drawerAgency.value) return;
  statusLoading.value = true;
  try {
    drawerAgency.value = await agenciesApi.setAgencyStatus(
      drawerAgency.value.id,
      newStatus.value,
    );
    toast.success("Status Updated");
    statusModal.value = false;
    await fetchAgencies();
  } catch (e: any) {
    toast.error("Update Failed", e?.message);
  }
  statusLoading.value = false;
}

// ── Assign admin modal ────────────────────────────────────────────────────────
const assignModal = ref(false);
const allAdmins = ref<any[]>([]);
const selectedAdmin = ref("");
const assignLoading = ref(false);
const assignError = ref("");

async function openAssignModal() {
  assignError.value = "";
  selectedAdmin.value = "";
  assignModal.value = true;
  try {
    allAdmins.value = await staffApi.listAdmins();
  } catch {}
}

async function submitAssign() {
  if (!drawerAgency.value || !selectedAdmin.value) return;
  assignError.value = "";
  assignLoading.value = true;
  try {
    await agenciesApi.assignAdmin(drawerAgency.value.id, selectedAdmin.value);
    assignModal.value = false;
    drawerAgency.value = await agenciesApi.getAgencyDetail(
      drawerAgency.value.id,
    );
  } catch (e: any) {
    assignError.value = e?.message || "Failed";
  }
  assignLoading.value = false;
}

async function removeAdmin(adminId: string) {
  if (!drawerAgency.value) return;
  try {
    await agenciesApi.removeAdminAssignment(drawerAgency.value.id, adminId);
    toast.success("Admin Removed");
    drawerAgency.value = await agenciesApi.getAgencyDetail(
      drawerAgency.value.id,
    );
  } catch (e: any) {
    toast.error("Remove Failed", e?.message);
  }
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const deleteConfirm = ref(false);
const deleteLoading = ref(false);

async function confirmDelete() {
  if (!drawerAgency.value) return;
  deleteLoading.value = true;
  try {
    await agenciesApi.deleteAgency(drawerAgency.value.id);
    toast.success("Agency Deleted");
    deleteConfirm.value = false;
    drawerOpen.value = false;
    await fetchAgencies();
  } catch (e: any) {
    toast.error("Delete Failed", e?.message);
  }
  deleteLoading.value = false;
}

// ── Transfer Host modal ───────────────────────────────────────────────────────
const showTransfer = ref(false);
const transferHostId = ref("");
const transferToAgencyId = ref("");
const transferSaving = ref(false);
const transferError = ref("");

async function handleTransfer() {
  transferSaving.value = true;
  transferError.value = "";
  try {
    await agenciesApi.transferHost(
      transferHostId.value,
      transferToAgencyId.value,
    );
    showTransfer.value = false;
    transferHostId.value = "";
    transferToAgencyId.value = "";
    await fetchAgencies();
  } catch (e: any) {
    transferError.value = e?.message || "Transfer failed";
  } finally {
    transferSaving.value = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusClass(status: string) {
  if (status === "active") return "badge-active";
  if (status === "suspended") return "badge-suspended";
  return "badge-banned";
}

function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function fmtRatePct(v: any) {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return (n * 100).toFixed(2).replace(/\.00$/, "") + "%";
}

/** Reference split: host-destination gift, no parent delta / agency-dest gift bonus. */
function fmtIllustrativeCompanyShare(a: any) {
  const p = a?.companyShareIllustrativePercent;
  if (p == null || Number.isNaN(Number(p))) return "—";
  const rounded = Number(p).toFixed(2).replace(/\.00$/, "");
  return `~${rounded}% of gross`;
}

onMounted(fetchAgencies);
watch(() => pagination.value.page, fetchAgencies);
</script>

<template>
  <div class="page">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="search"
          placeholder="Search agency name or owner..."
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <select
          v-model="statusFilter"
          @change="handleSearch"
          class="filter-select"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <button class="btn-primary" @click="handleSearch">Search</button>
      </div>
      <div class="toolbar-right">
        <span class="stat-pill">Total: {{ pagination.total }}</span>
        <button class="btn-ghost" @click="showTransfer = true">
          Transfer Host
        </button>
        <button class="btn-primary" @click="openCreate">
          + New Agency
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading">Loading agencies...</div>
      <div v-else-if="agencies.length === 0" class="loading">
        No agencies found.
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Agency ID</th>
            <th>Agency Name</th>
            <th>Parent BD</th>
            <th>Owner</th>
            <th>Region</th>
            <th>Hosts</th>
            <th>Active Hosts</th>
            <th>Live Hosts</th>
            <th>Host Return %</th>
            <th>Wallet</th>
            <th>Monthly Revenue</th>
            <th>Withdrawals</th>
            <th>Status</th>
            <th>Fraud Risk</th>
            <th>Created</th>
            <th>Last Activity</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="agency in agencies" :key="agency.id">
            <td>
              <div class="cell-name">{{ agency.owner?.hakaId || "—" }}</div>
              <div class="cell-sub mono dim">{{ agency.id.slice(0, 8) }}</div>
            </td>
            <td>
              <div class="cell-name">{{ agency.name }}</div>
              <div class="cell-sub">{{ agency.description || "—" }}</div>
            </td>
            <td>
              <div class="cell-name">{{ agency.bd?.displayName || "—" }}</div>
              <div class="cell-sub">{{ agency.bd?.role || "" }}</div>
            </td>
            <td>
              <div class="cell-name">{{ agency.owner?.displayName || "—" }}</div>
              <div class="cell-sub">{{ agency.owner?.phone || agency.owner?.email || "" }}</div>
            </td>
            <td>
              <div class="cell-name">{{ agency.owner?.country || "—" }}</div>
              <div class="cell-sub">{{ agency.region || "—" }}</div>
            </td>
            <td>{{ agency.metrics?.hostsTotal ?? agency.owner?._count?.hosts ?? 0 }}</td>
            <td>{{ agency.metrics?.hostsActive ?? agency.owner?._count?.activeHosts ?? 0 }}</td>
            <td>{{ agency.metrics?.hostsLive ?? 0 }}</td>
            <td><span class="split-host">70%</span></td>
            <td>
              <div>
                {{
                  agency.owner?.wallet?.coinBalance?.toLocaleString() ?? "—"
                }}
                🪙
              </div>
              <div>
                {{
                  agency.owner?.wallet?.beanBalance?.toLocaleString() ?? "—"
                }}
                🫘
              </div>
            </td>
            <td>
              {{ fmtBeans(agency.metrics?.monthlyRevenueBeans) }} 🫘
            </td>
            <td>{{ fmtBeans(agency.metrics?.monthlyWithdrawalsBeans) }} 🫘</td>
            <td>
              <span class="badge" :class="statusClass(agency.status)">{{ agency.status }}</span>
              <span
                v-if="agency.metrics?.frozen"
                class="badge badge-banned"
                style="margin-left: 6px;"
              >Frozen</span>
            </td>
            <td>{{ fmtFraud(agency) }}</td>
            <td>{{ formatDate(agency.createdAt) }}</td>
            <td>{{ fmtLastActivity(agency) }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem @click="openDrawer(agency)">View</RowActionMenuItem>
                <RowActionMenuItem @click="viewRevenue(agency)">Revenue</RowActionMenuItem>
                <RowActionMenuItem @click="viewAgencyLogs(agency)">Logs</RowActionMenuItem>
                <RowActionMenuItem variant="warning" @click="toggleFreezeWithdrawals(agency)">
                  {{ agency.metrics?.frozen ? "Unfreeze" : "Freeze" }}
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      v-if="pagination.totalPages > 1"
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="
        (p: number) => {
          pagination.page = p;
          fetchAgencies();
        }
      "
    />

    <!-- Detail Modal -->
    <div
      v-if="drawerOpen"
      class="modal-overlay"
      @click.self="drawerOpen = false"
    >
      <div class="agency-modal">
        <div class="modal-header">
          <h3>{{ drawerAgency?.name || "Agency Detail" }}</h3>
          <button class="modal-close" @click="drawerOpen = false">✕</button>
        </div>

        <div v-if="drawerLoading" class="loading">Loading...</div>
        <template v-else-if="drawerAgency">
          <!-- Tabs -->
          <div class="agency-tabs">
            <button
              :class="{ active: drawerTab === 'detail' }"
              @click="drawerTab = 'detail'"
            >
              Detail
            </button>
            <button
              :class="{ active: drawerTab === 'analytics' }"
              @click="drawerTab = 'analytics'"
            >
              Analytics
            </button>
            <button
              :class="{ active: drawerTab === 'wallet' }"
              @click="drawerTab = 'wallet'"
            >
              Wallet
            </button>
          </div>

          <!-- Detail Tab -->
          <div v-if="drawerTab === 'detail'" class="agency-body">
            <!-- Status + Actions -->
            <div class="detail-row">
              <span class="badge" :class="statusClass(drawerAgency.status)">{{
                drawerAgency.status
              }}</span>
              <div class="action-row">
                <button class="btn-sm" @click="openEdit(drawerAgency)">
                  Edit
                </button>
                <button
                  class="btn-sm btn-warn"
                  @click="openStatusModal(drawerAgency)"
                >
                  Change Status
                </button>
                <button class="btn-sm btn-danger" @click="deleteConfirm = true">
                  Delete
                </button>
              </div>
            </div>

            <!-- Info -->
            <div class="info-grid">
              <div class="info-item">
                <label>Description</label>
                <span>{{ drawerAgency.description || "—" }}</span>
              </div>
              <div class="info-item">
                <label>Created</label>
                <span>{{ formatDate(drawerAgency.createdAt) }}</span>
              </div>
            </div>

            <!-- Commission Policy -->
            <div class="section-title">Commission Policy</div>
            <div class="policy-card">
              <div class="policy-row">
                <div class="policy-label">Host return</div>
                <div class="policy-value">70%</div>
              </div>
              <div class="policy-row">
                <div class="policy-label">Agency commission tier</div>
                <div class="policy-value">
                  {{ fmtRatePct(drawerAgency.effectiveCommissionRate) }}
                  <span
                    v-if="drawerAgency.commissionTier?.name"
                    class="policy-sub"
                    >({{ drawerAgency.commissionTier.name }})</span
                  >
                </div>
              </div>
              <div class="policy-row">
                <div class="policy-label">Company share (remainder)</div>
                <div class="policy-value">
                  {{ fmtIllustrativeCompanyShare(drawerAgency) }}
                  <span
                    v-if="
                      drawerAgency.companyShareIllustrativeCompanyBeans != null
                    "
                    class="policy-sub"
                  >
                    ({{
                      Number(
                        drawerAgency.companyShareIllustrativeCompanyBeans,
                      ).toLocaleString()
                    }}
                    beans on
                    {{
                      Number(
                        drawerAgency.companyShareIllustrativeGrossBeans || 0,
                      ).toLocaleString()
                    }}
                    ref.)
                  </span>
                </div>
              </div>
              <div class="policy-row">
                <div class="policy-label">Gift bonus (7d agency gifts)</div>
                <div class="policy-value">
                  {{ fmtRatePct(drawerAgency.effectiveGiftBonusRate) }}
                  <span
                    v-if="drawerAgency.giftBonusTier?.name"
                    class="policy-sub"
                    >({{ drawerAgency.giftBonusTier.name }})</span
                  >
                </div>
              </div>
              <div
                v-if="
                  (drawerAgency.rollingSevenDayAgencyHostIncomeBeans ??
                    drawerAgency.rollingSevenDayOwnIdIncomeBeans) != null
                "
                class="policy-row policy-row-soft"
              >
                <div class="policy-label">
                  7d agency gift rolling (70% basis)
                </div>
                <div class="policy-value policy-value-sm">
                  {{
                    drawerAgency.rollingSevenDayAgencyHostIncomeBeans ??
                    drawerAgency.rollingSevenDayOwnIdIncomeBeans
                  }}
                  🫘
                </div>
              </div>
              <div
                v-if="drawerAgency.rollingCommissionWindowStart"
                class="policy-row policy-row-soft"
              >
                <div class="policy-label">Commission turnover window</div>
                <div class="policy-value policy-value-sm">
                  {{
                    new Date(
                      drawerAgency.rollingCommissionWindowStart,
                    ).toLocaleString()
                  }}
                  –
                  {{
                    new Date(
                      drawerAgency.rollingCommissionWindowEnd,
                    ).toLocaleString()
                  }}
                </div>
              </div>
              <div class="policy-hint">
                Agency commission uses <b>rolling turnover coins</b> from agency
                creation until a full 30-day window applies, then the last 30
                days only. <b>Gift bonus</b> uses 7d agency-attributed gift
                income from Commission Config. Company line is the platform
                <b>remainder</b> after host 70% and agency commission (reference
                gift to host; actual gifts vary with rounding, parent delta, or
                agency-destination bonus).
                <span v-if="drawerAgency.hasParentAgency">
                  This agency has a <b>parent</b>; parent delta can further
                  reduce company share.</span
                >
              </div>
            </div>

            <template v-if="auth.hasPermission('gift.manage')">
              <div class="section-title">Commission overrides</div>
              <div class="policy-card override-card">
                <p class="override-intro">
                  Override the tier tables for this agency only. Rates apply to
                  the agency’s share of host beans (70% of gift value). Use
                  Clear to follow Commission Config tiers again.
                </p>
                <div class="override-block">
                  <div class="override-head">
                    <span class="override-title">Agency commission %</span>
                    <span class="override-meta"
                      >Effective now:
                      {{
                        fmtRatePct(drawerAgency.effectiveCommissionRate)
                      }}</span
                    >
                  </div>
                  <div class="override-row">
                    <input
                      v-model="commissionOverridePct"
                      class="form-input override-input"
                      type="text"
                      inputmode="decimal"
                      placeholder="e.g. 8 for 8%"
                    />
                    <button
                      class="btn-sm btn-primary"
                      :disabled="overrideSaving === 'commission'"
                      @click="saveCommissionOverride"
                    >
                      {{ overrideSaving === "commission" ? "…" : "Save" }}
                    </button>
                    <button
                      class="btn-sm"
                      :disabled="overrideSaving === 'commission'"
                      @click="clearCommissionOverride"
                    >
                      Clear
                    </button>
                  </div>
                  <div class="override-row override-row-datetime">
                    <label class="override-dt-label"
                      >Valid until (local, optional)</label
                    >
                    <input
                      v-model="commissionValidUntilLocal"
                      class="form-input override-datetime"
                      type="datetime-local"
                    />
                  </div>
                  <p class="override-hint">
                    {{
                      overridePromoHint(
                        drawerAgency.commissionRateOverride,
                        drawerAgency.commissionRateOverrideValidUntil,
                      )
                    }}
                  </p>
                </div>
                <div class="override-block">
                  <div class="override-head">
                    <span class="override-title">Gift bonus program</span>
                    <span class="override-meta"
                      >Also requires global gift bonus on (Commission Config)</span
                    >
                  </div>
                  <label class="toggle-row">
                    <input
                      v-model="giftBonusProgramEnabled"
                      type="checkbox"
                      class="toggle-input"
                      :disabled="overrideSaving === 'gift_program'"
                    />
                    <span class="toggle-text">Gift bonus enabled for this agency</span>
                  </label>
                  <p class="override-hint">
                    <template v-if="giftBonusProgramEnabled">
                      Gift bonus payouts on for this agency. Earner leaderboard scores
                      for this agency are hidden on Rank tab. Host level tasks run
                      separately (verified female hosts).
                    </template>
                    <template v-else>
                      Standard commission payouts. Host level tasks and Rank-tab
                      earner scores apply as usual.
                    </template>
                  </p>
                  <button
                    class="btn-sm btn-primary"
                    :disabled="overrideSaving === 'gift_program'"
                    @click="saveGiftBonusProgram"
                  >
                    {{ overrideSaving === "gift_program" ? "…" : "Save program" }}
                  </button>
                </div>
                <div class="override-block">
                  <div class="override-head">
                    <span class="override-title">Gift bonus %</span>
                    <span class="override-meta"
                      >Effective now:
                      {{
                        fmtRatePct(drawerAgency.effectiveGiftBonusRate)
                      }}</span
                    >
                  </div>
                  <div class="override-row">
                    <input
                      v-model="giftBonusOverridePct"
                      class="form-input override-input"
                      type="text"
                      inputmode="decimal"
                      placeholder="e.g. 3 for 3%"
                    />
                    <button
                      class="btn-sm btn-primary"
                      :disabled="overrideSaving === 'gift_bonus'"
                      @click="saveGiftBonusOverride"
                    >
                      {{ overrideSaving === "gift_bonus" ? "…" : "Save" }}
                    </button>
                    <button
                      class="btn-sm"
                      :disabled="overrideSaving === 'gift_bonus'"
                      @click="clearGiftBonusOverride"
                    >
                      Clear
                    </button>
                  </div>
                  <div class="override-row override-row-datetime">
                    <label class="override-dt-label"
                      >Valid until (local, optional)</label
                    >
                    <input
                      v-model="giftBonusValidUntilLocal"
                      class="form-input override-datetime"
                      type="datetime-local"
                    />
                  </div>
                  <p class="override-hint">
                    {{
                      overridePromoHint(
                        drawerAgency.giftBonusRateOverride,
                        drawerAgency.giftBonusRateOverrideValidUntil,
                      )
                    }}
                  </p>
                </div>
              </div>

              <div class="section-title">Agency commission ledger</div>
              <div class="ledger-card">
                <div class="ledger-toolbar">
                  <button
                    class="btn-sm"
                    :disabled="ledgerLoading"
                    @click="loadLedgerPage(false)"
                  >
                    {{ ledgerRows.length ? "Reload" : "Load entries" }}
                  </button>
                  <button
                    v-if="ledgerCursor"
                    class="btn-sm"
                    :disabled="ledgerLoading"
                    @click="loadLedgerPage(true)"
                  >
                    Load more
                  </button>
                </div>
                <div
                  v-if="ledgerLoading && ledgerRows.length === 0"
                  class="empty-text"
                >
                  Loading ledger…
                </div>
                <div v-else-if="ledgerRows.length === 0" class="empty-text">
                  No rows loaded. Use Load entries.
                </div>
                <div v-else class="ledger-scroll">
                  <table class="ledger-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Kind</th>
                        <th>Rate</th>
                        <th>Beans</th>
                        <th>Gift tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in ledgerRows" :key="row.id">
                        <td>{{ new Date(row.createdAt).toLocaleString() }}</td>
                        <td>{{ ledgerKindLabel(row.kind) }}</td>
                        <td>{{ fmtRatePct(row.rateApplied) }}</td>
                        <td>{{ row.beanAmount }}</td>
                        <td class="ledger-tx">{{ row.giftTransactionId }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <!-- Owner -->
            <div class="section-title">Owner (Agent)</div>
            <div class="owner-card">
              <div class="owner-name">
                {{ drawerAgency.owner?.displayName }}
              </div>
              <div class="owner-meta">
                <span>@{{ drawerAgency.owner?.username || "—" }}</span>
                <span>{{ drawerAgency.owner?.hakaId || "" }}</span>
                <span
                  :class="
                    drawerAgency.owner?.isActive ? 'text-green' : 'text-red'
                  "
                >
                  {{ drawerAgency.owner?.isActive ? "Active" : "Banned" }}
                </span>
              </div>
              <div class="owner-hosts">
                <strong>{{ drawerAgency.owner?._count?.hosts ?? 0 }}</strong>
                hosts under this agent
              </div>
            </div>

            <!-- Hosts list -->
            <div v-if="drawerAgency.owner?.hosts?.length > 0">
              <div
                class="section-title"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 10px;
                "
              >
                <span>
                  Hosts
                  <span
                    v-if="drawerAgency.owner?._count?.activeHosts !== undefined"
                  >
                    ({{ drawerAgency.owner._count.activeHosts }} active /
                    {{ drawerAgency.owner.hosts.length }} total)
                  </span>
                  <span v-else>({{ drawerAgency.owner.hosts.length }})</span>
                </span>
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: var(--text-muted);
                    user-select: none;
                  "
                >
                  <input v-model="showActiveHostsOnly" type="checkbox" />
                  Active only
                </label>
              </div>
              <div class="host-list">
                <div
                  v-for="host in showActiveHostsOnly
                    ? drawerAgency.owner.hosts.filter((h: any) => h.isActive)
                    : drawerAgency.owner.hosts"
                  :key="host.id"
                  class="host-row"
                >
                  <span class="host-name">{{ host.displayName }}</span>
                  <span class="host-meta">{{ host.hakaId || "" }}</span>
                  <span
                    class="badge"
                    :class="host.isActive ? 'badge-active' : 'badge-banned'"
                  >
                    {{ host.isActive ? "active" : "banned" }}
                  </span>
                  <span class="host-meta"
                    >Charm Lv {{ host.level?.charmLevel ?? 1 }}</span
                  >
                  <span class="host-meta"
                    >{{
                      host.wallet?.beanBalance?.toLocaleString() ?? 0
                    }}
                    🫘</span
                  >
                  <span class="host-actions">
                    <button class="btn-sm" @click="toggleBanHost(host)">
                      {{ host.isActive ? "Ban" : "Unban" }}
                    </button>
                    <button
                      class="btn-sm btn-danger"
                      @click="removeHostFromAgency(host)"
                    >
                      Remove
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <!-- Assigned Admins -->
            <div
              class="section-title"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>Assigned Admins</span>
              <button class="btn-sm" @click="openAssignModal">+ Assign</button>
            </div>
            <div
              v-if="!drawerAgency.adminAssignments?.length"
              class="empty-text"
            >
              No admins assigned.
            </div>
            <div v-else class="admin-list">
              <div
                v-for="a in drawerAgency.adminAssignments"
                :key="a.adminId"
                class="admin-row"
              >
                <span class="admin-name">{{ a.admin?.displayName }}</span>
                <span class="admin-email">{{ a.admin?.email }}</span>
                <span class="badge badge-admin">{{ a.admin?.role }}</span>
                <button
                  class="btn-sm btn-danger"
                  @click="removeAdmin(a.adminId)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <!-- Analytics Tab -->
          <div v-if="drawerTab === 'analytics'" class="agency-body">
            <div class="analytics-toolbar">
              <select
                v-model="analyticsPeriod"
                @change="loadAnalytics"
                class="filter-select"
              >
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
            </div>
            <div v-if="analyticsLoading" class="loading">
              Loading analytics...
            </div>
            <template v-else-if="analytics">
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-label">Total Hosts</div>
                  <div class="stat-value">{{ analytics.totalHosts }}</div>
                </div>
                <div
                  class="stat-card"
                  v-if="analytics.activeHosts !== undefined"
                >
                  <div class="stat-label">Active Hosts</div>
                  <div class="stat-value">{{ analytics.activeHosts }}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Beans Earned</div>
                  <div class="stat-value">
                    {{ analytics.beansEarned?.toLocaleString() }} 🫘
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Gifts Received</div>
                  <div class="stat-value">
                    {{ analytics.giftsReceived?.toLocaleString() }}
                  </div>
                </div>
              </div>

              <div class="section-title">Host Retention</div>
              <div class="analytics-toolbar" style="margin-top: 6px">
                <select v-model="retentionWindow" class="filter-select">
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </div>
              <div v-if="retentionLoading" class="loading">Loading retention...</div>
              <div v-else-if="retention" class="stat-grid" style="margin-top: 10px">
                <div class="stat-card">
                  <div class="stat-label">Total Hosts</div>
                  <div class="stat-value">{{ retention.totals?.totalHosts ?? 0 }}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Retained Hosts</div>
                  <div class="stat-value">{{ retention.totals?.retainedHosts ?? 0 }}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Retention Rate</div>
                  <div class="stat-value">
                    {{ Math.round(((retention.totals?.retentionRate ?? 0) * 100) * 10) / 10 }}%
                  </div>
                </div>
              </div>

              <div class="section-title">Top Hosts</div>
              <div v-if="!analytics.topHosts?.length" class="empty-text">
                No data for this period.
              </div>
              <div v-else class="host-list">
                <div
                  v-for="(h, i) in analytics.topHosts"
                  :key="i as number"
                  class="host-row"
                >
                  <span class="rank">#{{ (i as number) + 1 }}</span>
                  <span class="host-name">{{
                    h.user?.displayName || "Unknown"
                  }}</span>
                  <span class="host-meta">{{ h.user?.hakaId || "" }}</span>
                  <span class="host-meta"
                    >{{ h.beansEarned?.toLocaleString() }} 🫘</span
                  >
                  <span class="host-meta">{{ h.giftsReceived }} gifts</span>
                </div>
              </div>
            </template>
          </div>

          <!-- Wallet Tab -->
          <div v-if="drawerTab === 'wallet'" class="agency-body">
            <div v-if="walletLoading" class="loading">Loading wallet...</div>
            <template v-else-if="wallet">
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-label">Coin Balance</div>
                  <div class="stat-value">
                    {{ wallet.coinBalance?.toLocaleString() }} 🪙
                  </div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Bean Balance</div>
                  <div class="stat-value">
                    {{ wallet.beanBalance?.toLocaleString() }} 🫘
                  </div>
                </div>
              </div>

              <div class="section-title">Recent Transactions (last 20)</div>
              <div v-if="!wallet.transactions?.length" class="empty-text">
                No transactions.
              </div>
              <table v-else class="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Currency</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Reference</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tx in wallet.transactions" :key="tx.id">
                    <td>
                      <span
                        class="badge"
                        :class="
                          tx.transactionType === 'credit'
                            ? 'badge-active'
                            : 'badge-banned'
                        "
                        >{{ tx.transactionType }}</span
                      >
                    </td>
                    <td>{{ tx.currency }}</td>
                    <td
                      :class="
                        tx.transactionType === 'credit'
                          ? 'text-green'
                          : 'text-red'
                      "
                    >
                      {{ tx.transactionType === "credit" ? "+" : "-"
                      }}{{ tx.amount.toLocaleString() }}
                    </td>
                    <td>{{ tx.balanceAfter.toLocaleString() }}</td>
                    <td>{{ tx.reference || "—" }}</td>
                    <td>{{ formatDate(tx.createdAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
            <div v-else class="empty-text">No wallet data.</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Create Modal -->
    <div
      v-if="createModal"
      class="modal-overlay"
      @click.self="createModal = false"
    >
      <div class="modal">
        <div class="modal-header">
          <h3>New Agency</h3>
          <button class="modal-close" @click="createModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Agency Name *</label>
            <input v-model="createForm.name" placeholder="Agency name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Owner</label>
            <div class="flex gap-4 mb-2">
              <label class="flex items-center gap-1 text-sm">
                <input v-model="createForm.ownerMode" type="radio" value="link" />
                Link by Haka ID
              </label>
              <label class="flex items-center gap-1 text-sm">
                <input v-model="createForm.ownerMode" type="radio" value="create" />
                Create new account
              </label>
            </div>
            <template v-if="createForm.ownerMode === 'link'">
              <input v-model="createForm.ownerHakaId" placeholder="Owner Haka ID" class="form-input" />
            </template>
            <template v-else>
              <input v-model="createForm.newOwnerName" placeholder="Owner display name" class="form-input mb-2" />
              <input v-model="createForm.newOwnerPhone" placeholder="Phone (optional)" class="form-input mb-2" />
              <input v-model="createForm.newOwnerCountry" placeholder="Country (optional)" class="form-input" />
            </template>
          </div>
          <div class="form-group">
            <label>Agency Country</label>
            <input v-model="createForm.country" placeholder="e.g. US" class="form-input" />
          </div>
          <div class="form-group">
            <label>Region</label>
            <input v-model="createForm.region" placeholder="e.g. SEA" class="form-input" />
          </div>
          <div class="form-group">
            <label>Assigned BD</label>
            <select v-model="createForm.bdId" class="form-input">
              <option value="">— None —</option>
              <option v-for="b in bdOptions" :key="b.id" :value="b.id">
                {{ b.displayName }} ({{ b.hakaId || b.email }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Commission %</label>
            <input v-model="createForm.commissionPct" placeholder="e.g. 12" class="form-input" />
          </div>
          <div class="form-group">
            <label>Host Limit</label>
            <input v-model="createForm.hostLimit" placeholder="0 = unlimited" class="form-input" />
          </div>
          <div class="form-group">
            <label>Monthly withdrawal limit (beans)</label>
            <input v-model="createForm.withdrawalLimitMonthly" placeholder="Numeric string, e.g. 1000000" class="form-input" />
          </div>
          <div v-if="createError" class="error-msg">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="createModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="createLoading"
            @click="submitCreate"
          >
            {{ createLoading ? "Creating..." : "Create Agency" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editModal" class="modal-overlay" @click.self="editModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Agency</h3>
          <button class="modal-close" @click="editModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Agency Name</label>
            <input v-model="editForm.name" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea
              v-model="editForm.description"
              class="form-input"
              rows="2"
            />
          </div>
          <div class="form-group">
            <label>Assigned BD</label>
            <select v-model="editForm.bdId" class="form-input">
              <option value="">— None —</option>
              <option v-for="b in bdOptions" :key="b.id" :value="b.id">
                {{ b.displayName }} ({{ b.hakaId || b.email }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Region</label>
            <input v-model="editForm.region" placeholder="e.g. SEA" class="form-input" />
          </div>
          <div class="form-group">
            <label>Host Limit</label>
            <input v-model="editForm.hostLimit" placeholder="0 = unlimited" class="form-input" />
          </div>
          <div class="form-group">
            <label>Withdrawal Limit (beans)</label>
            <input v-model="editForm.withdrawalLimitBeans" placeholder="0 = unlimited" class="form-input" />
          </div>
          <div v-if="editError" class="error-msg">{{ editError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="editModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="editLoading"
            @click="submitEdit"
          >
            {{ editLoading ? "Saving..." : "Save Changes" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Status Modal -->
    <div
      v-if="statusModal"
      class="modal-overlay"
      @click.self="statusModal = false"
    >
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Change Agency Status</h3>
          <button class="modal-close" @click="statusModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>New Status</label>
            <select v-model="newStatus" class="form-input">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="statusModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="statusLoading"
            @click="submitStatus"
          >
            {{ statusLoading ? "Updating..." : "Update Status" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Assign Admin Modal -->
    <div
      v-if="assignModal"
      class="modal-overlay"
      @click.self="assignModal = false"
    >
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Assign Admin</h3>
          <button class="modal-close" @click="assignModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Select Admin</label>
            <select v-model="selectedAdmin" class="form-input">
              <option value="">— Select admin —</option>
              <option v-for="a in allAdmins" :key="a.id" :value="a.id">
                {{ a.displayName }} ({{ a.role }})
              </option>
            </select>
          </div>
          <div v-if="assignError" class="error-msg">{{ assignError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="assignModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="assignLoading || !selectedAdmin"
            @click="submitAssign"
          >
            {{ assignLoading ? "Assigning..." : "Assign" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Transfer Host Modal -->
    <div
      v-if="showTransfer"
      class="modal-overlay"
      @click.self="showTransfer = false"
    >
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Transfer Host to Agency</h3>
          <button class="modal-close" @click="showTransfer = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Host account UUID</label>
            <input
              v-model="transferHostId"
              placeholder="Host account UUID"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>Target Agency ID (or agent account UUID)</label>
            <input
              v-model="transferToAgencyId"
              placeholder="Paste the Agency ID from the list, or the agent (owner) account UUID"
              class="form-input"
            />
          </div>
          <div v-if="transferError" class="error-msg">{{ transferError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="showTransfer = false">
            Cancel
          </button>
          <button
            class="btn-primary"
            :disabled="transferSaving || !transferHostId || !transferToAgencyId"
            @click="handleTransfer"
          >
            {{ transferSaving ? "Transferring..." : "Transfer" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div
      v-if="deleteConfirm"
      class="modal-overlay"
      @click.self="deleteConfirm = false"
    >
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Delete Agency</h3>
          <button class="modal-close" @click="deleteConfirm = false">✕</button>
        </div>
        <div class="modal-body">
          <p>
            Permanently delete <strong>{{ drawerAgency?.name }}</strong
            >? This cannot be undone.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="deleteConfirm = false">
            Cancel
          </button>
          <button
            class="btn-danger"
            :disabled="deleteLoading"
            @click="confirmDelete"
          >
            {{ deleteLoading ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 13px;
}
.filter-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 13px;
}
.stat-pill {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Table */
.table-card {
  background: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--card-border);
  overflow: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--card-border);
}
.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--card-border);
  color: var(--text-primary);
  vertical-align: middle;
}
.data-table tr:last-child td {
  border-bottom: none;
}
.cell-name {
  font-weight: 600;
}
.cell-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.split-host {
  font-size: 11px;
  background: #22c97a22;
  color: #22c97a;
  padding: 2px 6px;
  border-radius: 4px;
}
.loading {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

/* Badges */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
}
.badge-active {
  background: #22c97a22;
  color: #22c97a;
}
.badge-suspended {
  background: #e8a02022;
  color: #e8a020;
}
.badge-banned {
  background: #ff4d4d22;
  color: #ff4d4d;
}
.badge-admin {
  background: #7b4fff22;
  color: #9d7fff;
}

/* Buttons */
.btn-primary {
  padding: 8px 16px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-ghost {
  padding: 8px 16px;
  background: none;
  color: var(--text-primary);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.btn-sm {
  padding: 5px 10px;
  background: #f8fafc;
  color: var(--text-primary);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.btn-warn {
  background: #e8a02022;
  color: #e8a020;
  border-color: #e8a02040;
}
.btn-danger {
  background: #ff4d4d22;
  color: #ff4d4d;
  border-color: #ff4d4d40;
}

/* Agency Detail Modal */
.agency-modal {
  background: #ffffff;
  border: 1px solid var(--card-border);
  border-top: 3px solid var(--primary);
  border-radius: 14px;
  width: 720px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
}
.agency-tabs {
  display: flex;
  border-bottom: 1px solid var(--card-border);
}
.agency-tabs button {
  flex: 1;
  padding: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.agency-tabs button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
.agency-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
}

/* Detail sections */
.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.action-row {
  display: flex;
  gap: 6px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-item label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.info-item span {
  font-size: 13px;
  color: var(--text-primary);
}
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: 4px;
}
.empty-text {
  font-size: 13px;
  color: var(--text-muted);
  padding: 8px 0;
}

/* Policy card */
.policy-card {
  background: #f8fafc;
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--card-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.policy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.policy-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 700;
  text-transform: uppercase;
}
.policy-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}
.policy-sub {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  margin-left: 8px;
}
.policy-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}
.policy-row-soft .policy-label {
  font-weight: 600;
}
.policy-value-sm {
  font-size: 14px !important;
  font-weight: 600 !important;
}

.override-card {
  gap: 14px;
}
.override-intro {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.override-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.override-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.override-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
}
.override-meta {
  font-size: 11px;
  color: var(--text-muted);
}
.override-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.override-input {
  flex: 1;
  min-width: 120px;
  max-width: 200px;
}
.override-row-datetime {
  flex-direction: column;
  align-items: stretch;
}
.override-dt-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.override-datetime {
  max-width: 280px;
}
.override-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}
.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  margin: 8px 0;
}
.toggle-input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}
.toggle-text {
  font-size: 13px;
  color: var(--text-primary);
}
.dim {
  opacity: 0.55;
}

.ledger-card {
  background: #f8fafc;
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--card-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ledger-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ledger-scroll {
  overflow-x: auto;
  max-height: 280px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: #fff;
}
.ledger-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ledger-table th {
  text-align: left;
  padding: 8px 10px;
  background: #f1f5f9;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  position: sticky;
  top: 0;
}
.ledger-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--card-border);
  color: var(--text-primary);
  vertical-align: top;
}
.ledger-table tr:last-child td {
  border-bottom: none;
}
.ledger-tx {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  word-break: break-all;
  max-width: 180px;
}

/* Owner */
.owner-card {
  background: #f8fafc;
  border-radius: 10px;
  padding: 14px;
}
.owner-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.owner-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.owner-hosts {
  font-size: 13px;
  color: var(--text-muted);
}

/* Hosts list */
.host-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.host-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
}
.host-name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}
.host-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.host-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 6px;
}
.rank {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  width: 28px;
}

/* Admin list */
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.admin-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
}
.admin-name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}
.admin-email {
  font-size: 12px;
  color: var(--text-muted);
}

/* Analytics */
.analytics-toolbar {
  display: flex;
  justify-content: flex-end;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.stat-card {
  background: #f8fafc;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}
.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.modal {
  background: #ffffff;
  border: 1px solid var(--card-border);
  border-top: 3px solid var(--primary);
  border-radius: 14px;
  width: 580px;
  max-width: 95vw;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
}
.modal-sm {
  width: 360px;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--card-border);
}
.modal-header h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.modal-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--card-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Forms */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}
.form-input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--content-bg);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.error-msg {
  color: #ff4d4d;
  font-size: 13px;
}

/* Colors */
.text-green {
  color: #22c97a;
}
.text-red {
  color: #ff4d4d;
}
.owner-combobox {
  position: relative;
}
.owner-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 240px;
  overflow-y: auto;
  z-index: 10;
}
.owner-empty {
  padding: 10px 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.owner-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 1px solid var(--card-border);
}
.owner-item:last-child {
  border-bottom: none;
}
.owner-item:hover {
  background: #f5f5fa;
}
.owner-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
}
.owner-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
