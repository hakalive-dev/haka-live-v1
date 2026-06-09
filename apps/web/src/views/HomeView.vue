<script setup lang="ts">
import logoUrl from '@/assets/icon.png'

const SUPPORT_EMAIL = 'support@hakalive.com'

const features = [
  {
    title: 'Live Audio & Video Rooms',
    body: 'Host or join live rooms as a host, speaker, or listener with crystal-clear real-time audio and video.',
  },
  {
    title: 'Real-time Chat',
    body: 'Talk with everyone in the room through fast, reliable in-room messaging and quick reactions.',
  },
  {
    title: 'Virtual Gifting',
    body: 'Send animated gifts to your favourite hosts and climb the daily, weekly, and monthly leaderboards.',
  },
  {
    title: 'Agencies & Families',
    body: 'Grow as a creator with the agent and family system built for host management and rewards.',
  },
]

const legalLinks = [
  { label: 'Privacy Policy', to: '/privacy-policy' },
  { label: 'Terms & Conditions', to: '/terms' },
  { label: 'Community Guidelines', to: '/community-guidelines' },
  { label: 'Delete Account', to: '/delete-account' },
]
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <header class="hero">
      <div class="hero-inner">
        <img :src="logoUrl" alt="Haka Live" class="hero-logo" />
        <h1 class="hero-title">Haka Live</h1>
        <p class="hero-tagline">Go live. Connect. Get the party started.</p>
        <p class="hero-sub">
          A social audio &amp; video live-streaming platform where you can join live rooms, chat in
          real time, send virtual gifts, and build your community.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#download">Get the App</a>
          <RouterLink class="btn btn-ghost" to="/community-guidelines">Community Guidelines</RouterLink>
        </div>
      </div>
    </header>

    <!-- Features -->
    <main class="content">
      <section class="features">
        <article v-for="f in features" :key="f.title" class="feature-card">
          <h2 class="feature-title">{{ f.title }}</h2>
          <p class="feature-body">{{ f.body }}</p>
        </article>
      </section>

      <!-- Download -->
      <section id="download" class="download">
        <h2 class="download-title">Get Haka Live</h2>
        <p class="download-sub">Available soon on the App Store and Google Play.</p>
        <div class="store-badges">
          <span class="store-badge">App Store — coming soon</span>
          <span class="store-badge">Google Play — coming soon</span>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <nav class="footer-links">
        <RouterLink v-for="l in legalLinks" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
        <a :href="`mailto:${SUPPORT_EMAIL}`">Contact</a>
      </nav>
      <p class="footer-copy">&copy; {{ new Date().getFullYear() }} Haka Live. All rights reserved.</p>
    </footer>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: var(--content-bg, #f1f5f9);
  color: var(--text-primary, #0f172a);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
.hero {
  background: linear-gradient(135deg, #1a1f33 0%, var(--sidebar-bg, #0f172a) 100%);
  border-bottom: 4px solid var(--primary, #ff5500);
}

.hero-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 72px 24px 64px;
  text-align: center;
}

.hero-logo {
  display: block;
  margin: 0 auto;
  width: 88px;
  height: 88px;
  border-radius: 22px;
  box-shadow: 0 12px 36px rgba(255, 85, 0, 0.4);
}

.hero-title {
  margin: 22px 0 0;
  font-size: 40px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.1;
}

.hero-tagline {
  margin: 10px 0 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--primary-light, #ff7733);
}

.hero-sub {
  margin: 18px auto 0;
  max-width: 560px;
  font-size: 16px;
  line-height: 1.7;
  color: #cbd5e1;
}

.hero-actions {
  margin-top: 28px;
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  display: inline-block;
  padding: 13px 26px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 999px;
  text-decoration: none;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-primary {
  background: var(--primary, #ff5500);
  color: #ffffff;
  box-shadow: 0 8px 24px rgba(255, 85, 0, 0.35);
}

.btn-ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

/* ── Content ──────────────────────────────────────────────────────────────── */
.content {
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 24px 24px;
}

.features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}

.feature-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 16px;
  padding: 26px;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.feature-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  padding-left: 12px;
  border-left: 4px solid var(--primary, #ff5500);
  line-height: 1.3;
}

.feature-body {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: #334155;
}

/* ── Download ─────────────────────────────────────────────────────────────── */
.download {
  margin-top: 36px;
  text-align: center;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 16px;
  padding: 40px 24px;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.download-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.download-sub {
  margin: 8px 0 22px;
  font-size: 15px;
  color: var(--text-muted, #64748b);
}

.store-badges {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.store-badge {
  display: inline-block;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-dark, #e04600);
  background: var(--primary-soft, rgba(255, 85, 0, 0.12));
  border: 1px solid rgba(255, 85, 0, 0.25);
  border-radius: 999px;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.footer {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px 48px;
  text-align: center;
}

.footer-links {
  display: flex;
  gap: 8px 22px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.footer-links a {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-dark, #e04600);
  text-decoration: none;
}

.footer-links a:hover {
  text-decoration: underline;
}

.footer-copy {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #64748b);
}

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .hero-inner {
    padding: 56px 18px 48px;
  }
  .hero-title {
    font-size: 32px;
  }
  .content {
    padding: 36px 14px 16px;
  }
  .features {
    grid-template-columns: 1fr;
  }
  .feature-card {
    padding: 22px;
  }
}
</style>
