# Haka Live — Production Stack & Cost Plan

> **Spreadsheet export:** Fixed monthly subscriptions are in [tech-stack-monthly-costs.csv](./tech-stack-monthly-costs.csv) (import into Excel/Sheets). Variable usage (Agora, SMS, etc.) remains documented below.

## Auth Architecture

| Layer | Service | Purpose |
|---|---|---|
| Session Management | Supabase Auth | JWTs, user records — included in Pro plan |
| Phone OTP (SMS / WhatsApp) | Supabase Auth + Twilio | Mobile calls `supabase.auth.signInWithOtp`; Twilio (or other provider) configured in Supabase Dashboard → Authentication |
| Push Notifications | Firebase FCM | Free up to 1M messages/day — keep Admin SDK for push only |

**Backend flow:** Mobile verifies OTP with Supabase → exchanges Supabase access token at `POST /api/v1/auth/supabase` → backend issues its own JWT pair.

**What this keeps:** Firebase project + `firebase-admin` on the backend **for FCM push only** (not for phone OTP).

**Legacy:** `POST /api/v1/auth/firebase` remains for older builds; new sign-in uses Supabase Auth.

---

## Complete Monthly Cost Breakdown

### Fixed Infrastructure

| Service | Provider | Detail | Low | High |
|---|---|---|---|---|
| Backend API | Render | 2× Standard Instances | $50 | $70 |
| Admin Panel | Render | Static Site | $7 | $15 |
| Redis Cache | Render | 1GB Redis | $20 | $20 |
| Database | Supabase | Pro Plan | $25 | $25 |
| Storage | Supabase | 100GB included + extra | $10 | $20 |
| CDN | Cloudflare | Pro | $20 | $20 |
| Monitoring | Better Stack / Sentry | Free / Starter | $0 | $20 |
| Push Notifications | Firebase FCM | Spark/Blaze (FCM free tier) | $0 | $0 |
| Mobile Builds | EAS (Expo) | Free tier — 30 builds/mo | $0 | $29 |
| App Store | Apple Developer | $99/year amortized | $8 | $8 |
| **Fixed Subtotal** | | | **$140** | **$207** |

---

### Variable (Usage-Based)

| Service | Provider | Detail | Low | High |
|---|---|---|---|---|
| Phone OTP (SMS) | Supabase Auth → Twilio | Per SMS verification (Twilio as Supabase SMS provider) | $15 | $50 |
| Audio / Video Rooms | Agora | Per participant-minute | $50 | $500+ |
| Payments | TBD | To be Discussed | — | — |
| **Variable Subtotal** | | | **$65** | **$550+** |

---

## Total by Growth Stage

| Stage | Concurrent Users | Fixed | Variable | Monthly Total |
|---|---|---|---|---|
| Early | < 100 | $140–207 | $65–150 | **~$205–357** |
| Comfortable | 100–300 | $140–207 | $150–600 | **~$290–807** |
| Growth | 300–700 | $140–207 | $400–1,500 | **~$540–1,707** |
| Scale | 700–1,500 | $160–250 | $1,200–3,000 | **~$1,360–3,250** |

---

## Notes on Each Line

### Render — Backend API ($50–70)
Standard instance = $25/month. Two instances provide zero-downtime deploys and basic redundancy. At scale, consider switching to 1× Performance instance ($85/mo) instead of 2× Standard.

**Required env:** `PAYMENT_ENCRYPTION_KEY` — 64-character hex (32 bytes). Generate locally (`openssl rand -hex 32` or Node); set in Render Dashboard → Environment (no shell/SSH on Render). Without it, bind returns 500 for every withdrawal country. Production API will not start if this var is missing. See [docs/deploy/payment-encryption-key.md](./deploy/payment-encryption-key.md).

**Post-deploy smoke (one bind per method type):** PH `gcash` (mobile_wallet), PH `bank_php` (bank_account), IN `upi`, US `epay`, US `usdt_trc20`, US `usdt_bep20` — each should return 200 with `masked_account`.

### Render — Admin Panel ($7–15)
The admin SPA is compiled into the backend Docker image and served via Nginx — no separate Render service is strictly required. Use Render Static Site ($7/mo) only if you need an isolated staging deploy. Otherwise this line is $0.

### Render Redis ($20 flat)
Flat $20/month for 1GB. Chosen over Upstash pay-as-you-go because Socket.io pub/sub generates 800k–1.2M Redis commands/day at 100 concurrent users — Upstash would cost $60+/month at that volume. Render Redis is predictable, same network, low latency.

### Supabase Pro ($25)
Covers: PostgreSQL (8GB), Auth (unlimited users), Storage (100GB included), Realtime, Edge Functions. Best-value line in the stack.

### Supabase Extra Storage ($10–20)
100GB included in Pro handles early stage comfortably. Extra storage ($0.021/GB) only becomes relevant once you have heavy moment posts, profile media, and gift animation uploads at scale.

### Supabase Auth + Twilio — Phone OTP ($15–50)
OTP is sent by Supabase Auth using the SMS provider you configure (typically **Twilio** in Supabase Dashboard → Authentication → Providers → Phone). There is no separate Firebase Auth Blaze line for SMS.

Typical Twilio SMS rates (billed via Twilio; may also appear on your Twilio invoice, not Supabase Pro):

- US / UK: ~$0.006–0.01/SMS
- Nigeria, Egypt, UAE, Philippines: ~$0.03–0.08/SMS

Budget based on your primary target market. 500 new registrations/month in mixed regions ≈ $15–40/month.

Optional WhatsApp OTP: configure a Twilio WhatsApp sender + Meta Business account and enable in Supabase; see `apps/mobile/src/utils/supabasePhoneAuth.ts`.

### Firebase FCM ($0)
Free up to 1M push messages/day. A Firebase project is required for FCM only — **not** for phone OTP. Keep `firebase-admin` in the backend for notification sending. No Blaze spend unless you use other paid Firebase products.

### Agora — Audio/Video Rooms ($50–500+)
Audio-only pricing: **$0.99 / 1,000 participant-minutes**

| Concurrent Users | Audio Min/Month | Est. Cost |
|---|---|---|
| 50 | 720,000 | ~$71/mo |
| 200 | 2,880,000 | ~$285/mo |
| 500 | 7,200,000 | ~$713/mo |

> **Set a hard spend alert in the Agora dashboard before launch.** This is the only unbounded line item in the stack.

### EAS Build ($0–29)
Free tier covers 30 builds/month — sufficient for a small team. Upgrade to $29/mo Production plan only if CI automation or priority build queue is needed.

### Apple Developer ($8/mo)
$99/year, required to publish on the App Store. Amortised = $8.25/month.

### Payments — To be Discussed
Payment gateway provider and pricing model to be decided.

---

## What Was Missing from the Original $180–250 Estimate

| Item | Monthly Addition |
|---|---|
| Supabase Auth / Twilio SMS (Phone OTP) | +$15–50 |
| Agora (audio/video rooms) | +$50–500+ |
| EAS Build + Apple Developer | +$8–37 |
| Payments | To be Discussed |

The original estimate covered fixed infrastructure only. The realistic comfortable production target with 100–200 concurrent users is **~$300–500/month**, with Agora as the primary variable.
