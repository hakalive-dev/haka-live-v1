# Haka Live — Versioning & Maintenance Guide

Solo developer reference for managing releases, hotfixes, and ongoing maintenance across the Play Store, App Store, and backend.

---

## Version Number Convention

Use **Semantic Versioning**: `MAJOR.MINOR.PATCH`

| Change type | Bump | Example | Trigger |
|---|---|---|---|
| Crash fix, bug fix | PATCH | 1.0.0 → 1.0.1 | No new features, no API changes |
| New feature shipped | MINOR | 1.0.1 → 1.1.0 | New screen, new capability |
| Breaking redesign or auth overhaul | MAJOR | 1.1.0 → 2.0.0 | Full rebuild, incompatible API break |

### Two Numbers to Manage — `app.json`

```json
{
  "version": "1.0.1",
  "android": {
    "versionCode": 3
  },
  "ios": {
    "buildNumber": "3"
  }
}
```

| Field | What it is | Rule |
|---|---|---|
| `version` | Human-readable string shown in store | Follows semver |
| `versionCode` | Android integer | Must increase on every upload, no exceptions |
| `buildNumber` | iOS string (treat as integer) | Must increase on every upload, no exceptions |

**Simple rule:** keep `versionCode` / `buildNumber` equal to your total release count (1, 2, 3…). Never reuse or skip.

---

## Release Workflow

### Bug Fix (Patch Release)

```
fix branch → merge to main → bump version (patch) → bump versionCode → build → submit
```

1. Create branch: `git checkout -b fix/crash-on-gift-send`
2. Fix the issue
3. Merge to `main`
4. Bump `version` (e.g. `1.0.0` → `1.0.1`) and increment `versionCode`/`buildNumber`
5. Build: `eas build --platform android --profile production`
6. Submit to Play Console → **Closed Testing** first, then **Production rollout at 20%**
7. Monitor Crashlytics for 24h → promote to 100%

### Feature Release (Minor Release)

```
feat branch → merge to main → bump version (minor) → bump versionCode → build → submit
```

Same steps as above, with two additions:
- Reset patch to 0 (e.g. `1.0.3` → `1.1.0`)
- Write store release notes before submitting (both stores require this)
- Roll out at 20% → wait 24–48h → go to 100%

### Major Release

Same as minor but:
- Coordinate backend deployment before mobile goes live
- If the API has breaking changes, the new backend must be live first
- Consider a **forced update** prompt in-app for users still on the old version

---

## Hotfix Protocol (Production Crash)

**Goal: ship a fix as fast as possible.**

### Option A — OTA Update (JS-only fix, fastest)

Use this when the fix is **pure JavaScript** — no new native modules, no native config changes.

```bash
eas update --branch production --message "fix: crash on gift send"
```

- No store review required
- Users get the fix on next app launch
- Applies to all users on the same runtime version automatically

**Use OTA for:** logic bugs, UI glitches, API call fixes, text/copy changes.  
**Do NOT use OTA for:** adding a new npm package with native code, changing `app.json`, changing permissions.

### Option B — Full Store Build (native change required)

```bash
# 1. Fix the code
# 2. Bump versionCode/buildNumber
eas build --platform android --profile production --local
# 3. Submit via EAS or Play Console upload
eas submit --platform android
```

Google: typically 4–24h review.  
Apple: typically 24–48h review (use "Expedited Review" for critical crashes).

---

## Backend + Mobile Compatibility

Backend and mobile are versioned independently. Follow this rule:

| API change type | Safe? | Action required |
|---|---|---|
| New endpoint added | ✅ Safe | No mobile release needed |
| New optional field added to response | ✅ Safe | No mobile release needed |
| Field renamed or removed | ❌ Breaking | Deploy backend + ship mobile update together |
| Auth flow changed | ❌ Breaking | Coordinate and test end-to-end before releasing |

### Deployment Order for Breaking Changes

1. Deploy new backend (keep old field/endpoint alive if possible during transition)
2. Submit mobile update to stores
3. Once mobile update reaches 100% rollout, remove deprecated backend fields

### App Version Header (Recommended)

Add this to the Axios client (`apps/mobile/src/api/client.ts`) so the backend can detect old clients:

```ts
headers: {
  'X-App-Version': Constants.expoConfig?.version ?? '0.0.0',
}
```

The backend can then reject or warn clients below a minimum supported version.

---

## Store Submission Checklist

Run this before every build submitted to a store:

- [ ] `npm run type-check` — zero TypeScript errors
- [ ] `npm test` — all backend tests pass
- [ ] `version` bumped in `app.json`
- [ ] `versionCode` and `buildNumber` incremented
- [ ] Release notes written (required by both stores)
- [ ] Backend migrations deployed (if schema changed)
- [ ] EAS build completes without errors locally before submitting
- [ ] Tested on a physical device or emulator against the production API
- [ ] Firebase Crashlytics is active and receiving events

---

## Branch & Git Strategy

Keep it simple for a solo project:

```
main              ← production-ready, always deployable
feat/feature-name ← feature work
fix/bug-name      ← bug fixes
```

Tag every production release:

```bash
git tag v1.0.1
git push origin v1.0.1
```

This lets you `git checkout v1.0.1` to reproduce any past release exactly.

---

## Monitoring After Release

| Tool | What to watch | Action threshold |
|---|---|---|
| Firebase Crashlytics | Crash-free sessions rate | < 99.5% → investigate immediately |
| Play Console | ANR rate | > 0.47% → Google may demote your listing |
| App Store Connect | Crash rate | Spike → submit hotfix |
| Backend logs (Render) | 5xx error rate | Any spike post-deploy → check migration or new code |

Check these within the first hour after every release, then again at 24h.

---

## EAS Build Profiles (Reference)

Defined in `apps/mobile/eas.json`:

| Profile | Use for | Output |
|---|---|---|
| `development` | Local dev with debugging | Dev client APK |
| `preview` | Internal testing, QA | Release APK (internal distribution) |
| `production` | Store submission | Signed release APK / IPA |

```bash
# Build for internal testing
eas build --platform android --profile preview

# Build for store submission
eas build --platform android --profile production

# OTA update to production users (JS-only)
eas update --branch production --message "fix: ..."

# Submit to Play Store
eas submit --platform android --latest
```

---

## Version History Log

Maintain a short log here as releases go out:

| Version | versionCode | Date | Type | Summary |
|---|---|---|---|---|
| 1.0.0 | 1 | — | Major | Initial launch |

> Update this table with every release.
