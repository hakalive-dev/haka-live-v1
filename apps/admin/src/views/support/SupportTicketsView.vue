<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as supportApi from '@/api/support'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'
import { useAdminRealtime } from '@/composables/useAdminRealtime'
import SupportScreenshotGallery from '@/components/support/SupportScreenshotGallery.vue'

const toast = useToastStore()

const tickets = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const statusFilter = ref('')
const loading = ref(true)
const actionLoading = ref<string | null>(null)

// Reply modal
const replyModal = ref<any>(null)
const replyText = ref('')
const replyLoading = ref(false)

// Close confirm
const closeConfirm = ref<any>(null)

async function fetchTickets() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    }
    if (statusFilter.value) params.status = statusFilter.value
    const result = await supportApi.listTickets(params)
    tickets.value = result.items
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function openReply(ticket: any) {
  replyModal.value = ticket
  replyText.value = ticket.adminReply || ''
}

async function submitReply() {
  if (!replyModal.value || !replyText.value.trim()) return
  replyLoading.value = true
  try {
    await supportApi.replyTicket(replyModal.value.id, replyText.value.trim())
    toast.success('Reply Sent', 'The user will see your reply in the app.')
    replyModal.value = null
    replyText.value = ''
    await fetchTickets()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  replyLoading.value = false
}

async function executeClose() {
  if (!closeConfirm.value) return
  const id = closeConfirm.value.id
  closeConfirm.value = null
  actionLoading.value = id
  try {
    await supportApi.closeTicket(id)
    toast.success('Ticket Closed')
    await fetchTickets()
  } catch (e: any) {
    toast.error('Failed', e?.message)
  }
  actionLoading.value = null
}

function statusClass(status: string) {
  if (status === 'replied') return 'badge badge-success'
  if (status === 'closed') return 'badge badge-secondary'
  return 'badge badge-warning'
}

onMounted(fetchTickets)
watch(() => pagination.value.page, fetchTickets)
useAdminRealtime('support_tickets', fetchTickets)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2>Support Tickets</h2>
    </div>

    <div class="toolbar">
      <select v-model="statusFilter" @change="pagination.page = 1; fetchTickets()" class="filter-select">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="replied">Replied</option>
        <option value="closed">Closed</option>
      </select>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading tickets...</div>
      <div v-else-if="tickets.length === 0" class="empty">No support tickets found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Description</th>
            <th>Screenshot</th>
            <th>Status</th>
            <th>Admin Reply</th>
            <th>Date</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tickets" :key="t.id">
            <td>
              <div class="user-row">
                <img v-if="t.user?.avatar" :src="t.user.avatar" class="avatar" />
                <div class="avatar-fallback" v-else>{{ (t.user?.displayName ?? '?')[0] }}</div>
                <div>
                  <div class="user-name">{{ t.user?.displayName ?? '—' }}</div>
                  <div class="user-sub mono">{{ t.user?.hakaId ?? '' }}</div>
                </div>
              </div>
            </td>
            <td class="note-cell">{{ t.description }}</td>
            <td>
              <SupportScreenshotGallery
                v-if="t.hasScreenshot"
                :ticket-id="t.id"
                :screenshot-urls="t.screenshotUrls"
              />
              <span v-else class="no-data">—</span>
            </td>
            <td><span :class="statusClass(t.status)">{{ t.status }}</span></td>
            <td class="note-cell">{{ t.adminReply || '—' }}</td>
            <td class="mono small">{{ new Date(t.createdAt).toLocaleString() }}</td>
            <td class="actions-td" @click.stop>
              <RowActionMenu>
                <RowActionMenuItem
                  :disabled="actionLoading === t.id"
                  @click="openReply(t)"
                >
                  {{ t.adminReply ? 'Edit Reply' : 'Reply' }}
                </RowActionMenuItem>
                <RowActionMenuItem
                  v-if="t.status !== 'closed'"
                  :disabled="actionLoading === t.id"
                  @click="closeConfirm = t"
                >
                  Close
                </RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      :page="pagination.page"
      :total-pages="pagination.totalPages"
      :total="pagination.total"
      @update:page="(p: number) => (pagination.page = p)"
    />

    <!-- Reply Modal -->
    <div v-if="replyModal" class="modal-overlay" @click.self="replyModal = null">
      <div class="modal">
        <h3>Reply to Ticket</h3>
        <div class="ticket-preview">
          <div class="preview-label">User:</div>
          <div class="preview-value">{{ replyModal.user?.displayName ?? '—' }} ({{ replyModal.user?.hakaId ?? '' }})</div>
          <div class="preview-label">Issue:</div>
          <div class="preview-value">{{ replyModal.description }}</div>
          <div v-if="replyModal.hasScreenshot" class="preview-label">
            Screenshots{{ replyModal.screenshotCount > 1 ? ` (${replyModal.screenshotCount})` : '' }}
          </div>
          <SupportScreenshotGallery
            v-if="replyModal.hasScreenshot"
            :ticket-id="replyModal.id"
            :screenshot-urls="replyModal.screenshotUrls"
            large
          />
        </div>
        <div class="form-group">
          <label>Your Reply</label>
          <textarea v-model="replyText" class="form-textarea" rows="4" placeholder="Type your reply..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="replyModal = null">Cancel</button>
          <button class="btn btn-primary" :disabled="replyLoading || !replyText.trim()" @click="submitReply">
            {{ replyLoading ? 'Sending...' : 'Send Reply' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Close Confirm Modal -->
    <div v-if="closeConfirm" class="modal-overlay" @click.self="closeConfirm = null">
      <div class="modal">
        <h3>Close Ticket</h3>
        <p>
          Close this ticket from <strong>{{ closeConfirm.user?.displayName }}</strong>?
          The user will no longer receive replies.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeConfirm = null">Cancel</button>
          <button class="btn btn-danger" @click="executeClose">Yes, Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; }
.filter-select {
  height: 38px; padding: 0 10px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; background: #fff;
}
.btn { height: 38px; padding: 0 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary { background: #7B4FFF; color: #fff; }
.btn-danger { background: #FF4D4D; color: #fff; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.table-card { background: #fff; border-radius: 8px; border: 1px solid #eee; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #888; border-bottom: 1px solid #eee; }
.data-table td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.user-row { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.avatar-fallback {
  width: 36px; height: 36px; border-radius: 50%; background: #7B4FFF;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
}
.user-name { font-weight: 600; }
.user-sub { font-size: 11px; color: #999; margin-top: 2px; }
.mono { font-family: monospace; font-size: 13px; }
.small { font-size: 12px; color: #666; }
.note-cell { max-width: 220px; color: #666; font-size: 13px; }
.no-data { color: #ccc; }
.screenshot-link { display: inline-block; }
.screenshot-thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #eee; }
.screenshot-preview-link { display: block; margin-top: 8px; }
.screenshot-preview {
  max-width: 100%; max-height: 240px; border-radius: 8px;
  object-fit: contain; border: 1px solid #eee; background: #f5f5f5;
}
.action-btns { display: flex; gap: 8px; }
.badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.badge-warning { background: #fff3cd; color: #856404; }
.badge-success { background: #d1fae5; color: #065f46; }
.badge-secondary { background: #f0f0f0; color: #666; }
.loading, .empty { padding: 40px; text-align: center; color: #999; font-size: 14px; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; padding: 24px; width: 520px;
  max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal h3 { margin: 0 0 16px; font-size: 18px; }
.ticket-preview { background: #f8f8f8; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.preview-label { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; margin-top: 8px; }
.preview-label:first-child { margin-top: 0; }
.preview-value { font-size: 14px; color: #333; margin-top: 2px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.form-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd;
  border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;
  resize: vertical; font-family: inherit;
}
.form-textarea:focus { border-color: #7B4FFF; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
</style>
