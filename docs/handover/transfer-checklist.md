# Haka Live — Ownership Transfer Checklist

Every external console/account that controls part of the Haka Live ecosystem, how to transfer it, and how to verify
the transfer worked. **Do not email any secret** — see §3.

## 1. External consoles to transfer

| Console / account | Controls | Transfer mechanism | Post-transfer verification |
|---|---|---|---|
| **GitHub repo** | All source code, the keep-warm Action, deploy config | Transfer repo to client org, or add client as **admin** then change repo owner. Move Actions secrets/variables (`BACKEND_HEALTH_URL`). | Client can clone, push, and the keep-warm workflow still runs (Actions tab → manual "Run workflow"). |
| **Expo / EAS** | Mobile builds + **Android keystore (upload key)** | Transfer the Expo **project** (`a77ae84c-…`, owner `testing-of-dev`) to the client's Expo org (preferred), or hand over + rotate the account. See [signing-and-play-store.md](./signing-and-play-store.md) §3. | `eas whoami` = new owner; `eas build --profile production -p android` succeeds (proves keystore access). |
| **Google Play Console** | Store listing, releases, **Play App Signing key** | Play Console → Users & permissions → invite client as **Admin/Owner**; or use Play's account transfer process for full ownership. | Client sees the app, can create a release, App Signing shows enrolled. |
| **Firebase** | FCM push + Crashlytics + `google-services.json` | Firebase/Google Cloud project IAM: grant client **Owner**; ideally transfer the underlying GCP project's billing/ownership. | Client can view Crashlytics, download config, manage service accounts. |
| **Google Cloud (GCP)** | Backs the Firebase project + Google Pay / Google Sign-In OAuth | IAM → grant **Owner**; transfer billing account. | Client is Owner; OAuth consent screen + credentials visible. |
| **Supabase org** | Postgres DB, Auth, Storage, DB backups | Supabase → Organization → invite client; for full ownership, **transfer the project to the client's org** (Supabase org transfer). | Client can see the project, connection strings, Storage buckets, and backup settings. |
| **Render team** | Backend API + Redis hosting, env vars, deploy history | Render → Team → invite client as **Admin**; or transfer services to the client's Render team/workspace. | Client can view services, env vars, roll back deploys; `GET /health` still 200. |
| **Agora** | RTC App ID + App Certificate, NCS, spend | Invite client to the Agora project/account; full ownership via Agora support. See [agora.md](./agora.md) §6. | Client can reveal/regenerate the certificate and set a spend alert. |
| **Twilio** | Legacy SMS/WhatsApp OTP (may be deprecated — see [HANDOVER.md](./HANDOVER.md) §5) | Twilio Console → transfer sub-account / change ownership; or decommission if WhatsApp Cloud API replaced it. | Confirm whether Twilio is still in the live OTP path before transferring vs closing. |
| **Meta Business / WhatsApp Cloud API** | Current phone-OTP delivery (`WHATSAPP_*`) | Meta Business Manager → add client as admin / transfer business asset (WhatsApp number + app). | Client can mint a new access token and the OTP template (`haka_otp`) is approved/visible. |
| **Stripe** | Coin top-up payments + payouts | Stripe Dashboard → Team → invite as **Admin**; for legal ownership use Stripe's account transfer/ownership-change. | Client sees live keys, webhook endpoints, and balance. |
| **Razorpay** | India coin top-up payments | Razorpay Dashboard → add user / change account owner. | Client sees keys + webhook config. |
| **AWS** | S3 storage + Rekognition face verification | IAM: create client admin user / transfer account ownership; rotate the access keys (`AWS_ACCESS_KEY_ID`/`SECRET`). | Client can access the S3 bucket + Rekognition collection (`npm run rekognition:check`). |
| **Domain registrar + DNS** (`hakalive.com`) | API + web hostnames, app-link `.well-known` files | Registrar account transfer (auth/EPP code) **and** DNS zone control. | `dig`/`nslookup` resolve to client-controlled records; `.well-known` AASA + assetlinks reachable over HTTPS. |
| **Gmail / SMTP sending account** | Transactional email (`EMAIL_*`) | Hand over the mailbox/Workspace account; rotate the **app password**. | A test email sends from `DEFAULT_FROM_EMAIL`. |
| **Apple Developer** (if iOS) | App Store distribution + bundle id | Apple → App Store Connect users / account holder transfer. | Client can create iOS builds/releases. |

