# Haka Live — Android Signing & Play Store

Verified against `eas.json`, `app.json` (root + `apps/mobile/app.json`) on 2026-06-05.

## 1. App identity

| Field | Value | Source |
|---|---|---|
| Android package | `com.hakalive.app` | `apps/mobile/app.json` → `android.package` |
| iOS bundle id | `com.hakalive.app` | `apps/mobile/app.json` → `ios.bundleIdentifier` |
| App name | `Haka Live` | `apps/mobile/app.json` → `name` |
| Current `version` | `1.0.0` | `apps/mobile/app.json` |
| Current `versionCode` | `1` | `apps/mobile/app.json` → `android.versionCode` |
| Expo project id | `a77ae84c-cca1-4769-8ddb-43047ba94951` | `app.json` / `apps/mobile/app.json` → `extra.eas.projectId` |
| Expo owner | `testing-of-dev` | `apps/mobile/app.json` → `owner` |
| Expo slug | `testing` | `apps/mobile/app.json` → `slug` |

> Note the Expo `owner`/`slug` are placeholder-ish (`testing-of-dev` / `testing`). They identify the Expo
> account/project that holds the keystore — they do **not** affect the store package name. `TODO(owner): decide
> whether to keep this Expo account or transfer/rename to a client-branded Expo org.`

## 2. EAS-managed keystore (there is NO local JKS)

Signing is **managed by EAS (Expo)**. There is **no keystore file in this repository** — EAS stores the Android
keystore, key alias, and passwords on Expo's servers and uses them automatically during
`eas build --profile production`. This means:

- You **cannot** sign a production build from this repo alone; you need access to the Expo account/project that owns
  the keystore.
- Losing access to that Expo account = losing the **upload key** (recoverable if Play App Signing is enrolled — see §4).

### Download / inspect the keystore and credentials

```bash
cd apps/mobile
eas login                       # log into the Expo account that owns project a77ea84c-...
eas credentials -p android      # interactive: view / download keystore, see alias + passwords
```

In that menu you can **download the keystore** (a `.jks`/`.keystore` file) and reveal the **keystore password, key
alias, and key password**. Store these in the vault. You can also print the signing fingerprints needed for the
`assetlinks.json` deep-link file (or use `keytool -list -v -keystore <downloaded>.jks -alias <alias>`).

## 3. Transferring the Expo project / account

Two options:

1. **Transfer the Expo project to a new Expo organization/account** (recommended for clean ownership): in
   [expo.dev](https://expo.dev) → the project → Settings → Transfer project to the client's Expo org. The keystore
   and EAS config travel with the project, so existing builds keep signing with the same key.
2. **Hand over the Expo account credentials** (less clean): give the client the `testing-of-dev` account login and
   rotate its password. Then have them create their own org and transfer the project into it.

After transfer, verify: `eas whoami` shows the new owner, `eas build:list` shows history, and a fresh
`eas build --profile production -p android` succeeds (proves keystore access carried over).

## 4. Play App Signing (upload key vs app signing key)

Google Play uses **Play App Signing**:

- The **app signing key** is held by Google. It signs the artifact actually delivered to devices. Users' updates must
  always be signed (ultimately) by this key — it never changes for the app's lifetime.
- The **upload key** is what you (EAS) sign uploads with. Google re-signs with the app signing key after verifying the
  upload key.
- **Why enrolling matters:** if your upload key (the EAS-managed keystore) is ever lost or compromised, Google can
  **reset the upload key** while keeping the app signing key — so users are unaffected and you recover. Without Play
  App Signing, losing the single signing key means you can never update the app again. **Confirm Play App Signing is
  enrolled** (Play Console → Setup → App signing) before launch; it is the default for new apps.

### On key compromise

1. Generate a new upload key (EAS can create one) and request an **upload key reset** in Play Console
   (Setup → App signing → Request upload key reset), uploading the new key's certificate.
2. Rotate the Expo account credentials and any CI tokens that could sign builds.
3. Audit Play Console + Expo for unauthorized members.
4. Continue shipping — the app signing key (and thus installed users) is unaffected.

## 5. versionCode / versionName management

- `version` (versionName) is semver in `apps/mobile/app.json`; bump per
  [../versioning-and-maintenance.md](../versioning-and-maintenance.md).
- `versionCode` must **strictly increase** on every Play upload. `eas.json` `production.autoIncrement: true` +
  `cli.appVersionSource: "remote"` means **EAS increments the build number remotely** — keep the human-readable
  `version` string updated yourself and let EAS manage the integer. Tag every release in git (`git tag vX.Y.Z`).

## 6. Play listing & compliance inputs (owner action)

These are entered in **Play Console**, not in the repo. Derive the data-safety answers from what the app actually
collects (verified from `apps/mobile/app.json` permissions/usage strings and backend modules):

| Listing item | Value / source |
|---|---|
| Privacy policy URL | `https://hakalive.com/privacy-policy` (page exists: `apps/web/src/views/legal/PrivacyPolicyView.vue`) |
| Terms URL | `https://hakalive.com/terms` |
| Community guidelines | `https://hakalive.com/community-guidelines` |
| **Account deletion URL** | **MISSING — Play requires this.** No `/delete-account` route exists in `apps/web/src/router` yet, and there is no self-service deletion endpoint in the backend. **Build before submission** (flagged in `PLAN-handover.md`). |
| Feature graphic 1024×500 + screenshots | Owner must produce/upload. |

### Data Safety form — what the app collects (from code)

| Data type | Why / evidence |
|---|---|
| **Phone number** | Phone OTP login (`whatsapp-otp` module; `User.phone`). |
| **Email** | Optional, from Google/Apple sign-in (`User.email`). |
| **Name / profile** | Display name, username, bio, avatar, country, city, gender, DOB (`accounts.controller` onboarding/profile). |
| **Photos / camera** | `CAMERA`, `READ_MEDIA_IMAGES`, image picker — room/DM photo sharing + **face verification** (camera; AWS Rekognition). Usage strings in `app.json`. |
| **Microphone / audio** | `RECORD_AUDIO`, foreground-service-microphone — live audio rooms (Agora). |
| **Audio files** | `READ_MEDIA_AUDIO`, Apple Music usage string — room background music. |
| **Approximate/precise location** | `expo-location` dependency + city-level leaderboard. Confirm exactly what is collected and disclose accordingly. |
| **Financial info / purchases** | Coin top-ups via Stripe/Razorpay/Google Pay; withdrawals (encrypted payout details). |
| **Device identifiers** | `X-Device-Id` / `UserDevice` for session/device management; FCM token for push. |
| **Crash data** | Firebase Crashlytics. |

Declare data **encrypted in transit** (HTTPS/WSS) and note that payout account details are **encrypted at rest**
(AES-256-GCM). Provide the account-deletion mechanism once built.
