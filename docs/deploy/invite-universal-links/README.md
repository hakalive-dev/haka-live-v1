# Universal links for invite URLs (`https://hakalive.app/invite?code=…`)

The mobile app is configured to open from **HTTPS** invite links on `hakalive.app` / `www.hakalive.app` (iOS **Associated Domains** + Android **App Links**). In-app handling stores `code` and calls `POST /invites/accept` after login (see `useInviteLinkCapture` / `usePendingInviteAccept` in the app).

## 1. Apple App Site Association (AASA)

Host this file at **both** URLs (no redirects from HTTP → HTTPS on the first request; use HTTPS directly):

- `https://hakalive.app/.well-known/apple-app-site-association`
- `https://www.hakalive.app/.well-known/apple-app-site-association` (if you use `www`)

Requirements:

- **Content-Type:** `application/json` (recommended) or `application/pkcs7-mime`
- **Body:** valid JSON (see `apple-app-site-association` in this folder)
- Replace `YOUR_APPLE_TEAM_ID` with your 10-character [Apple Team ID](https://developer.apple.com/help/account/manage-your-team/locate-your-team-id/) (Membership page)
- **App ID** in Apple Developer → Identifiers → `com.hakalive.app` → enable **Associated Domains**
- Xcode / EAS: entitlements already include `applinks:hakalive.app` and `applinks:www.hakalive.app` (`HakaLive.entitlements` + `app.json`)

## 2. Android Digital Asset Links

Host at:

- `https://hakalive.app/.well-known/assetlinks.json`
- `https://www.hakalive.app/.well-known/assetlinks.json` (if applicable)

Replace `REPLACE_WITH_RELEASE_SHA256` with the **SHA-256** of the **signing certificate** used for Play Store / production builds:

```bash
# Upload key or app signing key from Play Console, or local release keystore:
keytool -list -v -keystore your-release.keystore -alias your-alias
```

Use the **SHA256** line (colon-separated hex). You can list multiple fingerprints (debug + release) as a JSON array.

After deploy, verify:

```bash
curl -sS 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://hakalive.app&relation=delegate_permission/common.handle_all_urls'
```

## 3. Example static hosting (nginx)

```nginx
location = /.well-known/apple-app-site-association {
    default_type application/json;
    add_header Content-Type application/json;
    alias /var/www/hakalive/.well-known/apple-app-site-association;
}

location = /.well-known/assetlinks.json {
    default_type application/json;
    add_header Content-Type application/json;
    alias /var/www/hakalive/.well-known/assetlinks.json;
}
```

## 4. Optional web fallback

If the app is not installed, serve a minimal `/invite` HTML page that explains “Download Haka Live” with store links. Universal links still work when the app is installed.

## 5. Repo app config (already done)

- `apps/mobile/app.json` — `ios.associatedDomains`, `android.intentFilters`
- `apps/mobile/ios/HakaLive/HakaLive.entitlements` — Associated Domains
- `apps/mobile/android/app/src/main/AndroidManifest.xml` — `intent-filter` with `android:autoVerify="true"` for `https://…/invite`

After changing native files, rebuild iOS/Android (EAS or local `expo run:ios` / `expo run:android`).
