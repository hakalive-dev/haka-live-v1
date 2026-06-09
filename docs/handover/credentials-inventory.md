# Haka Live — Credentials & Environment Variable Inventory

> **Placeholders only.** This table lists every credential/env var by **name**. Real values are delivered via the
> secure vault share (see [transfer-checklist.md](./transfer-checklist.md)). Names were derived from the **actual
> backend schema** `apps/backend/src/config/env.ts`, `eas.json`, `apps/mobile/app.json`, mobile
> `src/lib/supabase.ts`, and `.env.example`. Where `.env.example` disagrees with the code, the code wins
> (see [HANDOVER.md](./HANDOVER.md) §5).
>
> **Blast radius** = what an attacker could do if this value leaked.

## Backend — required at boot (`NODE_ENV=production`)

| Var | Service | Configured in prod | Blast radius if leaked |
|---|---|---|---|
| `NODE_ENV` | — | Render env | None (not secret). |
| `PORT` | — | Render env (default 3000) | None. |
| `DATABASE_URL` | Supabase Postgres (pooled) | Render env | Full DB read/write — **critical**. |
| `DIRECT_URL` | Supabase Postgres (direct) | Render env | Full DB + migrations — **critical**. |
| `REDIS_URL` | Render Redis | Render env | Read/poison socket, lock, leaderboard, OTP state. |
| `JWT_ACCESS_SECRET` | App auth | Render env | Forge any user access token — **critical**. |
| `JWT_REFRESH_SECRET` | App auth | Render env | Refresh-token signing isolation — **critical**. |
| `JWT_ACCESS_EXPIRY` | App auth | Render env (default `15m`) | None (config). |
| `JWT_REFRESH_EXPIRY` | App auth | Render env (default `30d`) | None (config). |
| `ADMIN_JWT_SECRET` | Admin console auth | Render env | Forge **admin** tokens — **critical**. |
| `ADMIN_INITIAL_EMAIL` | Admin seed | Render env | Identifies the seeded super-admin. |
| `ADMIN_INITIAL_PASSWORD` | Admin seed | Render env | Super-admin login — **critical**; rotate at handover. |
| `FIREBASE_PROJECT_ID` | Firebase Admin (FCM) | Render env | Low alone. |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin (FCM) | Render env | Low alone. |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin (FCM) | Render env | Send push as the app, access Firebase Admin — **high**. |
| `PAYMENT_ENCRYPTION_KEY` | Payout encryption (AES-256-GCM) | Render env (64-hex) | Decrypt stored payout details — **critical**. Boot fails without it in prod. Rotating breaks existing rows. |

## Backend — optional / feature-gated

| Var | Service | Configured in prod | Blast radius if leaked |
|---|---|---|---|
| `ENABLE_SCHEDULER` | Cron control | Render env (`true`/`false`) | None (config). |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | Rate limiting | Render env | None (config). |
| `CORS_ORIGIN` | CORS | Render env | None (config; was `CORS_ALLOWED_ORIGINS` in stale `.env.example`). |
| `AGORA_APP_ID` | Agora RTC | Render env | Public-ish (shipped to clients). |
| `AGORA_APP_CERTIFICATE` | Agora RTC | Render env | Mint valid RTC tokens / drive Agora spend — **high**. |
| `AGORA_NCS_SECRET` | Agora webhook HMAC | Render env | Forge lifecycle webhooks (viewer-count tampering). |
| `STRIPE_SECRET_KEY` | Stripe | Render env | Move money / refund / read customers — **critical**. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | Render env | Forge payment webhooks (credit coins fraudulently) — **high**. |
| `RAZORPAY_KEY_ID` | Razorpay | Render env | Low alone. |
| `RAZORPAY_KEY_SECRET` | Razorpay | Render env | Move money — **critical**. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhooks | Render env | Forge payment webhooks — **high**. |
| `SUPABASE_URL` | Supabase Storage | Render env | Low alone. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage/Auth | Render env | Full storage + DB-via-service-role access — **critical**. |
| `AWS_ACCESS_KEY_ID` | AWS S3 / Rekognition | Render env | Low alone. |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 / Rekognition | Render env | Access S3 + Rekognition (cost + data) — **high**. |
| `AWS_STORAGE_BUCKET_NAME` | AWS S3 | Render env | None (identifier). |
| `AWS_S3_REGION_NAME` | AWS S3 | Render env | None. |
| `REKOGNITION_FACE_COLLECTION_ID` | AWS Rekognition | Render env | None (identifier). |
| `REKOGNITION_REGION` | AWS Rekognition | Render env | None. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp OTP | Render env | Identifier. |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp OTP | Render env | Send WhatsApp messages as the business — **high**. |
| `WHATSAPP_TEMPLATE_NAME` / `_LANG` / `WHATSAPP_API_VERSION` | Meta WhatsApp OTP | Render env (defaults `haka_otp`/`en_US`/`v21.0`) | None (config). |
| `HAKA_TEAM_USER_ID` / `WITHDRAWAL_MESSAGE_USER_ID` | System users | Render env (optional) | None (must match seeded system users). |
| `FCM_TEAM_ANNOUNCEMENTS_TOPIC` | FCM | Render env (default `haka_team_announcements`) | None (config; mobile must match). |
| `DEV_LOGIN_PASSWORD` | Dev login fallback | **dev only** | Dev test login — never set in prod. |

## Mobile (Expo) — public env vars

These are `EXPO_PUBLIC_*` so they are **bundled into the app** and therefore not secret (treat as public).

| Var | Service | Configured in | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API | `eas.json` (`preview`/`production` → `https://api.hakalive.com/api/v1`) | Public. |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase Auth | EAS env / build env (`apps/mobile/src/lib/supabase.ts`) | Public. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth | EAS env / build env | Anon key — public by design (RLS-protected). |

## Files that ARE credentials (not env vars)

| File | Service | Location | Notes |
|---|---|---|---|
| `apps/mobile/google-services.json` | Firebase Android (FCM/Crashlytics) | In repo | Tied to the Firebase project; regenerate on a new project. Not a high-value secret but project-specific. |
| `apps/mobile/GoogleService-Info.plist` | Firebase iOS | In repo | Same, for iOS. |
| Android keystore (upload key) | Play signing | **EAS-managed, not in repo** | Download via `eas credentials -p android`. See [signing-and-play-store.md](./signing-and-play-store.md). |

## Vars in `.env.example` that are stale or inactive (verify before relying on them)

| Var in `.env.example` | Status |
|---|---|
| `JWT_SECRET` | **Stale** — backend uses `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`. |
| `FCM_SERVER_KEY` | **Stale/inactive** — backend pushes via Firebase Admin SDK (`FIREBASE_*`), not a legacy FCM server key. |
| `CORS_ALLOWED_ORIGINS` | **Renamed** — code reads `CORS_ORIGIN`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | Legacy OTP path (Supabase→Twilio). New OTP uses `WHATSAPP_*`. Confirm with owner whether Twilio is still live. |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | **Inactive** — LiveKit configured historically but rooms run on Agora; not validated in `env.ts`. |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `DEFAULT_FROM_EMAIL` | **No active backend consumer found** (no nodemailer/SMTP wiring in `apps/backend/src`). Email may be aspirational or handled outside this service. `TODO(owner): confirm if/where transactional email is sent.` |
| `GOOGLE_PAY_MERCHANT_ID` | Referenced as a payments method but **not validated in `env.ts`**; confirm where it is consumed before relying on it. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Used by `docker-compose.yml` (self-host Postgres), not by the Render/Supabase deploy. |
