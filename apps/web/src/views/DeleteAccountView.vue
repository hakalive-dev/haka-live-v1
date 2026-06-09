<script setup lang="ts">
import logoUrl from '@/assets/icon.png'
import { computed, ref } from 'vue'

// Public account-deletion page (Google Play requirement).
// Flow: email → email OTP (Supabase, via our API) → confirm → DELETE /auth/me.
const SUPPORT_EMAIL = 'support@hakalive.com'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.hakalive.com/api/v1'

type Step = 'email' | 'otp' | 'confirm' | 'done'
const step = ref<Step>('email')
const email = ref('')
const otpCode = ref('')
const confirmed = ref(false)
const accessToken = ref('')
const loading = ref(false)
const errorMsg = ref('')

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
// Supabase OTP length is configurable (6–10 digits) — accept the full range.
const otpValid = computed(() => /^[0-9]{6,10}$/.test(otpCode.value.trim()))

async function api(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `Request failed (${res.status})`)
  }
  return body.data
}

async function sendOtp() {
  if (!emailValid.value) {
    errorMsg.value = 'Enter the email address linked to your Haka Live account'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await api('/auth/email-otp/send', {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim() }),
    })
    step.value = 'otp'
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to send the verification code'
  } finally {
    loading.value = false
  }
}

async function verifyOtp() {
  if (!otpValid.value) {
    errorMsg.value = 'Enter the verification code sent to your email'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await api('/auth/email-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim(), code: otpCode.value.trim(), platform: 'web' }),
    })
    if (!data?.tokens?.accessToken) throw new Error('Verification failed — please try again')
    accessToken.value = data.tokens.accessToken
    step.value = 'confirm'
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Invalid verification code'
  } finally {
    loading.value = false
  }
}

async function deleteAccount() {
  if (!confirmed.value) {
    errorMsg.value = 'Please confirm you understand this action is permanent'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await api('/auth/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken.value}` },
    })
    accessToken.value = ''
    step.value = 'done'
  } catch (e: unknown) {
    // 409 → account has open obligations; message lists them + support contact.
    errorMsg.value = e instanceof Error ? e.message : 'Account deletion failed'
  } finally {
    loading.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  otpCode.value = ''
  errorMsg.value = ''
}
</script>

<template>
  <div class="legal-page">
    <!-- Brand header -->
    <header class="legal-hero">
      <div class="legal-hero-inner">
        <img :src="logoUrl" alt="Haka Live" class="legal-logo" />
        <div>
          <h1 class="legal-hero-title">Delete Your Account</h1>
          <p class="legal-hero-subtitle">Haka Live</p>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="legal-content">
      <article class="legal-card">
        <!-- What deletion means — always visible -->
        <section v-if="step !== 'done'" class="da-explainer">
          <h2>What happens when you delete your account</h2>
          <ul>
            <li>Your profile (name, photo, bio, email, phone number, Haka ID) is permanently removed</li>
            <li>You are signed out on all devices and can no longer log in</li>
            <li>Your coin balance and unredeemed items are forfeited</li>
            <li>
              Records of purchases, gifts, and payouts are retained in anonymized form where
              required by law (fraud prevention, tax, and accounting obligations)
            </li>
            <li>This action cannot be undone</li>
          </ul>
          <p>
            You can also delete your account in the app:
            <span class="legal-path">Settings &rarr; Account and security &rarr; Cancel Account</span>
          </p>
        </section>

        <!-- Step 1: email -->
        <section v-if="step === 'email'">
          <h2>Verify it&rsquo;s you</h2>
          <p>
            Enter the email address linked to your Haka Live account. We&rsquo;ll send a
            verification code to your inbox.
          </p>
          <form class="da-form" @submit.prevent="sendOtp">
            <input
              v-model="email"
              type="email"
              class="da-input"
              placeholder="you@example.com"
              autocomplete="email"
            />
            <button type="submit" class="da-btn da-btn-primary" :disabled="loading || !emailValid">
              {{ loading ? 'Sending…' : 'Send verification code' }}
            </button>
          </form>
          <p v-if="errorMsg" class="da-error">{{ errorMsg }}</p>
          <p class="da-note">
            No email linked to your account? Email
            <a :href="`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`">{{ SUPPORT_EMAIL }}</a>
            from your registered address and we&rsquo;ll process the deletion for you.
          </p>
        </section>

        <!-- Step 2: OTP -->
        <section v-else-if="step === 'otp'">
          <h2>Enter the verification code</h2>
          <p>
            We sent a verification code to <strong>{{ email }}</strong>.
          </p>
          <form class="da-form" @submit.prevent="verifyOtp">
            <input
              v-model="otpCode"
              type="text"
              inputmode="numeric"
              maxlength="10"
              class="da-input da-input-otp"
              placeholder="123456"
              autocomplete="one-time-code"
            />
            <button type="submit" class="da-btn da-btn-primary" :disabled="loading || !otpValid">
              {{ loading ? 'Verifying…' : 'Verify code' }}
            </button>
          </form>
          <p v-if="errorMsg" class="da-error">{{ errorMsg }}</p>
          <p class="da-note">
            <a href="#" @click.prevent="backToEmail">Use a different email</a> &middot;
            <a href="#" @click.prevent="sendOtp">Resend code</a>
          </p>
        </section>

        <!-- Step 3: confirm -->
        <section v-else-if="step === 'confirm'">
          <h2>Final confirmation</h2>
          <p>
            You are about to permanently delete the Haka Live account linked to
            <strong>{{ email }}</strong>.
          </p>
          <form class="da-form" @submit.prevent="deleteAccount">
            <label class="da-check">
              <input v-model="confirmed" type="checkbox" />
              <span>
                I understand my account and profile will be permanently deleted, my balances are
                forfeited, and this cannot be undone.
              </span>
            </label>
            <button type="submit" class="da-btn da-btn-danger" :disabled="loading || !confirmed">
              {{ loading ? 'Deleting…' : 'Permanently delete my account' }}
            </button>
          </form>
          <p v-if="errorMsg" class="da-error">{{ errorMsg }}</p>
        </section>

        <!-- Step 4: done -->
        <section v-else>
          <h2>Your account has been deleted</h2>
          <p>
            Your profile and personal information have been removed, and you have been signed out on
            all devices. Anonymized transaction records are retained only where the law requires it.
          </p>
          <p>
            If you change your mind, you&rsquo;re always welcome back — just sign up again any time.
          </p>
        </section>
      </article>

      <footer class="legal-footer">
        &copy; {{ new Date().getFullYear() }} Haka Live. All rights reserved.
      </footer>
    </main>
  </div>
