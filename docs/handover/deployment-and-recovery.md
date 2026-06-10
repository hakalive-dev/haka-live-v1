# Haka Live — Deployment & Recovery

> The most operationally important doc in the pack. Every command was taken from the repo's actual
> config (`docker-compose.dev.yml`, `docker/backend/Dockerfile`, `apps/backend/package.json`,
> `eas.json`, `apps/mobile/app.json`) and verified on 2026-06-05. Where a fact depends on an external
> console the original team controlled (exact Render service names, etc.), it is marked
> `TODO(owner): confirm` — do not guess.

Contents: **A.** Local dev · **B.** Production deploy · **C.** Mobile release · **D.** Disaster recovery ·
**E.** Rollback.

---

## A. Local development from a clean machine

### A.1 Prerequisites

- **Docker** + Docker Compose (the dev stack runs Postgres, Redis, and the API in containers).
- **Node.js 20+** and npm (for running migrations/seeds outside Docker and for the mobile/admin/web apps).
- For mobile builds: an **Expo account** with access to the `testing-of-dev` owner / EAS project
  `a77ae84c-cca1-4769-8ddb-43047ba94951`, the **EAS CLI** (`npm i -g eas-cli`), and **JDK 17** for local Android runs
  (the repo wraps `expo run:android` with `scripts/with-jdk17.sh`).

### A.2 Configure environment

```bash
git clone <repo-url> haka-live
cd haka-live
cp .env.example .env
```

> ⚠️ `.env.example` is **stale** (see [HANDOVER.md](./HANDOVER.md) §5). Use
> [credentials-inventory.md](./credentials-inventory.md) (derived from `apps/backend/src/config/env.ts`) as the
> authoritative list of variable **names**. At minimum, local dev needs `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
> `ADMIN_JWT_SECRET`, `ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD`, and Firebase Admin vars
> (`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`). `docker-compose.dev.yml` already injects
> `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, and a **dev-only** `PAYMENT_ENCRYPTION_KEY` — do not reuse that value
> anywhere near production.

### A.3 Start the stack

```bash
docker compose -f docker-compose.dev.yml up --build
```

This brings up:

- **Postgres 16** on host port **5433** (db `hakalive_dev`, user/pass `hakalive` / `hakalive`)
- **Redis 7** on **6379**
- **Backend** (hot-reload) on **http://localhost:3010** — API at `/api/v1`, admin SPA at `/admin`

The backend container runs `npx prisma migrate deploy && npx prisma generate && npm run dev` on start, so a fresh
DB is migrated automatically. Optional schedulers/BullMQ worker:

```bash
docker compose -f docker-compose.dev.yml --profile worker up --build
# (set ENABLE_SCHEDULER=false on the backend in .env to avoid duplicate cron)
```

### A.4 Seed data

```bash
docker compose -f docker-compose.dev.yml exec backend npm run seed         # base reference data
docker compose -f docker-compose.dev.yml exec backend npm run seed:admin   # initial super_admin
docker compose -f docker-compose.dev.yml exec backend npm run seed:demo    # demo agents/hosts/users
docker compose -f docker-compose.dev.yml exec backend npm run seed:testuser
```

Seeded logins are in [../../TEST_CREDENTIALS.md](../../TEST_CREDENTIALS.md). **These are dev-only plaintext passwords;
never run `seed:demo`/`seed:testuser` against production, and rotate the admin password — see
[transfer-checklist.md](./transfer-checklist.md).**

The backend also **auto-seeds** the super-admin on every boot if none exists, using `ADMIN_INITIAL_EMAIL` /
`ADMIN_INITIAL_PASSWORD` (`apps/backend/src/server.ts` `seedAdmin()`), plus built-in admin role tags.

### A.5 Run each app

