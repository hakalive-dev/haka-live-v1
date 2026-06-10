<script setup lang="ts">
import logoUrl from '@/assets/icon.png'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

// Public invite landing page for https://www.hakalive.com/invite?code=<hakaId>.
// When the app is installed AND the Android App Link / iOS Universal Link is
// verified, the OS opens the app directly and this page never renders. This page
// is the FALLBACK for users without the app: it shows download CTAs and the
// invite code so it can be carried through install (copy / Play install referrer).

const PACKAGE = 'com.hakalive.app'
const route = useRoute()

// Accept 9-digit Haka IDs or legacy A–Z0–9 (4–16) codes — mirror the app parser.
function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const c = String(raw).trim().replace(/\s/g, '')
  if (/^[0-9]{9}$/.test(c)) return c
  const upper = c.toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(upper) ? upper : null
}

const code = computed<string | null>(() => normalizeCode(route.query.code as string | undefined))

const playUrl = computed(() => {
  const base = `https://play.google.com/store/apps/details?id=${PACKAGE}`
  // Play Install Referrer — app reads `code=<code>` on first launch after install.
  return code.value ? `${base}&referrer=${encodeURIComponent(`code=${code.value}`)}` : base
})

const copied = ref(false)
async function copyCode() {
  if (!code.value) return
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* clipboard unavailable */
  }
}

onMounted(() => {
  // Try to hand off to the installed app via the custom scheme. If the app isn't
  // installed nothing happens and the fallback content stays visible.
  if (code.value) {
    const t = setTimeout(() => {
      window.location.href = `hakalive://invite?code=${encodeURIComponent(code.value as string)}`
    }, 400)
    // Cancel the redirect if the page is being hidden (app opened).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(t)
    })
  }
})
</script>

<template>
  <main class="invite">
    <img :src="logoUrl" alt="Haka Live" class="logo" />
    <h1>You're invited to Haka Live!</h1>

    <p v-if="code" class="sub">
      Install the app to join. Your invite is applied automatically after install.
    </p>
    <p v-else class="sub">Install the app to start.</p>

    <div v-if="code" class="code-card">
      <span class="code-label">Your invite code</span>
      <span class="code-value">{{ code }}</span>
      <button class="copy-btn" type="button" @click="copyCode">
        {{ copied ? 'Copied!' : 'Copy code' }}
      </button>
      <span class="code-hint">If it isn't applied automatically, enter this Haka ID when you sign up.</span>
    </div>

    <div class="stores">
      <a class="store-badge" :href="playUrl" rel="noopener">Get it on Google Play</a>
      <span class="store-badge disabled">App Store — coming soon</span>
    </div>
  </main>
</template>

<style scoped>
.invite {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 20px;
  gap: 16px;
}
.logo {
  width: 88px;
  height: 88px;
  border-radius: 20px;
}
h1 {
  font-size: 1.6rem;
  margin: 0;
}
.sub {
  max-width: 30rem;
  color: #555;
  margin: 0;
}
.code-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: #faf2fb;
  border: 1px solid #e7c9ec;
  border-radius: 16px;
  padding: 20px 24px;
  width: 100%;
  max-width: 22rem;
}
.code-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9a3fa0;
}
.code-value {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.copy-btn {
  border: none;
  background: #c93ad1;
  color: #fff;
  border-radius: 999px;
  padding: 8px 20px;
  font-weight: 600;
  cursor: pointer;
}
.code-hint {
  font-size: 0.78rem;
  color: #777;
}
.stores {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 8px;
}
.store-badge {
  display: inline-block;
  padding: 12px 20px;
  border-radius: 12px;
  background: #111;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
}
.store-badge.disabled {
  background: #ccc;
  color: #666;
}
</style>
