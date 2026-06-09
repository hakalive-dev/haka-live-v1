<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as faceApi from '@/api/faceVerifications'
import Pagination from '@/components/common/Pagination.vue'
import RowActionMenu from '@/components/common/RowActionMenu.vue'
import RowActionMenuItem from '@/components/common/RowActionMenuItem.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const items = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const loading = ref(true)
const detail = ref<any>(null)
const reviewLoading = ref(false)
const rejectReason = ref('')

async function fetchList() {
  loading.value = true
  try {
    const result = await faceApi.listFaceVerifications({
      page: pagination.value.page,
      limit: pagination.value.limit,
    })
    items.value = result.items ?? []
    pagination.value = result.pagination ?? pagination.value
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load queue'
    toast.error('Load failed', msg)
    items.value = []
  }
  loading.value = false
}

async function openDetail(sessionId: string) {
  try {
    detail.value = await faceApi.getFaceVerification(sessionId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Load failed'
    toast.error('Load failed', msg)
  }
}

function closeDetail() {
  detail.value = null
  rejectReason.value = ''
}

async function approve() {
  if (!detail.value) return
  reviewLoading.value = true
  try {
    await faceApi.approveFaceVerification(detail.value.id)
    toast.success('Face verification approved')
    closeDetail()
    await fetchList()
  } catch (e: any) {
    toast.error('Approve failed', e?.message)
  }
  reviewLoading.value = false
}

async function reject() {
  if (!detail.value) return
  reviewLoading.value = true
  try {
    await faceApi.rejectFaceVerification(detail.value.id, rejectReason.value)
    toast.warning('Face verification rejected')
    closeDetail()
    await fetchList()
  } catch (e: any) {
    toast.error('Reject failed', e?.message)
  }
  reviewLoading.value = false
}

function frameEntries(session: any) {
  const urls = session?.frameUrls ?? {}
  return Object.entries(urls)
}

onMounted(fetchList)
watch(() => pagination.value.page, fetchList)
</script>

<template>
  <div class="page">
    <h1 class="page-title">Face verification queue</h1>
    <p class="page-desc">Users who passed automated liveness checks and await admin approval.</p>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="items.length === 0" class="loading">No pending verifications.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Haka ID</th>
            <th>Submitted</th>
            <th>Reference</th>
            <th class="actions-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td>{{ row.user?.displayName || '—' }}</td>
            <td class="mono dim">{{ row.user?.hakaId || '—' }}</td>
            <td class="dim">{{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}</td>
            <td>
              <img
                v-if="row.referenceFrameUrl"
                :src="row.referenceFrameUrl"
                alt="reference"
                class="thumb-img"
              />
            </td>
            <td class="actions-td">
              <RowActionMenu>
                <RowActionMenuItem @click="openDetail(row.id)">Review</RowActionMenuItem>
              </RowActionMenu>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination
        :page="pagination.page"
        :total-pages="pagination.totalPages"
        :total="pagination.total"
        @update:page="(p) => (pagination.page = p)"
      />
    </div>

    <div v-if="detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal">
        <div class="modal-header">
          <h2>Review face verification</h2>
          <button class="modal-close" @click="closeDetail">✕</button>
        </div>
        <p class="fw">{{ detail.user?.displayName }} · {{ detail.user?.hakaId }}</p>
        <div class="frames-grid">
          <div v-for="[key, url] in frameEntries(detail)" :key="key" class="frame-card">
            <div class="frame-label">{{ key }}</div>
            <img :src="url as string" :alt="key" class="frame-img" />
          </div>
        </div>
        <textarea
          v-model="rejectReason"
          class="reject-input"
          placeholder="Rejection reason (optional)"
          rows="2"
        />
        <div class="modal-actions">
          <button class="btn-reject" :disabled="reviewLoading" @click="reject">Reject</button>
          <button class="btn-approve" :disabled="reviewLoading" @click="approve">Approve</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.page-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.page-desc { color: #888; margin-bottom: 20px; font-size: 14px; }
.table-card { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #eee; }
.loading { padding: 40px; text-align: center; color: #888; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th, .data-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; }
.thumb-img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
.mono { font-family: monospace; }
.dim { color: #888; }
.fw { font-weight: 600; }
.action-edit { background: #7b4fff; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal {
  background: #fff; border-radius: 16px; padding: 24px; max-width: 720px; width: 90%;
  max-height: 90vh; overflow-y: auto;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.modal-close { border: none; background: none; font-size: 20px; cursor: pointer; }
.frames-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
.frame-card { text-align: center; }
.frame-label { font-size: 11px; color: #666; margin-bottom: 4px; text-transform: capitalize; }
.frame-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; border: 1px solid #eee; }
.reject-input { width: 100%; border: 1px solid #ddd; border-radius: 8px; padding: 8px; margin-bottom: 12px; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
.btn-approve { background: #22c97a; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
.btn-reject { background: #ff4d4d; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
</style>
