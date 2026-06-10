# Haka Live — Technical Handover Pack

> **Audience:** the incoming developer / operations team taking ownership of Haka Live ahead of the
> Google Play launch. This pack is written so that a team with **zero prior contact** with the original
> developer can build, deploy, update, recover, and maintain the entire system.
>
> **Secrets rule:** no document in this pack contains real secret values. Every credential is referred to
> by its environment-variable **name** only (e.g. `AGORA_APP_CERTIFICATE`). Actual values are delivered
> **separately via a secure vault share** (see [transfer-checklist.md](./transfer-checklist.md)).

---

## 1. What Haka Live is

Haka Live is a **social audio/video live-streaming platform** (think "live rooms" with seats, gifting, a
virtual-coin economy, agencies/hosts, PK battles, and direct messaging). It targets mobile users first
(Android Play Store launch), with a web marketing/legal site and an internal admin console.

Core product concepts:

- **Live rooms** powered by **Agora** (audio + optional face-cam). Users join as listeners or take mic seats.
- **Coin / bean economy** — users buy coins (Stripe / Razorpay / Google Pay), send virtual **gifts**, hosts
  earn **beans**, agencies take commission, and beans are withdrawn as real money.
- **Roles** — `normal_user → host → agent → coin_seller` (forward-only). See [../../user_role.md](../../user_role.md).
- **Agencies / hosts / payroll** — hosts belong to agencies; commission splits and payroll are computed server-side.
- **Moderation** — bans, device bans, reports, audit logs, admin staff hierarchy.

## 2. The four apps (monorepo)

| App | Path | Tech | What it is |
|---|---|---|---|
| Mobile | `apps/mobile` | Expo 54 / React Native 0.81 (RN Firebase, Agora, Supabase) | The user-facing Android/iOS app. Package `com.hakalive.app`. |
| Backend | `apps/backend` | Node 20, Express + TypeScript, Prisma, PostgreSQL, Redis, Socket.io | REST API at `/api/v1`, realtime sockets, BullMQ/cron workers, Agora token minting. |
| Admin | `apps/admin` | Vue 3 + Vite | Internal staff console. **Compiled into the backend Docker image** and served by the backend at `/admin` (no separate service required). |
| Web | `apps/web` | Vue 3 + Vite | Public marketing + legal site (`/privacy-policy`, `/terms`, `/community-guidelines`). Hosts the Play-Store-required compliance pages and app-link association files. |
| Shared types | `packages/shared-types` | TypeScript | Types shared across apps. |

Production endpoints (verify against DNS at handover):

- API: `https://api.hakalive.com/api/v1` — admin console at `https://api.hakalive.com/admin`
- Web: `https://hakalive.com` (invite/app-link host; also `www.hakalive.com`)

## 3. Documents in this pack

| Doc | Read it when you need to… |
|---|---|
| [architecture.md](./architecture.md) | Understand how the pieces fit: request/socket flows, auth (JWT + OTP), Agora data flow, payments, push, storage. |
| [deployment-and-recovery.md](./deployment-and-recovery.md) | **The critical doc.** Local dev from a clean machine, production deploy, mobile release, **disaster recovery on brand-new accounts**, and rollbacks. |
| [database.md](./database.md) | Understand the schema, run migrations, and **back up / restore** the database. |
| [signing-and-play-store.md](./signing-and-play-store.md) | Manage Android signing (EAS-managed keystore), Play App Signing, and the Play listing/compliance inputs. |
| [agora.md](./agora.md) | Understand exactly how RTC tokens are minted, what breaks on certificate rotation, and how to transfer the Agora account. |
| [transfer-checklist.md](./transfer-checklist.md) | Transfer every external console and rotate every secret at handover. |
| [credentials-inventory.md](./credentials-inventory.md) | See every environment variable / credential by name, where it lives in prod, and its blast radius. |

## 4. Pre-existing docs worth reading (not part of this pack but relevant)

| Doc | Contents |
|---|---|
| [../production-stack.md](../production-stack.md) | Production hosting stack + monthly cost model. **Note:** its OTP section is partly stale — see discrepancy note below. |
| [../versioning-and-maintenance.md](../versioning-and-maintenance.md) | Release/version-bump workflow, hotfix protocol, monitoring thresholds. **Note:** its OTA section assumes `expo-updates`, which is not currently installed — see discrepancy note. |
| [../../user_role.md](../../user_role.md) | The full role capability matrix. |
| [../deploy/payment-encryption-key.md](../deploy/payment-encryption-key.md) | How to generate/set `PAYMENT_ENCRYPTION_KEY` on Render. |
| [../deploy/supabase-storage-buckets.md](../deploy/supabase-storage-buckets.md) | Exact Supabase Storage buckets the backend expects. |
| [../deploy/invite-universal-links/README.md](../deploy/invite-universal-links/README.md) | iOS AASA + Android assetlinks for `hakalive.com/invite` deep links. |
| [../../README.md](../../README.md) | Quick-start dev setup. |
| [../../TEST_CREDENTIALS.md](../../TEST_CREDENTIALS.md) | Dev/test logins. **Contains plaintext dev passwords — must be rotated/removed at handover.** |
| `docs/superpowers/plans/` & `specs/` | Per-feature design docs (gifting commission, PK battle, payroll, agency invitations, etc.). |

