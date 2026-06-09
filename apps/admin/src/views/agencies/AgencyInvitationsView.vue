<!-- apps/admin/src/views/agencies/AgencyInvitationsView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as api from '@/api/agencyInvitations'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'

const rows        = ref<api.InvitationDTO[]>([])
const loading     = ref(true)
const statusFilter = ref('pending')
const nextCursor  = ref<string | null>(null)
const loadingMore = ref(false)

const filtered = computed(() =>
  statusFilter.value === 'all'
    ? rows.value
    : rows.value.filter(r => r.status === statusFilter.value)
)

async function fetchAll() {
  loading.value = true
  rows.value    = []
  nextCursor.value = null
  try {
    const res = await api.listInvitations(statusFilter.value)
    rows.value   = res.data
    nextCursor.value = res.nextCursor
  } catch {}
  loading.value = false
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await api.listInvitations(statusFilter.value, nextCursor.value)
    rows.value.push(...res.data)
    nextCursor.value = res.nextCursor
  } catch {}
  loadingMore.value = false
}

function changeFilter(s: string) {
  statusFilter.value = s
  fetchAll()
}

onMounted(fetchAll)

// ── Approve modal ─────────────────────────────────────────────────────────────
const approveTarget = ref<api.InvitationDTO | null>(null)
const approveSaving = ref(false)
const approveError  = ref('')

function openApprove(row: api.InvitationDTO) {
  approveTarget.value = row
  approveError.value  = ''
}
function closeApprove() { approveTarget.value = null }

async function submitApprove() {
  approveError.value  = ''
  approveSaving.value = true
  try {
    await api.approveInvitation(approveTarget.value!.id)
    closeApprove()
    await fetchAll()
  } catch (e: any) {
    approveError.value = e?.response?.data?.message ?? 'Approval failed.'
  }
  approveSaving.value = false
}

// ── Reject modal ──────────────────────────────────────────────────────────────
const rejectTarget = ref<api.InvitationDTO | null>(null)
const rejectNote   = ref('')
const rejectSaving = ref(false)
const rejectError  = ref('')

function openReject(row: api.InvitationDTO) {
  rejectTarget.value = row
  rejectNote.value   = ''
  rejectError.value  = ''
}
function closeReject() { rejectTarget.value = null }

async function submitReject() {
  if (!rejectNote.value.trim()) {
    rejectError.value = 'A rejection note is required.'
    return
  }
  rejectError.value  = ''
  rejectSaving.value = true
  try {
    await api.rejectInvitation(rejectTarget.value!.id, rejectNote.value)
    closeReject()
    await fetchAll()
  } catch (e: any) {
    rejectError.value = e?.response?.data?.message ?? 'Rejection failed.'
  }
  rejectSaving.value = false
}

