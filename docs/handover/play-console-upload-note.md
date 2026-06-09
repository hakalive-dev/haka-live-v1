# Haka Live — Developer handover for Play Console upload

Hi team — here are the technical build files and details from the development side so you can upload and
publish the Haka Live Android app on your Play Console, and ship future updates independently.

## What I'm providing (development side)
- **AAB file:** `haka-live-1.0.0.aab` (attached / download link).
- **Application ID (package name):** `com.hakalive.app`
- **Version Code:** `1`  ·  **Version Name:** `1.0.0`
- **R8/ProGuard mapping file:** `mapping.txt` (attached) — upload with the release so crash reports are readable.
- **App icon (512×512):** attached (from the app source).
- **Compliance URLs** (for App Content / Data Safety):
  - Privacy Policy: https://www.hakalive.com/privacy-policy
  - Account Deletion: https://www.hakalive.com/delete-account
  - Terms & Conditions: https://www.hakalive.com/terms
  - Community Guidelines: https://www.hakalive.com/community-guidelines
- **Admin panel:** https://api.hakalive.com/admin (credentials sent separately/securely).
- **Reviewer note:** Haka Live is a social audio/video live-streaming platform (live rooms, chat,
  virtual gifting). Account deletion is available in-app (Settings → Account and security → Cancel
  Account) and on the web at the URL above.

## App signing (needed for every future update)
The app is built with Expo/EAS managed signing. **We'll transfer the Expo (EAS) project to your Expo
organisation** — the upload key travels with it, so you build and upload future versions yourselves with
no key files to handle. To start the transfer, please send me the **name of your Expo organisation**
(create one free at expo.dev if you don't have it yet) and I'll initiate the project transfer.

On your first upload, Google auto-enrols **Play App Signing** and generates the app signing key on your
side; the EAS-held key is the **upload key** used to sign future builds.

## What you'll need to add (business/store side)
These are store-listing items the Play Console requires that I (as developer) don't produce:
- **Feature graphic (1024×500)**
- **Screenshots** (phone, and tablet if you support it)
- **Short + full store description**
- **Data Safety form + content rating** answers
- **Test user login** for Google's reviewers (the app is behind sign-in) — I can create a dedicated
  review account if you tell me you need one.

Let me know your preferred signing option and I'll get it set up.