| App | Command | Notes |
|---|---|---|
| Backend | (runs in Docker above) or `cd apps/backend && npm run dev` | Needs Postgres+Redis reachable and env set. |
| Admin | `cd apps/admin && npm install && npm run dev` | Vite dev server (default http://localhost:5173). For prod it is built into the backend image. |
| Web | `cd apps/web && npm install && npm run dev` | Marketing/legal site. |
| Mobile | `cd apps/mobile && npm install && npm start` | Expo dev client. Set `EXPO_PUBLIC_API_URL` for a non-default API (prod uses `https://api.hakalive.com/api/v1` per `eas.json`). Android local run: `npm run android` (wraps JDK 17). |

### A.6 Tests

```bash
docker compose -f docker-compose.dev.yml exec backend npm test
# backend test runner: jest --runInBand --forceExit --detectOpenHandles
cd apps/mobile && npm run type-check   # tsc --noEmit
```

---

## B. Production deployment

Production runs on **Render** (backend API + Redis) with **Supabase** (Postgres + Auth + Storage). Domains:
`api.hakalive.com` (API + admin), `hakalive.com` (web + app links).

> **TODO(owner): confirm the exact Render service names and the build mode.** The repo supports two models and the
> original Render setup is not fully described in code:
> - **Native Node build** — Render builds with `npm run build` (which `tsc` compiles and builds + copies the admin
>   SPA into `admin-dist`) and starts with `npm start` (`node dist/server.js`). The admin-path comment "Render native:
>   cwd is apps/backend" in `apps/backend/src/app.ts` suggests this is what was used.
> - **Docker image** — `docker/backend/Dockerfile` (multi-stage; production stage runs
>   `node dist/scripts/prisma-recover.js && npx prisma migrate deploy && node dist/server.js`).
> Confirm which is configured in the Render dashboard before your first deploy, and keep using it.

### B.1 Render services (confirm names with owner)

| Service | Purpose | Health |
|---|---|---|
| Backend API web service | Express + Socket.io + embedded admin | `GET /health` returns `{ success:true, data:{status:"ok"} }` |
| Worker (optional) | BullMQ + schedulers | Set `ENABLE_SCHEDULER=true` here and `false` on API nodes |
| Redis | Socket.io adapter, locks, leaderboards, OTP rate-limit | Managed Render Redis |

If you run **two** API instances for zero-downtime deploys, the Redis adapter handles cross-instance socket fan-out
automatically (no extra config). Run the scheduler on exactly one process.

### B.2 Production environment variables (set in Render Dashboard → Environment)

Set by **name** — values come from the vault share. Authoritative list: [credentials-inventory.md](./credentials-inventory.md).
The boot-critical ones:

- `NODE_ENV=production`
- `DATABASE_URL` (Supabase **pooled** connection) and `DIRECT_URL` (Supabase **direct** connection — Prisma uses
  this for migrations; see [database.md](./database.md))
- `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (min 16 chars each), `JWT_ACCESS_EXPIRY` (default `15m`),
  `JWT_REFRESH_EXPIRY` (default `30d`)
- `ADMIN_JWT_SECRET`, `ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD` (min 12 chars)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` (+ `AGORA_NCS_SECRET` if using the lifecycle webhook)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (storage)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, `GOOGLE_PAY_MERCHANT_ID`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_REGION_NAME`,
  `REKOGNITION_FACE_COLLECTION_ID`, `REKOGNITION_REGION`
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`,
  `WHATSAPP_API_VERSION`
- `PAYMENT_ENCRYPTION_KEY` (64-hex) — **production will not boot without it.** Generate with
  `openssl rand -hex 32` locally and paste into Render (no shell needed). See
  [../deploy/payment-encryption-key.md](../deploy/payment-encryption-key.md).
- `CORS_ORIGIN` (production origins)

Env-validation is enforced at boot by `apps/backend/src/config/env.ts` (Zod). A missing/invalid required var exits
the process — check Render **Logs** for the field error.

### B.3 Database (Supabase)

1. Create a Supabase project (Pro). Get the **pooled** and **direct** connection strings (Settings → Database).
2. Set `DATABASE_URL` (pooled, e.g. port 6543) and `DIRECT_URL` (direct, port 5432) on the backend.
3. Apply migrations: `npx prisma migrate deploy` (the Docker/start command already does this on boot). 128 migrations
   currently exist.
4. Create Storage buckets exactly as in [../deploy/supabase-storage-buckets.md](../deploy/supabase-storage-buckets.md).
5. Seed admin runs automatically on boot (`ADMIN_INITIAL_*`).

### B.4 Admin console / Nginx embedding

There is **no separate admin deploy** in the default model — `npm run build` builds the admin SPA and embeds it into
the backend, served at `https://api.hakalive.com/admin`. If self-hosting with `docker-compose.yml`, the Nginx service
mounts `apps/admin/dist` and proxies `/api`, `/socket.io`, `/health`, and `/admin/` (see `docker/nginx/nginx.conf`).

### B.5 Keep-warm GitHub Action

`.github/workflows/keep-backend-warm.yml` pings `GET /health` every 5 minutes so Render's idle service stays warm
(cold start is 5–15s). Override the URL with repo **Actions variable** `BACKEND_HEALTH_URL` if the host changes; it
falls back to `https://api.hakalive.com/health`. Caveat: GitHub disables scheduled workflows after 60 days of repo
inactivity (any push re-enables); for a hard guarantee use a paid always-on Render instance or an external uptime monitor.

### B.6 Domains / DNS

| Host | Points to | Used for |
|---|---|---|
| `api.hakalive.com` | Render backend service | API + admin console + webhooks |
| `hakalive.com` / `www.hakalive.com` | Web app host | Marketing, legal pages, app-link association files |

For deep links you must serve, over HTTPS with correct content type:
`https://hakalive.com/.well-known/apple-app-site-association` and `.../assetlinks.json`
(templates in [../deploy/invite-universal-links/](../deploy/invite-universal-links/)). The Android `assetlinks.json`
SHA-256 must be the **Play App Signing** certificate fingerprint (see [signing-and-play-store.md](./signing-and-play-store.md)).
`TODO(owner): confirm DNS registrar and that A/CNAME + TLS for both domains are in place.`

---

## C. Mobile release process

Config: `eas.json` (root and `apps/mobile/eas.json`), `apps/mobile/app.json`. EAS uses `appVersionSource: "remote"`,
so EAS tracks the build number; `production` has `autoIncrement: true`.

### C.1 Build profiles (`eas.json`)

| Profile | Distribution | API URL env | Use |
|---|---|---|---|
| `development` | internal, dev client | (default) | Local dev client builds |
| `preview` | internal | `EXPO_PUBLIC_API_URL=https://api.hakalive.com/api/v1` | QA / internal testing APK |
| `production` | store | `EXPO_PUBLIC_API_URL=https://api.hakalive.com/api/v1`, `autoIncrement` | Play/App Store submission |

### C.2 Version bump (per [../versioning-and-maintenance.md](../versioning-and-maintenance.md))

- `version` (semver) in `apps/mobile/app.json` — human-readable, follows MAJOR.MINOR.PATCH.
- `android.versionCode` (integer) — must **increase every upload**, never reuse. Current `versionCode 1`,
  `version 1.0.0`. Note that `eas.json` `production.autoIncrement` lets EAS manage the build number remotely; keep the
  `version` string in step with your release.
- Tag each release: `git tag v1.0.1 && git push origin v1.0.1`.

### C.3 Produce the production AAB and submit

```bash
cd apps/mobile
eas login                                       # account that owns project a77ae84c-...
eas build --profile production --platform android   # outputs a signed AAB (EAS holds the keystore)
eas submit --profile production --platform android --latest
```

- **AAB**, not APK, is what Play requires; the `production` profile (store distribution) produces it.
- Signing is **EAS-managed** — there is no local keystore in the repo. See [signing-and-play-store.md](./signing-and-play-store.md).
- **`mapping.txt` (ProGuard/R8 deobfuscation):** generated by the EAS build. Retrieve it from the **EAS build details
  page** (build artifacts) or via `eas build:view`; upload it to Play Console (and Crashlytics) so crash stack traces
  deobfuscate. It is not committed to the repo.

### C.4 Roll out

Submit to **Closed Testing** first, then Production at **20%**, monitor Crashlytics/ANR for 24–48h, then promote to
100% (per the versioning doc's thresholds: crash-free < 99.5% or ANR > 0.47% → stop and investigate).

---

## D. Disaster recovery — rebuild everything on brand-new accounts

Goal: from **a git clone + a database backup**, stand the whole system back up on **fresh accounts** for every
provider. Order matters because later steps depend on credentials from earlier ones.

> You will need, at each step, the corresponding console login (the new owner's accounts). Keep the recovered secrets
> in a vault as you go; you will paste them into Render at the end.

1. **Source code** — `git clone` the repo (and push to the new owner's GitHub). This is the single source of truth for
   build/deploy config. Verify `apps/`, `docker/`, `eas.json`, `prisma/` are present.

2. **Database (Supabase or any Postgres 16):**
   - Create a fresh Postgres 16 instance (Supabase Pro recommended).
   - Restore the latest backup (see [database.md](./database.md) §Restore — `pg_restore` against `DIRECT_URL`).
   - If you have **no** backup, you can bootstrap an empty DB: set `DATABASE_URL`/`DIRECT_URL`, run
     `npx prisma migrate deploy`, then `npm run seed` + `npm run seed:admin` (production-safe seeds only). All user
     data is lost in this case.
   - Create the Supabase **Storage buckets** ([../deploy/supabase-storage-buckets.md](../deploy/supabase-storage-buckets.md)).
     Note: storage **objects** (uploaded images) are not in the Postgres backup — restore them from a Storage backup if
     one exists, otherwise links to old media will 404.

3. **Redis** — create a fresh Render Redis (or any Redis 7). No persistence required for correctness; it holds
   ephemeral socket/lock/leaderboard/OTP state.

4. **Firebase project (FCM + Crashlytics):**
   - Create a Firebase project; add an Android app with package `com.hakalive.app` and (if shipping iOS) an iOS app
     with bundle id `com.hakalive.app`.
   - Download a new `google-services.json` → `apps/mobile/google-services.json` and `GoogleService-Info.plist` →
     `apps/mobile/`. **A new Firebase project = new config files = a new mobile build is required.**
   - Create a service account → its key provides `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

5. **Agora project** — create a project in the Agora console, enable the **App Certificate**, copy `AGORA_APP_ID` +
   `AGORA_APP_CERTIFICATE`. (Optional: configure the NCS webhook → `AGORA_NCS_SECRET`.) See [agora.md](./agora.md).

6. **Payments** — create fresh **Stripe** and **Razorpay** accounts; copy secret keys and configure webhooks pointing
   at `https://<new-api-host>/api/v1/...` → record the webhook signing secrets. Set up **Google Pay** merchant id.

7. **AWS** — create an IAM user with S3 + Rekognition access; create the S3 bucket and a Rekognition face collection
   (`npm run rekognition:setup` once env is wired). Record `AWS_*` and `REKOGNITION_*`.

8. **WhatsApp (Meta) OTP** — create a Meta Business + WhatsApp Cloud API app, an approved message template
   (`WHATSAPP_TEMPLATE_NAME`, default `haka_otp`), and a permanent access token → `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_ACCESS_TOKEN`.

9. **Gmail SMTP** — set up the sending account → `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
   `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` (use an app password, not the raw account password).

10. **Generate fresh app secrets locally:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_JWT_SECRET`
    (`openssl rand -hex 32` each), a fresh `PAYMENT_ENCRYPTION_KEY` (`openssl rand -hex 32`). ⚠️ **Rotating
    `PAYMENT_ENCRYPTION_KEY` invalidates existing encrypted payout rows** — if you restored a DB with bound payout
    methods, you must reuse the *original* key or run a decrypt-old/encrypt-new migration. Set
    `ADMIN_INITIAL_EMAIL`/`ADMIN_INITIAL_PASSWORD` to a strong new value.

11. **Deploy backend (Render):** create the web service from the repo (using the confirmed build mode), set **all**
    env vars by name with the recovered values, deploy, and watch **Logs** for a clean boot + `Database connected`.
    Migrations run on boot; admin auto-seeds.

12. **Build + ship mobile:** with the new `google-services.json` and `EXPO_PUBLIC_API_URL` pointing at the new API,
    `eas build --profile production -p android` and submit. (Signing/keystore: see [signing-and-play-store.md](./signing-and-play-store.md)
    — if the Expo account/project was transferred, the keystore travels with it; if you create a brand-new Expo
    project you get a **new upload key** and must enroll/update Play App Signing accordingly.)

13. **DNS** — point `api.hakalive.com` at the new Render service and `hakalive.com` at the new web host; re-deploy the
    `.well-known` association files with the new signing fingerprint.

14. **Smoke test:** `GET /health` 200; admin login at `/admin`; phone OTP send/verify; create a room + fetch an Agora
    token; a Stripe/Razorpay test top-up; a test FCM push; a DM image upload returns a working Supabase public URL.

---

## E. Rollback procedures

### E.1 Backend deploy rollback (Render)

Render keeps prior deploys. In the Render dashboard → the backend service → **Deploys**, select the last known-good
deploy and **Roll back / Redeploy** it. Because the start command runs `prisma migrate deploy`, see the migration
caveat below before rolling back across a schema change.

### E.2 Mobile rollback / OTA

- **OTA (`eas update`) is NOT currently available** — `expo-updates` is not installed in `apps/mobile/package.json`
  (see [HANDOVER.md](./HANDOVER.md) §5). The hotfix "Option A — OTA" path in
  [../versioning-and-maintenance.md](../versioning-and-maintenance.md) will not work until `expo-updates` is added
  and configured (`npx expo install expo-updates`, set `runtimeVersion`, then `eas update`).
- Until then, **all rollbacks are store-level:** in Play Console you can **halt a staged rollout** and resume the
  previous release at 100%. You cannot "downgrade" an installed app remotely; you ship a new higher `versionCode`
  build containing the reverted code.

### E.3 Database migration rollback (Prisma) — caveats

- **Prisma has no automatic down-migrations.** `prisma migrate deploy` only rolls **forward**. To undo a schema
  change you must author and apply a **new** corrective migration (or restore from backup).
- A **failed/partial migration** leaves the `_prisma_migrations` table marked failed and blocks future deploys; the
  production start command runs `dist/scripts/prisma-recover.js` first to handle recovery, and
  `npx prisma migrate resolve --applied <name>` (e.g. the `prisma:resolve:add_room_members` script) can mark a
  migration resolved. Investigate the root cause before forcing resolution.
- **For a destructive migration, take a fresh DB backup immediately before deploying it** (see [database.md](./database.md)).
  If a backend rollback (E.1) reverts code that expected the new schema, you may also need to restore the matching
  DB backup — keep code and schema versions aligned.
