# Haka Live — Agora Integration

Agora powers the live audio (and optional video/face-cam) rooms. Verified against the code on 2026-06-05.

## 1. Credentials

| Credential | Env var | Where used |
|---|---|---|
| App ID | `AGORA_APP_ID` | Backend (token minting) + returned to mobile in the token response |
| App Certificate | `AGORA_APP_CERTIFICATE` | Backend only (signs RTC tokens). **Never shipped to the client.** |
| NCS webhook secret | `AGORA_NCS_SECRET` | Backend, optional — HMAC verification of Agora lifecycle webhooks |

Provided separately via secure vault. The mobile SDK is `react-native-agora` (v4.x); the backend uses
`agora-access-token`.

## 2. How the backend mints RTC tokens (exact)

- **Config:** `apps/backend/src/config/agora.ts` reads `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` from env.
- **Service:** `apps/backend/src/modules/rooms/agora.service.ts`.
  - `generateRtcToken(channel, uid, role)` calls `RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channel,
    uid, agoraRole, privilegeExpireTs)`.
  - **Role mapping:** `'publisher' → RtcRole.PUBLISHER` (host/speaker), `'subscriber' → RtcRole.SUBSCRIBER` (listener).
  - **Expiry:** `TOKEN_EXPIRY_SECS = 24 * 60 * 60` → **24 hours** (`privilegeExpireTs = now + 24h`). The response
    includes `{ token, channel, uid, appId, expiresAt }`.
  - If `appId` or `appCertificate` is unset it throws a 503 (`Agora is not configured`).
  - **UID assignment:** `getOrAssignUid(userId, channel)` uses a Redis Lua script to atomically map each user to a
    **collision-free per-channel integer UID** (a per-channel counter in `agora:uid_ctr:<channel>` and a map
    `agora:uid_map:<channel>`, both with a 24h TTL). If Redis is unavailable it falls back to the deprecated
    `uidFromUuid` hash. `getMappedUid` / `getRtcUidMap` look up existing UIDs without assigning.
  - **Revocation:** `isChannelRevoked(channel)` checks the Redis key `agora:revoked:<channel>`; an admin foreclose or
    host ban sets that watermark so a banned room/host cannot mint fresh tokens.

- **Endpoint:** `GET /api/v1/rooms/:id/token?role=publisher|subscriber` →
  `apps/backend/src/modules/rooms/rooms.controller.ts` `getToken` (route in `rooms.routes.ts`, auth required).
  Logic:
  1. Load the room; reject if `status === 'ended'` (400) or the channel is revoked (403).
  2. If `role === 'publisher'`, reject when the user `isHostBanned` (403).
  3. `uid = getOrAssignUid(userId, room.agoraChannel)`; `result = generateRtcToken(room.agoraChannel, uid, role)`.
  4. Return `{ token, channel, uid, appId, expiresAt }`.

  The **channel name == `room.agoraChannel` == room id**.

## 3. How mobile consumes tokens

The mobile app (`react-native-agora`) requests `GET /api/v1/rooms/:id/token` with the appropriate `role`, then joins
the Agora channel using the returned `appId`, `channel`, `uid`, and `token`. Because tokens expire after 24h, a
long-lived session must **renew** the token (re-call the endpoint and `renewToken`) before `expiresAt`.

## 4. Lifecycle webhook (NCS)

`POST /api/v1/webhooks/agora` → `apps/backend/src/modules/rooms/agora.webhook.ts`. Agora posts channel events
(101 created, 102 destroyed, 103/105 join, 104/106 leave). The handler updates `Room.viewerCount`
(`increment`/`decrement`, floored at 0; sets 0 on channel-destroyed). When `AGORA_NCS_SECRET` is set, the request is
verified with `HMAC-SHA256(secret, rawBody)` against the `Agora-Signature` header — mismatches return 401. Configure
this webhook in the Agora console pointing at `https://api.hakalive.com/api/v1/webhooks/agora`.

## 5. What breaks when the App Certificate rotates

The App Certificate is the signing secret for **all** RTC tokens. If you rotate/regenerate it in the Agora console:

- Every **previously issued token becomes invalid**, but tokens are minted on demand (24h expiry) so impact is mostly
  forward-looking once the new value is deployed.
- You **must** update `AGORA_APP_CERTIFICATE` on the backend (Render env) and redeploy. Until then, `generateRtcToken`
  signs with the old certificate and Agora rejects joins (users can't enter rooms / get kicked on token renewal).
- The **App ID does not change** on certificate rotation, so no mobile rebuild is needed — only the backend env update.
- If you instead create a **brand-new Agora project**, both `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` change; the new
  App ID is returned by the token endpoint, so still no mobile rebuild is strictly required (mobile uses the `appId`
  from the token response), but re-test joins end-to-end.

## 6. Console transfer steps

1. In the Agora console, add the new owner to the **project/account** (Agora supports inviting members; full account
   ownership transfer may require Agora support — `TODO(owner): confirm with Agora support`).
2. Ensure the new owner can see `AGORA_APP_ID` and reveal/regenerate `AGORA_APP_CERTIFICATE`.
3. **Set a hard spend alert / budget** in the Agora dashboard before launch — Agora is the only unbounded cost line
   (see [../production-stack.md](../production-stack.md)).
4. Verify post-transfer: the new owner generates/reveals the certificate, sets it on the backend, redeploys, and
   confirms a user can join a room and that the NCS webhook still updates viewer counts.