function statusClass(s: string) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected') return 'badge-danger'
  if (s === 'cancelled') return 'badge-muted'
  return 'badge-warn'
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Agency Invitations</h1>
    </div>

    <!-- Filters -->
    <div class="filters">
      <button
        v-for="s in ['pending', 'approved', 'rejected', 'cancelled', 'all']"
        :key="s"
        class="filter-btn"
        :class="{ active: statusFilter === s }"
        @click="changeFilter(s)"
      >{{ s.charAt(0).toUpperCase() + s.slice(1) }}</button>
    </div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="filtered.length === 0" class="empty">No invitations found.</div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>From Agency</th>
            <th>To Agency</th>
            <th>Status</th>
            <th>Note</th>
            <th>Sent</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id">
            <td>
              <div class="user-cell">
                <span class="user-name">{{ row.fromAgency.name }}</span>
                <span class="user-sub">{{ row.fromAgency.owner.displayName }}</span>
              </div>
            </td>
            <td>
              <div class="user-cell">
                <span class="user-name">{{ row.toAgency.name }}</span>
                <span class="user-sub">{{ row.toAgency.owner.displayName }}</span>
              </div>
            </td>
            <td><span class="badge" :class="statusClass(row.status)">{{ row.status }}</span></td>
            <td class="note-cell">{{ row.note || '—' }}</td>
            <td>{{ fmt(row.createdAt) }}</td>
            <td class="actions-td">
              <RowActionMenu v-if="row.status === 'pending'">
                <RowActionMenuItem variant="success" @click="openApprove(row)">Approve</RowActionMenuItem>
                <RowActionMenuItem variant="danger" @click="openReject(row)">Reject</RowActionMenuItem>
              </RowActionMenu>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Load more -->
    <div v-if="nextCursor && !loading" class="load-more-wrap">
      <button class="btn btn-ghost" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <!-- Approve modal -->
    <div v-if="approveTarget" class="modal-overlay" @click.self="closeApprove">
      <div class="modal">
        <h3>Approve Invitation</h3>
        <p class="modal-sub">
          Approve the invitation from
          <strong>{{ approveTarget.fromAgency.name }}</strong>
          to
          <strong>{{ approveTarget.toAgency.name }}</strong>?
          This will set <strong>{{ approveTarget.toAgency.name }}</strong>
          as a sub-agency of <strong>{{ approveTarget.fromAgency.name }}</strong>.
        </p>
        <p v-if="approveError" class="error-text">{{ approveError }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeApprove">Cancel</button>
          <button class="btn btn-success" :disabled="approveSaving" @click="submitApprove">
            {{ approveSaving ? 'Approving…' : 'Confirm Approve' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectTarget" class="modal-overlay" @click.self="closeReject">
      <div class="modal">
        <h3>Reject Invitation</h3>
        <p class="modal-sub">
          Reject the invitation from
          <strong>{{ rejectTarget.fromAgency.name }}</strong>
          to
          <strong>{{ rejectTarget.toAgency.name }}</strong>.
        </p>
        <label class="field-label">Reason / Note <span style="color:#ef4444">*</span></label>
        <textarea v-model="rejectNote" class="textarea" rows="3" placeholder="Reason for rejection…" />
        <p v-if="rejectError" class="error-text">{{ rejectError }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closeReject">Cancel</button>
          <button class="btn btn-danger" :disabled="rejectSaving" @click="submitReject">
            {{ rejectSaving ? 'Rejecting…' : 'Confirm Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 0; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; }

.filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-btn {
  padding: 6px 14px; border-radius: 20px; border: 1px solid #ddd;
  background: #fff; cursor: pointer; font-size: 13px; font-weight: 500; color: #555;
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--primary); color: var(--primary); }
.filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.loading, .empty { color: #888; font-size: 14px; padding: 32px 0; text-align: center; }

.table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #eee; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { background: #f8f9fa; padding: 10px 14px; text-align: left; font-weight: 600; color: #555; border-bottom: 1px solid #eee; white-space: nowrap; }
.table td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: #fafafa; }

.user-cell { display: flex; flex-direction: column; gap: 2px; }
.user-name  { font-weight: 600; color: #111; }
.user-sub   { font-size: 11px; color: #999; }

.note-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #666; }

.badge { display: inline-block; padding: 2px 9px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.badge-warn    { background: #fff3cd; color: #856404; }
.badge-success { background: #d1fae5; color: #065f46; }
.badge-danger  { background: #fee2e2; color: #991b1b; }
.badge-muted   { background: #f3f4f6; color: #6b7280; }
.muted { color: #bbb; }

.btn { padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-success { background: #10b981; color: #fff; }
.btn-danger  { background: #ef4444; color: #fff; }
.btn-ghost   { background: #f0f0f0; color: #444; }

.load-more-wrap { display: flex; justify-content: center; padding: 20px 0; }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.modal {
  background: #fff; border-radius: 12px; padding: 28px 32px;
  width: 440px; max-width: 95vw; display: flex; flex-direction: column; gap: 14px;
}
.modal h3 { margin: 0; font-size: 18px; font-weight: 700; }
.modal-sub { margin: 0; font-size: 13px; color: #555; line-height: 1.5; }
.field-label { font-size: 12px; font-weight: 600; color: #777; }
.textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; resize: vertical; box-sizing: border-box; }
.error-text { color: #ef4444; font-size: 12px; margin: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
</style>
