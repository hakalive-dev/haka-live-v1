<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import iconUrl from '@/assets/icon.png'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push('/dashboard')
  } catch (err: any) {
    error.value = err.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <div class="login-brand-panel">
        <img :src="iconUrl" alt="Haka Live" class="login-logo" />
        <h1 class="login-brand-title">HAKA-LIVE</h1>
        <p class="login-brand-tagline">Staff Control Panel</p>
      </div>

      <div class="login-card">
        <div class="login-card-header">
          <h2 class="login-card-title">Sign in</h2>
          <p class="login-card-subtitle">Use your staff account credentials</p>
        </div>

        <div v-if="error" class="login-error">{{ error }}</div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input
              v-model="email"
              type="email"
              class="form-input"
              placeholder="admin@hakalive.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input
              v-model="password"
              type="password"
              class="form-input"
              placeholder="Enter password"
              required
              autocomplete="current-password"
            />
          </div>

          <button type="submit" class="login-btn" :disabled="loading">
            {{ loading ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #1a1f33 0%, var(--sidebar-bg) 100%);
}

.login-shell {
  width: 100%;
  max-width: 920px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
  gap: 32px;
  align-items: center;
}

.login-brand-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.login-logo {
  width: 88px;
  height: 88px;
  border-radius: 22px;
  object-fit: contain;
  box-shadow: 0 12px 36px rgba(255, 85, 0, 0.35);
}

.login-brand-title {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.3px;
  color: #fff;
}

.login-brand-tagline {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary-light);
}

.login-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-top: 3px solid var(--primary);
  border-radius: 14px;
  padding: 32px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
}

.login-card-header {
  margin-bottom: 24px;
}

.login-card-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.login-card-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.login-error {
  background: var(--danger-soft);
  color: var(--danger);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 16px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input {
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--content-bg);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.login-btn {
  height: 44px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 8px;
}

.login-btn:hover:not(:disabled) {
  background: var(--primary-dark);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .login-shell {
    grid-template-columns: 1fr;
    max-width: 420px;
  }

  .login-brand-panel {
    align-items: center;
    text-align: center;
  }

  .login-card {
    padding: 28px 24px;
  }
}
</style>
