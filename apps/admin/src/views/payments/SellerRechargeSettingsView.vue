<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import * as paymentsApi from '@/api/payments'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

const toast = useToastStore()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)

const epayEmail = ref('')
const usdtTrc20Address = ref('')
const usdtBep20Address = ref('')
const directUserTopupEnabled = ref(false)

const canEdit = () =>
  auth.isSuperAdmin ||
  auth.hasPermission('payment.manage') ||
  auth.hasPermission('*')

async function load() {
  loading.value = true
  try {
    const data = await paymentsApi.getSellerRechargeSettings()
    epayEmail.value = data.epay_email ?? ''
    usdtTrc20Address.value = data.usdt_trc20_address ?? ''
    usdtBep20Address.value = data.usdt_bep20_address ?? ''
    directUserTopupEnabled.value = Boolean(data.direct_user_topup_enabled)
  } catch (e: any) {
    toast.error('Could not load settings', e?.message)
  }
  loading.value = false
}

async function save() {
  if (!canEdit()) {
    toast.error('You do not have permission to change these settings')
    return
  }
  saving.value = true
  try {
    await paymentsApi.updateSellerRechargeSettings({
      epay_email: epayEmail.value.trim(),
      usdt_trc20_address: usdtTrc20Address.value.trim(),
      usdt_bep20_address: usdtBep20Address.value.trim(),
      direct_user_topup_enabled: directUserTopupEnabled.value,
    })
    toast.success('Saved', 'Sellers will see the updated payment details in the app.')
    await load()
  } catch (e: any) {
    toast.error('Save failed', e?.message)
  }
  saving.value = false
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Seller payment settings</h2>
        <p class="page-desc">
          These are <strong>your company</strong> payment details. Coin sellers send money here when they recharge their seller balance in the app.
          You do not need technical keys — just fill in the boxes and click Save.
        </p>
      </div>
      <RouterLink to="/seller-recharges" class="link-btn">
        View recharge requests →
      </RouterLink>
    </div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else class="settings-card">
      <section class="settings-section">
        <h3 class="section-title">Where sellers send payment</h3>
        <p class="section-hint">
          Shown in the app under <strong>Coin Seller → Trading → Recharge</strong>. Sellers copy the address, pay you, then upload a screenshot for approval.
        </p>

        <label class="field">
          <span class="field-label">ePay email</span>
          <span class="field-help">The email address sellers use for ePay transfers.</span>
          <input
            v-model="epayEmail"
            type="email"
            class="field-input"
            placeholder="e.g. payments@yourcompany.com"
            :disabled="!canEdit()"
          />
        </label>

        <label class="field">
          <span class="field-label">USDT wallet (TRC20)</span>
          <span class="field-help">Your TRC20 USDT address — starts with T.</span>
          <input
            v-model="usdtTrc20Address"
            type="text"
            class="field-input mono"
            placeholder="e.g. Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            :disabled="!canEdit()"
          />
        </label>

        <label class="field">
          <span class="field-label">USDT wallet (BEP20 / Binance)</span>
          <span class="field-help">Your BEP20 USDT address — usually starts with 0x.</span>
          <input
            v-model="usdtBep20Address"
            type="text"
            class="field-input mono"
            placeholder="e.g. 0x1234567890abcdef1234567890abcdef12345678"
            :disabled="!canEdit()"
          />
        </label>
      </section>

      <section class="settings-section divider">
        <h3 class="section-title">User top-up in the app</h3>
        <p class="section-hint">
          When this is off, normal users cannot pay in-app (UPI / card). They must buy coins from a coin seller instead.
          Turn on again after your payment gateway is ready.
        </p>

        <label class="toggle-row">
          <input
            v-model="directUserTopupEnabled"
            type="checkbox"
            class="toggle-input"
            :disabled="!canEdit()"
          />
          <span class="toggle-text">
            Allow users to recharge coins directly in the app
          </span>
        </label>
        <p v-if="!directUserTopupEnabled" class="status-note">
          Direct top-up is <strong>paused</strong> — only seller recharge + coin sellers list are available.
        </p>
      </section>

      <div class="save-bar">
        <button
          v-if="canEdit()"
          type="button"
          class="save-btn"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
        <p v-else class="readonly-note">
          You can view these settings but only payment managers can edit them.
          Ask a super admin to grant <strong>Manage Payments</strong> permission.
        </p>
      </div>
    </div>

    <div class="help-card">
      <h4>Quick guide</h4>
      <ol>
        <li>Enter your real ePay email and USDT addresses above, then <strong>Save settings</strong>.</li>
        <li>When a seller submits a recharge, open <RouterLink to="/seller-recharges">Seller Recharges</RouterLink>, check the screenshot, and click Approve.</li>
        <li>Leave “direct top-up” off until your Singapore payment gateway is live.</li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.page-desc {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-secondary, #666);
  max-width: 640px;
  line-height: 1.5;
}
.settings-card {
  background: #fff;
  border: 1px solid #e8e8ee;
  border-radius: 12px;
  padding: 24px;
  max-width: 640px;
}
.settings-section { margin-bottom: 8px; }
.settings-section.divider {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #eee;
}
.section-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.section-hint {
  margin: 0 0 20px;
  font-size: 13px;
  color: #666;
  line-height: 1.45;
}
.field {
  display: block;
  margin-bottom: 20px;
}
.field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.field-help {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}
.field-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}
.field-input.mono {
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.toggle-input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
}
.toggle-text {
  font-size: 14px;
  font-weight: 500;
}
.status-note {
  margin: 12px 0 0;
  padding: 10px 12px;
  background: #fff8e6;
  border-radius: 8px;
  font-size: 13px;
  color: #664d00;
}
.save-bar {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}
.save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 200px;
  height: 48px;
  padding: 0 28px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #ff5500);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 85, 0, 0.35);
}
.save-btn:hover:not(:disabled) {
  background: var(--primary-dark, #e04600);
}
.save-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #ddd;
  background: #fff;
  color: #333;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.link-btn:hover {
  background: #f5f5f8;
}
.readonly-note {
  font-size: 13px;
  color: #888;
  line-height: 1.5;
}
.help-card {
  margin-top: 24px;
  max-width: 640px;
  padding: 16px 20px;
  background: #f7f7fb;
  border-radius: 12px;
  font-size: 13px;
  color: #444;
}
.help-card h4 {
  margin: 0 0 10px;
  font-size: 14px;
}
.help-card ol {
  margin: 0;
  padding-left: 20px;
  line-height: 1.6;
}
.help-card a {
  color: var(--primary, #7b4fff);
  font-weight: 500;
}
</style>
