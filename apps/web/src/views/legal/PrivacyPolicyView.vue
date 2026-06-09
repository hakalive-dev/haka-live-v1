<script setup lang="ts">
import logoUrl from '@/assets/icon.png'

// Public, no-auth page. Content is static legal copy.
// Placeholders the team must fill before publishing: EFFECTIVE_DATE, ACCOUNT_DELETION_URL.
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
          <h1 class="legal-hero-title">Privacy Policy</h1>
          <p class="legal-hero-subtitle">Haka Live</p>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="legal-content">
      <article class="legal-card">
        <p class="legal-effective">Effective Date: {{ EFFECTIVE_DATE }}</p>

        <p class="legal-intro">
          Welcome to Haka Live (&ldquo;Haka Live,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or
          &ldquo;us&rdquo;). We are committed to protecting your privacy and handling your personal
          information responsibly.
        </p>
        <p class="legal-intro">
          By using Haka Live, you agree to the collection, use, and disclosure of information as
          described in this Privacy Policy.
        </p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>We may collect the following information:</p>

          <h3>Account Information</h3>
          <ul>
            <li>Name and username</li>
            <li>Email address</li>
            <li>Mobile phone number</li>
            <li>Profile photo and profile information</li>
            <li>Date of birth</li>
          </ul>

          <h3>User Content</h3>
          <ul>
            <li>Live stream content</li>
            <li>Photos, videos, and audio uploaded by users</li>
            <li>Messages and chat content</li>
            <li>Virtual gifting and interaction records</li>
          </ul>

          <h3>Device Information</h3>
          <ul>
            <li>Device model and operating system</li>
            <li>Device identifiers</li>
            <li>IP address</li>
            <li>Network information</li>
            <li>App version and usage data</li>
          </ul>

          <h3>Transaction Information</h3>
          <ul>
            <li>Purchase history</li>
            <li>Virtual coin and gift transactions</li>
            <li>Payment-related information processed by authorized payment providers</li>
          </ul>
        </section>

        <section>
          <h2>2. How We Use Information</h2>
          <p>We use information to:</p>
          <ul>
            <li>Provide and operate Haka Live services</li>
            <li>Verify user accounts</li>
            <li>Process purchases and virtual gifts</li>
            <li>Improve platform performance and user experience</li>
            <li>Prevent fraud, abuse, and unauthorized activities</li>
            <li>Enforce our Terms and Community Guidelines</li>
            <li>Respond to support requests</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2>3. User Safety and Moderation</h2>
          <p>
            To maintain a safe platform, we may review reports, investigate violations, and take
            enforcement actions including content removal, account suspension, or permanent bans.
          </p>
        </section>

        <section>
          <h2>4. Information Sharing</h2>
          <p>We do not sell personal information.</p>
          <p>Information may be shared with:</p>
          <ul>
            <li>Service providers supporting platform operations</li>
            <li>Payment processors</li>
            <li>Legal authorities when required by law</li>
            <li>Professional advisors and auditors when necessary</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Security</h2>
          <p>
            We implement reasonable administrative, technical, and organizational measures to
            protect user information against unauthorized access, misuse, or disclosure.
          </p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>We retain information only as long as necessary for:</p>
          <ul>
            <li>Service operation</li>
            <li>Security and fraud prevention</li>
            <li>Legal compliance</li>
            <li>Dispute resolution</li>
          </ul>
        </section>

        <section>
          <h2>7. Account Deletion</h2>
          <p>In the app, users may delete their account through:</p>
          <p class="legal-path">Settings &rarr; Account and security &rarr; Cancel Account</p>
          <p>
            Users may also request deletion from any web browser at
            <RouterLink to="/delete-account">www.hakalive.com/delete-account</RouterLink>.
          </p>
          <p>
            Certain information may be retained where required by law, fraud prevention, or security
            obligations.
          </p>
        </section>

        <section>
          <h2>8. Children&rsquo;s Privacy</h2>
          <p>
            Haka Live is intended only for individuals who meet the minimum age requirements of the
            applicable jurisdiction.
          </p>
          <p>Users under the required age may not create accounts or use the platform.</p>
        </section>

        <section>
          <h2>9. International Data Transfers</h2>
          <p>
            Your information may be processed and stored in countries where our service providers
            operate. We take reasonable measures to protect personal information during such
            transfers.
          </p>
        </section>

        <section>
          <h2>10. Changes to this Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Updated versions will be published
            within the application and on our website.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
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

.legal-path {
  font-weight: 600;
  color: var(--text-primary, #0f172a) !important;
  background: var(--content-bg, #f1f5f9);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 8px;
  padding: 10px 14px;
  display: inline-block;
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
