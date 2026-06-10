<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as giftsApi from '@/api/gifts'
import Pagination from '@/components/common/Pagination.vue'
import { formatGiftCategory } from '@/lib/giftCategories'

function isRemoteUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//.test(value)
}

const transactions = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const search = ref('')
const loading = ref(true)
const selected = ref<any>(null)

async function fetchTransactions() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.value.page, limit: pagination.value.limit }
    if (search.value) params.search = search.value
    const result = await giftsApi.listGiftTransactions(params)
    transactions.value = result.transactions
    pagination.value = result.pagination
  } catch {}
  loading.value = false
}

function handleSearch() { pagination.value.page = 1; fetchTransactions() }
onMounted(fetchTransactions)
watch(() => pagination.value.page, fetchTransactions)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <input v-model="search" @keyup.enter="handleSearch" class="search-input"
        placeholder="Search by sender, recipient, or gift name..." />
      <button class="btn btn-primary" @click="handleSearch">Search</button>
      <span class="stat-pill">Total: {{ pagination.total }}</span>
    </div>

    <div class="table-card">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="transactions.length === 0" class="loading">No transactions found.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Gift</th>
            <th>Sender</th>
            <th>Recipient</th>
            <th>Cost</th>
            <th>Bean Value</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id" class="clickable-row" @click="selected = tx">
            <td>
              <div class="gift-cell">
                <img v-if="isRemoteUrl(tx.gift?.image)" :src="tx.gift.image" class="gift-thumb" alt="" />
                <span v-else class="gift-thumb-placeholder">{{ (tx.gift?.name || '?').charAt(0).toUpperCase() }}</span>
                <span class="fw">{{ tx.gift?.name }}</span>
              </div>
            </td>
            <td>
              <div class="fw">{{ tx.sender?.displayName || '—' }}</div>
              <div class="dim mono">{{ tx.sender?.hakaId }}</div>
            </td>
            <td>
              <div class="fw">{{ tx.recipient?.displayName || '—' }}</div>
              <div class="dim mono">{{ tx.recipient?.hakaId }}</div>
            </td>
            <td class="coins">🪙 {{ tx.coinCost?.toLocaleString() }}</td>
            <td class="beans">🫘 {{ tx.beanValue?.toLocaleString() }}</td>
            <td class="dim">{{ new Date(tx.createdAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination :page="pagination.page" :total-pages="pagination.totalPages" :total="pagination.total"
        @update:page="(p) => pagination.page = p" />
    </div>
  </div>

  <!-- Detail modal -->
  <Teleport to="body">
    <div v-if="selected" class="modal-overlay" @click.self="selected = null">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Gift Transaction</h3>
          <button class="btn-close" @click="selected = null">✕</button>
        </div>
        <div class="detail-body">
          <div class="gift-hero">
            <img v-if="isRemoteUrl(selected.gift?.image)" :src="selected.gift.image" class="hero-thumb" alt="" />
            <span v-else class="hero-thumb-placeholder">{{ (selected.gift?.name || '?').charAt(0).toUpperCase() }}</span>
            <div>
              <div class="hero-name">{{ selected.gift?.name }}</div>
              <div class="hero-cat dim">{{ formatGiftCategory(selected.gift?.category) }}</div>
            </div>
          </div>
          <div class="detail-grid">
            <div class="dfield"><span class="dl">Sender</span><span class="dv fw">{{ selected.sender?.displayName }}</span></div>
            <div class="dfield"><span class="dl">Sender Haka ID</span><span class="dv mono">{{ selected.sender?.hakaId || '—' }}</span></div>
            <div class="dfield"><span class="dl">Recipient</span><span class="dv fw">{{ selected.recipient?.displayName }}</span></div>
            <div class="dfield"><span class="dl">Recipient Haka ID</span><span class="dv mono">{{ selected.recipient?.hakaId || '—' }}</span></div>
            <div class="dfield"><span class="dl">Coin Cost</span><span class="dv coins fw">🪙 {{ selected.coinCost?.toLocaleString() }}</span></div>
            <div class="dfield"><span class="dl">Bean Value</span><span class="dv beans fw">🫘 {{ selected.beanValue?.toLocaleString() }}</span></div>
            <div class="dfield"><span class="dl">Transaction ID</span><span class="dv mono dim">{{ selected.id }}</span></div>
            <div class="dfield"><span class="dl">Date</span><span class="dv">{{ new Date(selected.createdAt).toLocaleString() }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; height: 40px; padding: 0 14px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; background: var(--card-bg); outline: none; }
.search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: #fff; }
.stat-pill { background: #f0f0f0; border-radius: 12px; padding: 4px 12px; font-size: 13px; color: #555; white-space: nowrap; }
.table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; padding: 0 0 12px; }
.loading { padding: 40px; text-align: center; color: var(--text-muted); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); background: #F8FAFC; }
.data-table td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #F1F5F9; vertical-align: middle; }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: var(--row-hover); }
.gift-cell { display: flex; align-items: center; gap: 8px; }
.gift-thumb { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
.gift-thumb-placeholder {
  width: 28px; height: 28px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  background: var(--content-bg); border: 1px solid var(--card-border);
  color: var(--text-muted);
}
.fw { font-weight: 500; }
.dim { color: var(--text-muted); font-size: 12px; }
.mono { font-family: monospace; font-size: 12px; }
.coins { color: var(--warning); font-weight: 600; }
.beans { color: var(--success); font-weight: 600; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal-box { background: var(--card-bg); border-radius: 16px; width: min(520px, 100%); box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--card-border); }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 600; }
.btn-close { background: var(--content-bg); border: 1px solid var(--card-border); border-radius: 6px; width: 28px; height: 28px; font-size: 13px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
.btn-close:hover { color: var(--danger); border-color: var(--danger); }
.detail-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.gift-hero { display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--content-bg); border-radius: 10px; }
.hero-thumb { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; }
.hero-thumb-placeholder {
  width: 48px; height: 48px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700;
  background: var(--card-bg); border: 1px solid var(--card-border);
  color: var(--text-muted);
}
.hero-name { font-size: 17px; font-weight: 700; color: var(--text-primary); }
.hero-cat { margin-top: 2px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dfield { display: flex; flex-direction: column; gap: 3px; }
.dl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.dv { font-size: 13px; color: var(--text-primary); }
</style>
