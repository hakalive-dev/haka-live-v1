<script setup lang="ts">
import logoUrl from '@/assets/icon.png'

// Public, no-auth page. Content is static legal copy.
const EFFECTIVE_DATE = 'June 3, 2026'
const SUPPORT_EMAIL = 'support@hakalive.com'
</script>

<template>
  <div class="legal-page">
    <!-- Brand header -->
    <header class="legal-hero">
      <div class="legal-hero-inner">
        <img :src="logoUrl" alt="Haka Live" class="legal-logo" />
        <div>
          <h1 class="legal-hero-title">Community Guidelines</h1>
          <p class="legal-hero-subtitle">Haka Live</p>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="legal-content">
      <article class="legal-card">
        <p class="legal-effective">Effective Date: {{ EFFECTIVE_DATE }}</p>

        <p class="legal-intro">
          Our goal is to create a safe, welcoming, and entertaining community for everyone.
        </p>
        <p class="legal-intro">
          By using Haka Live, you agree to follow these Community Guidelines.
        </p>

        <section>
          <h2>Respect Others</h2>
          <p>Users should:</p>
          <ul>
            <li>Treat others respectfully</li>
            <li>Encourage positive interactions</li>
            <li>Communicate responsibly</li>
            <li>Respect cultural and personal differences</li>
          </ul>
        </section>

        <section>
          <h2>Prohibited Content</h2>
          <p>The following content is not allowed:</p>

          <h3>Sexual Content</h3>
          <ul>
            <li>Nudity</li>
            <li>Sexually explicit material</li>
            <li>Sexual exploitation</li>
            <li>Adult services promotion</li>
          </ul>

          <h3>Harassment and Abuse</h3>
          <ul>
            <li>Bullying</li>
            <li>Threats</li>
            <li>Intimidation</li>
            <li>Targeted harassment</li>
          </ul>

          <h3>Hate Speech</h3>
          <ul>
            <li>Content attacking individuals or groups based on protected characteristics</li>
            <li>Extremist or discriminatory content</li>
          </ul>

          <h3>Violence and Dangerous Activities</h3>
          <ul>
            <li>Graphic violence</li>
            <li>Threats of harm</li>
            <li>Promotion of dangerous activities</li>
          </ul>

          <h3>Fraud and Scams</h3>
          <ul>
            <li>Financial scams</li>
            <li>Misleading promotions</li>
            <li>Fake giveaways</li>
            <li>Impersonation</li>
          </ul>

          <h3>Illegal Activities</h3>
          <ul>
            <li>Criminal conduct</li>
            <li>Drug trafficking</li>
            <li>Human exploitation</li>
            <li>Sale of prohibited goods</li>
          </ul>

          <h3>Spam and Manipulation</h3>
          <ul>
            <li>Fake engagement</li>
            <li>Automated accounts</li>
            <li>Repetitive spam content</li>
            <li>Platform abuse</li>
          </ul>
        </section>

        <section>
          <h2>Live Stream Rules</h2>
          <p>Hosts and creators must:</p>
          <ul>
            <li>Follow all applicable laws</li>
            <li>Maintain appropriate conduct</li>
            <li>Respect platform policies</li>
            <li>Avoid prohibited content during broadcasts</li>
          </ul>
        </section>

        <section>
          <h2>Reporting Violations</h2>
          <p>
            Users may report content, streams, messages, or accounts that violate these Guidelines.
          </p>
          <p>All reports are reviewed by our moderation team.</p>
        </section>

        <section>
          <h2>Enforcement Actions</h2>
          <p>Violations may result in:</p>
          <ul>
            <li>Warning notices</li>
            <li>Content removal</li>
            <li>Temporary restrictions</li>
            <li>Stream suspension</li>
            <li>Account suspension</li>
            <li>Permanent account termination</li>
            <li>Device restrictions</li>
          </ul>
        </section>

        <section>
          <h2>Community Responsibility</h2>
          <p>
            Every member of Haka Live contributes to maintaining a safe and enjoyable environment.
          </p>
          <p>
            Repeated or severe violations may result in immediate permanent enforcement action.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <div class="legal-contact">
            <p><span class="legal-contact-label">Email</span> <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a></p>
          </div>
        </section>
      </article>

      <footer class="legal-footer">&copy; {{ new Date().getFullYear() }} Haka Live. All rights reserved.</footer>
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

.legal-effective {
  display: inline-block;
  margin: 0 0 24px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-dark, #e04600);
  background: var(--primary-soft, rgba(255, 85, 0, 0.12));
  border-radius: 999px;
}

.legal-intro {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary, #0f172a);
  margin: 0 0 14px;
}

.legal-card section {
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

.legal-card h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--primary-dark, #e04600);
  margin: 20px 0 8px;
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

.legal-contact {
  background: var(--primary-soft, rgba(255, 85, 0, 0.12));
  border: 1px solid rgba(255, 85, 0, 0.25);
  border-radius: 12px;
  padding: 18px 20px;
}

.legal-contact p {
  margin: 0;
  color: var(--text-primary, #0f172a);
}

.legal-contact-label {
  display: inline-block;
  min-width: 120px;
  font-weight: 700;
  color: var(--primary-dark, #e04600);
}

.legal-contact a {
  color: var(--primary-dark, #e04600);
  font-weight: 600;
  text-decoration: none;
}

.legal-contact a:hover {
  text-decoration: underline;
}

.legal-footer {
  text-align: center;
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-muted, #64748b);
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
  .legal-contact-label {
    min-width: auto;
    display: block;
  }
}
</style>

