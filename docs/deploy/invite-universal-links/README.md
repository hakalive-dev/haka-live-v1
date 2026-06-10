# Universal links for invite URLs (`https://hakalive.com/invite?code=…`)

The mobile app is configured to open from **HTTPS** invite links on `hakalive.com` / `www.hakalive.com` (iOS **Associated Domains** + Android **App Links**). In-app handling stores `code` and calls `POST /invites/accept` after login (see `usePendingInviteAccept` in the app).

> **Domain note:** these links use `hakalive.com` (the live marketing site on Render — see `apps/web`). The earlier `hakalive.app` domain was never registered/served and is what caused the Play Console "domains not verified / deep links not working" warnings.

## Where the files are hosted (this repo)

The association files are served by the **`apps/web`** Vite site (deployed to `hakalive.com`):

- `apps/web/public/.well-known/assetlinks.json`              → `https://hakalive.com/.well-known/assetlinks.json`
- `apps/web/public/.well-known/apple-app-site-association`   → `https://hakalive.com/.well-known/apple-app-site-association`

`apps/web/public/_redirects` has a passthrough rule **before** the SPA catch-all so these are served as real files (not the `index.html` shell):

```
/.well-known/*    /.well-known/:splat   200
/*                /index.html           200
```

## 1. Android Digital Asset Links (`assetlinks.json`)

`sha256_cert_fingerprints` MUST contain the SHA-256 of the cert that signs the **installed** APK.

- With **Play App Signing** (this app uses it), Google re-signs the app, so the **Play App Signing key** SHA-256 is required. Get it from **Play Console → Test and release → App integrity → App signing → "App signing key certificate" → SHA-256**. (That page also shows a ready-made Digital Asset Links JSON snippet.)
- The **EAS upload key** SHA-256 is `1C:16:A9:BA:15:6C:6E:E2:DF:74:F3:D0:25:06:8A:45:A2:BA:73:65:AE:4A:32:82:6A:0C:AD:78:F9:C9:5F:51` (from the EAS Android keystore for `com.hakalive.app`). Useful for direct-APK / internal testing; **not** sufficient for Play installs on its own.

Best practice: list **both** fingerprints. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `assetlinks.json` with the Play App Signing SHA-256.

Verify after deploy (Google's verifier):

```bash
curl -sS 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://hakalive.com&relation=delegate_permission/common.handle_all_urls'
```

## 2. Apple App Site Association (AASA)

- **Content-Type:** `application/json`, served at `https://hakalive.com/.well-known/apple-app-site-association` (no `.json` extension, no HTTP→HTTPS redirect on first request)
- Replace `YOUR_APPLE_TEAM_ID` with your 10-character [Apple Team ID](https://developer.apple.com/help/account/manage-your-team/locate-your-team-id/) (Membership page)
- Entitlements already include `applinks:hakalive.com` and `applinks:www.hakalive.com` (`HakaLive.entitlements` + `app.json`)

## 3. Optional web fallback

If the app is not installed, serve a minimal `/invite` page ("Download Haka Live" + store links). Universal links still work when the app is installed.

## 4. Repo app config (done)

- `apps/mobile/app.json` — `ios.associatedDomains`, `android.intentFilters` → `hakalive.com` / `www.hakalive.com`
- `apps/mobile/ios/HakaLive/HakaLive.entitlements` — Associated Domains → `.com`
- `apps/mobile/android/app/src/main/AndroidManifest.xml` — `intent-filter` `android:autoVerify="true"` for `https://hakalive.com/invite`

After changing native files, **rebuild and upload a new build** (EAS) so Play Console re-reads the manifest and re-runs verification.