## 5. Important discrepancies found during this audit (read before trusting older docs)

These were verified directly against the code on 2026-06-05. Where an older doc disagrees with the code, the **code wins**.

1. **`.env.example` is stale vs the real backend env schema** (`apps/backend/src/config/env.ts`).
   The committed root `.env.example` lists `JWT_SECRET`, `FCM_SERVER_KEY`, and `CORS_ALLOWED_ORIGINS`, but the
   backend actually validates **`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`**
   (Firebase Admin SDK, not a legacy FCM server key), and **`CORS_ORIGIN`**. Use the variable names in
   [credentials-inventory.md](./credentials-inventory.md), which were derived from `env.ts`, not from `.env.example`.

2. **Phone OTP has been migrated to a self-owned Meta WhatsApp Cloud API** (`apps/backend/src/modules/whatsapp-otp/`),
   with codes bcrypt-hashed in the `PhoneOtp` table. The Supabase-Auth → Twilio OTP path described in
   `production-stack.md` still partially exists (the `POST /api/v1/auth/supabase` exchange remains, used for
   Google/Apple sign-in and older phone flows), but **new phone OTP runs on the `WHATSAPP_*` env vars**, not Twilio.
   Twilio may therefore be decommissionable — confirm with the owner which path is live in production.

3. **OTA updates are not currently wired up.** `versioning-and-maintenance.md` documents `eas update` for JS-only
   hotfixes, but **`expo-updates` is not a dependency** in `apps/mobile/package.json`. Until `expo-updates` is added
   and configured, **every release must go through a full store build**. See [deployment-and-recovery.md](./deployment-and-recovery.md) §Rollback.

4. **Production hosting model needs owner confirmation.** The repo contains both a self-host
   `docker-compose.yml` (Postgres + Redis + backend + Nginx) and a Render-oriented build (`npm run build` / `npm start`,
   plus admin-dist path comments referencing "Render native: cwd is apps/backend"). Whether Render runs the Docker
   image or a native Node build is marked `TODO(owner): confirm` in [deployment-and-recovery.md](./deployment-and-recovery.md).

5. **Self-service account deletion endpoint is not yet in the repo.** Google Play requires an in-app and/or web
   account-deletion path. The web app has `/privacy-policy`, `/terms`, `/community-guidelines` but **no `/delete-account`**.
   This is flagged as remaining feature work in [signing-and-play-store.md](./signing-and-play-store.md) and `PLAN-handover.md`.

## 6. Handover completeness checklist

Maps the client's requested deliverables to where each is satisfied. Items marked **(owner action)** cannot live in
the repo — they are console operations the new owner must perform.

| Requested item | Where it lives | Status |
|---|---|---|
| System architecture | [architecture.md](./architecture.md) | In pack |
| Local build from clean machine | [deployment-and-recovery.md](./deployment-and-recovery.md) §A | In pack |
| Production deploy procedure | [deployment-and-recovery.md](./deployment-and-recovery.md) §B | In pack |
| Mobile release / Play submission | [deployment-and-recovery.md](./deployment-and-recovery.md) §C + [signing-and-play-store.md](./signing-and-play-store.md) | In pack |
| Disaster recovery (new accounts) | [deployment-and-recovery.md](./deployment-and-recovery.md) §D | In pack |
| Rollback procedures | [deployment-and-recovery.md](./deployment-and-recovery.md) §E | In pack |
| Database schema overview | [database.md](./database.md) | In pack |
| DB backup & restore | [database.md](./database.md) §Backup/Restore | In pack |
| Android signing explained | [signing-and-play-store.md](./signing-and-play-store.md) | In pack |
| Agora token internals | [agora.md](./agora.md) | In pack |
| External console transfer | [transfer-checklist.md](./transfer-checklist.md) | In pack |
| Credentials inventory | [credentials-inventory.md](./credentials-inventory.md) | In pack |
| Latest production AAB | `eas build --profile production -p android` | **(owner action)** |
| All console ownership transfers (Play, Expo, Firebase, Render, Supabase, Agora, etc.) | [transfer-checklist.md](./transfer-checklist.md) | **(owner action)** |
| Secure secret/vault share | [transfer-checklist.md](./transfer-checklist.md) §Secure transfer | **(owner action)** |
| Rotate seeded admin password + `TEST_CREDENTIALS.md` passwords + all API secrets | [transfer-checklist.md](./transfer-checklist.md) §Rotate at handover | **(owner action)** |
| Play feature graphic 1024×500 + screenshots | Play Console asset upload | **(owner action)** |
| Privacy policy / account-deletion URLs + Data Safety form | [signing-and-play-store.md](./signing-and-play-store.md) §Play listing | **(owner action; account-deletion page is remaining feature work)** |
| IP/ownership legal letter | Out of scope of repo | **(owner/legal action)** |

---

_Last verified against the codebase: 2026-06-05._