## 2. Rotate at handover (mandatory — the original team has seen all of these)

Rotate **after** access is transferred and **before** go-live:

- **Seeded super-admin password** — `ADMIN_INITIAL_PASSWORD` (and `ADMIN_INITIAL_EMAIL` if changing the admin). The
  default seed value (`admin@hakalive.com` / a known dev password) is documented in `TEST_CREDENTIALS.md` and the seed
  script — **change it in Render env and reset the existing `AdminUser` password.**
- **Everything in [../../TEST_CREDENTIALS.md](../../TEST_CREDENTIALS.md)** — all dev/test plaintext passwords
  (`admin1234`, `haka2024`, `agent123`, `seller123`, etc.). These exist only in dev seeds; ensure no such accounts
  exist in production, and delete/ignore the file's values for prod. **The file itself should be removed or sanitized
  before the repo is handed over.**
- **App secrets:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_JWT_SECRET` (rotating these logs everyone out —
  do it at a low-traffic window; access tokens die in 15m, refresh tokens are invalidated).
- **`PAYMENT_ENCRYPTION_KEY`** — ⚠️ rotating this **breaks existing encrypted payout rows**. Only rotate with a
  decrypt-old/encrypt-new migration, or keep the original and just restrict who knows it.
- **All third-party API secrets:** `AGORA_APP_CERTIFICATE`, `STRIPE_SECRET_KEY` + webhook secret, `RAZORPAY_*`,
  `AWS_ACCESS_KEY_ID`/`SECRET`, `WHATSAPP_ACCESS_TOKEN`, `FIREBASE_PRIVATE_KEY` (regenerate the service-account key),
  `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_HOST_PASSWORD`, `AGORA_NCS_SECRET`.
- **CI / Expo / EAS tokens** that could sign builds or deploy.

After rotation, redeploy the backend and confirm a clean boot + smoke test (see
[deployment-and-recovery.md](./deployment-and-recovery.md) §D step 14).

## 3. Secure-transfer rule

- Deliver all secret **values** through a **vault / password manager share** (e.g. 1Password/Bitwarden shared vault,
  or a one-time secret link). **Never email, Slack, or commit secrets.**
- This handover pack contains **names only**; pair it with the vault entries of the same names.
- After the client confirms receipt and has rotated the critical secrets, the original team should **revoke its own
  access** to every console above and confirm revocation.

## 4. Handover deliverables to hand the client (fill in / attach at handover)

These three were explicitly requested by the client. Values/files are **not committed to git** — deliver them via
the secure vault share (§3) or as attachments. Tick each off as delivered.

| # | Deliverable | What to deliver | How to produce / obtain | Delivery channel | Status |
|---|---|---|---|---|---|
| 1 | **Admin / super-admin credentials** | Super-admin **email + password** for `https://api.hakalive.com/admin`, plus a note that it is the `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` account. | **Rotate first** (see §2), then capture the new value. Reset the existing `AdminUser` password and set `ADMIN_INITIAL_PASSWORD` in Render env. Do **not** hand over the old dev seed (`admin@hakalive.com` / dev password). | Vault share (1Password/Bitwarden), never email | ☐ rotated ☐ delivered |
| 2 | **Actual database backup file** | A fresh full dump of the production Postgres DB, e.g. `hakalive-prod-YYYYMMDD.dump`, plus the restore command. | Run against the **direct** URL, not the pooler: `pg_dump "$DIRECT_URL" -Fc -f hakalive-prod-$(date +%Y%m%d).dump`. Restore: `pg_restore --clean --if-exists -d "$DIRECT_URL" <file>`. Full procedure in [database.md](./database.md) §5. Supabase Pro also has daily automated backups — point the client to Dashboard → Database → Backups. | Encrypted file transfer / vault (the dump contains personal data — treat as **critical**) | ☐ produced ☐ delivered |
| 3 | **Ownership / IP confirmation** | The signed ownership & IP transfer letter. | Fill in and sign [ownership-and-ip-confirmation.md](./ownership-and-ip-confirmation.md) (export to PDF, authorised signatory). | Signed PDF alongside the handover pack | ☐ filled ☐ signed ☐ delivered |