</template>

<style scoped>
.legal-page {
  min-height: 100vh;
  background: var(--content-bg, #f1f5f9);
  color: var(--text-primary, #0f172a);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
.legal-hero {
  background: linear-gradient(135deg, #1a1f33 0%, var(--sidebar-bg, #0f172a) 100%);
  border-bottom: 4px solid var(--primary, #ff5500);
}

.legal-hero-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 36px 24px;
  display: flex;
  align-items: center;
  gap: 18px;
}

.legal-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(255, 85, 0, 0.35);
  flex-shrink: 0;
}

.legal-hero-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.2;
}

.legal-hero-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary-light, #ff7733);
}

/* ── Content ──────────────────────────────────────────────────────────────── */
.legal-content {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px 56px;
}

.legal-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.legal-card section + section {
  margin-top: 32px;
  padding-top: 28px;
  border-top: 1px solid var(--card-border, #e2e8f0);
}

.legal-card h2 {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  margin: 0 0 12px;
  padding-left: 14px;
  border-left: 4px solid var(--primary, #ff5500);
  line-height: 1.3;
}

.legal-card p {
  font-size: 15px;
  line-height: 1.7;
  color: #334155;
  margin: 0 0 12px;
}

.legal-card ul {
  margin: 0 0 14px;
  padding-left: 0;
  list-style: none;
}

.legal-card li {
  position: relative;
  padding-left: 22px;
  margin-bottom: 8px;
  font-size: 15px;
  line-height: 1.6;
  color: #334155;
}

.legal-card li::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary, #ff5500);
}

.legal-path {
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  background: var(--content-bg, #f1f5f9);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 8px;
  padding: 6px 10px;
  display: inline-block;
}

.legal-footer {
  text-align: center;
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-muted, #64748b);
}

/* ── Deletion form ────────────────────────────────────────────────────────── */
.da-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
  max-width: 420px;
}

.da-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 10px;
  font-size: 15px;
  color: var(--text-primary, #0f172a);
  background: var(--card-bg, #ffffff);
  box-sizing: border-box;
}

.da-input:focus {
  outline: none;
  border-color: var(--primary, #ff5500);
}

.da-input-otp {
  letter-spacing: 0.4em;
  font-size: 18px;
  text-align: center;
}

.da-btn {
  padding: 13px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}

.da-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.da-btn-primary {
  background: var(--primary, #ff5500);
  color: #ffffff;
}

.da-btn-danger {
  background: #dc2626;
  color: #ffffff;
}

.da-error {
  color: #dc2626;
  font-size: 14px;
  margin-top: 10px;
}

.da-note {
  margin-top: 16px;
  font-size: 14px;
  color: var(--text-muted, #64748b);
}

.da-note a {
  color: var(--primary-dark, #e04600);
  font-weight: 600;
  text-decoration: none;
}

.da-note a:hover {
  text-decoration: underline;
}

.da-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: #334155;
}

.da-check input {
  margin-top: 3px;
  accent-color: var(--primary, #ff5500);
}

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .legal-hero-inner {
    padding: 28px 18px;
    gap: 14px;
  }
  .legal-logo {
    width: 52px;
    height: 52px;
  }
  .legal-hero-title {
    font-size: 23px;
  }
  .legal-content {
    padding: 20px 14px 40px;
  }
  .legal-card {
    padding: 24px 20px;
  }
}
</style>
