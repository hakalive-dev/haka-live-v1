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
          <h1 class="legal-hero-title">Terms &amp; Conditions</h1>
          <p class="legal-hero-subtitle">Haka Live</p>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="legal-content">
      <article class="legal-card">
        <p class="legal-effective">Effective Date: {{ EFFECTIVE_DATE }}</p>

        <p class="legal-intro">
          These Terms &amp; Conditions govern your access to and use of Haka Live.
        </p>
        <p class="legal-intro">
          By accessing or using Haka Live, you agree to be bound by these Terms.
        </p>

        <section>
          <h2>1. Eligibility</h2>
          <p>
            You must meet the minimum age requirement applicable in your jurisdiction to use Haka
            Live.
          </p>
          <p>By using the platform, you confirm that you are legally eligible to do so.</p>
        </section>

        <section>
          <h2>2. User Accounts</h2>
          <p>Users are responsible for:</p>
          <ul>
            <li>Maintaining account security</li>
            <li>Keeping login credentials confidential</li>
            <li>Providing accurate information</li>
            <li>All activities occurring under their account</li>
          </ul>
        </section>

        <section>
          <h2>3. Acceptable Use</h2>
          <p>Users must not:</p>
          <ul>
            <li>Violate any laws or regulations</li>
            <li>Upload illegal, fraudulent, or harmful content</li>
            <li>Harass, threaten, or abuse others</li>
            <li>Impersonate any person or organization</li>
            <li>Use bots, automation tools, or unauthorized software</li>
            <li>Distribute malware or malicious code</li>
            <li>Engage in scams or deceptive practices</li>
          </ul>
        </section>

        <section>
          <h2>4. Live Streaming and User Content</h2>
          <p>Users remain responsible for content they create, upload, stream, or share.</p>
          <p>
            Haka Live reserves the right to review, remove, restrict, or disable content that
            violates platform policies.
          </p>
        </section>

        <section>
          <h2>5. Virtual Coins, Gifts, and Digital Items</h2>
          <p>Virtual coins, gifts, and digital items:</p>
          <ul>
            <li>Are licensed, not owned</li>
            <li>Have no cash value unless expressly stated</li>
            <li>Are non-transferable unless permitted by Haka Live</li>
            <li>May be modified, discontinued, or adjusted at any time</li>
          </ul>
          <p>Except where required by law, purchases are non-refundable.</p>
        </section>

        <section>
          <h2>6. Agency, Host, and Creator Programs</h2>
          <p>
            Agencies, hosts, creators, and representatives must comply with all platform rules,
            policies, and applicable laws.
          </p>
          <p>Violation of program requirements may result in suspension or termination.</p>
        </section>

        <section>
          <h2>7. Intellectual Property</h2>
          <p>
            All platform technology, branding, trademarks, graphics, and software belong to Haka
            Live or its licensors.
          </p>
          <p>
            Users may not copy, distribute, modify, or exploit platform assets without
            authorization.
          </p>
        </section>

        <section>
          <h2>8. Account Suspension and Termination</h2>
          <p>Haka Live may suspend, restrict, or permanently terminate accounts that:</p>
          <ul>
            <li>Violate these Terms</li>
            <li>Violate Community Guidelines</li>
            <li>Create security risks</li>
            <li>Engage in fraudulent activities</li>
          </ul>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Haka Live shall not be liable for indirect,
            incidental, consequential, or special damages arising from platform use.
          </p>
        </section>

        <section>
          <h2>10. Changes to Terms</h2>
          <p>
            We may update these Terms periodically. Continued use of Haka Live after updates
            constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>11. Governing Law</h2>
          <p>
            These Terms shall be governed by the laws applicable to the legal entity operating Haka
            Live.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <div class="legal-contact">
            <p><span class="legal-contact-label">Company Name</span> HAKA LIVE</p>
            <p>
              <span class="legal-contact-label">Email</span>
              <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a>
            </p>
          </div>
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
  margin: 0 0 6px;
  color: var(--text-primary, #0f172a);
}

.legal-contact p:last-child {
  margin-bottom: 0;
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
