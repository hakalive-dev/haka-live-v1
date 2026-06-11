# Plan: Lucky Gifts — Backend

## Status (2026-06-11)
- **Done (all 9 build steps, implemented + tested):**
  1. Migration `20260611120000_lucky_gifts` (`lucky_gift_settings` + `lucky_gift_draws`, singleton seeded).
  2. Setting cache `modules/lucky-gifts/lucky-setting.ts`; admin GET/PATCH `/admin/lucky-gifts/setting` with TRP readout + house-edge validation + audit log.
  3. Draw engine `modules/lucky-gifts/lucky-draw.ts` (+ 9 unit tests).
  4. `sendGift` integration: reduced host bean pool via existing `distributeBeans` (totalBeanValue override — no fork), atomic `lucky_reward` credit, `LuckyGiftDraw` row, `luckyDraw` in the send response.
  5. `WS_EVENTS.LUCKY_REWARD` (both shared-types copies), post-commit sender+room emit, winners Redis stream + `GET /gifts/lucky/room/:roomId/winners`.
  6. Lucky Winners leaderboard: keys in `PERIODIC_KEYS`, `updateLuckyWinnerScore` via gift-side-effects queue, `GET /leaderboard/lucky` + `/lucky/me`.
  7. `GET /gifts/lucky/history` + `GET /gifts/history`.
  8. Admin `GET /admin/lucky-gifts/draws` + `/stats`.
  9. Tests: 9 unit + 6 integration (real test DB) green; all 108 pre-existing gift/leaderboard tests still pass; `tsc` clean.
- **Verified live:** integration tests run the real POST /gifts/send path against local docker Postgres (migration applied by jest global setup). Socket emits + Redis winners stream are static-checked only (ioredis-mock in tests).
- **Remaining (not in this plan's scope):** mobile UI (lucky result popup on `lucky.reward`, winners ticker, history screens), admin panel UI for the new endpoints, daily win-cap enforcement (schema field exists, deferred).

> Scope: **backend only** (UI not started). This plan defines schema, services, endpoints,
> real-time events, and admin management for Lucky Gifts, built on the existing gift/wallet stack.
>
> **Rev 2 (2026-06-11):** simplified from a multi-tier reward table to a binary **win / lose**
> draw, and added the **receiver benefit** rule (host earns only a small % on lucky gifts).
> Trigger reverted from "global mode, all gifts draw" to **the existing `Gift.category === 'lucky'`**
> (the Lucky tab of the gift overlay IS the set of Lucky Gifts — no new gift-type field).

## Context
Users send gifts in live rooms using coins (Google Play Billing → coin wallet). Some gifts are
**Lucky Gifts** — a probability-based game. When a user sends a Lucky Gift, the server runs an
instant draw against a predefined **win probability**:

- **Win** → the **sender** is credited a reward = `winMultiplier × coinCost` (coins), instantly,
  inside the same transaction.
- **Lose** → no sender reward.
- **Receiver (host)** — in both cases the host earns only a **small percentage of the gift value
  (up to 1.5%, admin-configurable)** instead of the normal bean share. The reduced host cut is
  what funds the sender prize budget; this is the standard lucky-gift economy.

Coins are deducted first, the outcome is server-authoritative, every draw is logged, and results
are announced in real time. Probability, multiplier, and receiver % are admin-configurable; the
admin panel surfaces the expected return (TRP) = `winProbability × winMultiplier`.

## What already exists (reuse — do NOT rebuild)
- **Coin debit + atomic gift tx**: `sendGift()` in `apps/backend/src/modules/gifts/gifts.service.ts:362` — risk check (`assertNoRiskBlock`), balance pre-check, `FOR UPDATE` wallet lock, coin debit + `WalletTransaction` (`reference:'gift_sent'`), `GiftTransaction` create, `distributeBeans()`, retry-on-serialization wrapper. ✅
- **Wallet**: `Wallet.coinBalance` / `WalletTransaction` (`schema.prisma:554`); credit helper `creditCoinsInTransaction` (`wallet.service.ts`). ✅
- **Gift catalog**: `Gift` model (`schema.prisma:587`) with `coinCost`, `category`, `isActive`, `animationType`, `svgaAsset`. ✅
- **Room real-time**: `emitRoomGiftAnimation` (`gifts.controller.ts:37`) → `io.to(roomId).emit('gift:received', …)` + Redis replay stream `room:{roomId}:gift_events`. ✅
- **Leaderboards / side-effects**: post-commit job queue + Redis `zincrby` (`leaderboard.service.ts`). ✅
- **Admin gift CRUD**: `apps/backend/src/modules/admin/gifts/*` (`requirePermission('gift.manage')`, Zod, `logAdminAction`). ✅
- **Admin config singleton pattern**: `GiftBonusSetting` (`id:'singleton'`, `updatedBy`) with in-memory cache + cache clear on mutation (`admin/commission-config/*`). ✅ — the model for the lucky setting.
- **Admin logs/stats**: `AuditLog` (`schema.prisma:1383`), `audit.service.ts`, `analytics.service.ts` groupBy aggregates. ✅
- **Notifications**: `notifyAccountAlert()` (in-app + FCM + socket). ✅

## MVP (Phase 1) — thinnest working loop
- **In:** existing `Gift.category === 'lucky'` **gating the draw** (no schema change on `Gift`);
  one global `LuckyGiftSetting`
  singleton (`enabled`, `winProbability`, `winMultiplier`, `receiverBenefitPercent` capped at 1.5,
  optional daily win cap); binary draw engine; win credited **inside** the `sendGift` tx
  (`reference:'lucky_reward'`); **reduced host beans** (receiver % of gift value) replacing the
  normal bean share for lucky gifts; `LuckyGiftDraw` log for every draw (unique on
  `giftTransactionId`); `lucky.reward` socket (sender result popup + room win announcements);
  admin setting GET/PATCH with **expected-return (TRP) %** readout; `GET /gifts/lucky/history`;
  house-edge `stats` aggregate; **Lucky Winners leaderboard** (ranked by total win value, see §4b).
  `GET /gifts` already returns `category`, which drives the Lucky tab — nothing to add.
- **Deferred:** per-gift probability/multiplier overrides, random multiplier ranges, progressive
  jackpot pool, RTP pool-based payout targeting, persisted "recent winners" Redis feed beyond the
  capped stream, per-user daily win cap enforcement, deep participation analytics.

## Enablement & triggering (who/what)  ← LUCKY TAB = LUCKY GIFTS (decided, Rev 2)
- **The draw runs only for gifts with `category === 'lucky'`** (use the existing
  `isLuckyGiftCategory()` helper from `shared-types/gifts`) AND `LuckyGiftSetting.enabled`
  (global kill-switch). Gifts in every other tab are completely unaffected — full bean share, no draw.
- The Lucky tab of the gift overlay IS the lucky-gift set: admins move a gift in/out of the game
  by setting its `category` via the existing gift CRUD. The server validates against the DB gift
  row — the client never decides.
- **Enable/configure:** admins with `gift.manage` — kill-switch, `winProbability`,
  `winMultiplier`, `receiverBenefitPercent`.
- **Send (and thus draw):** any user in a room (no special role) — same gates as a normal gift
  (`assertNoRiskBlock` freezeCoins/disableGifts, enough coins, gift `isActive`).
- **Economy (critical):** house margin = `1 − (winProbability × winMultiplier) − receiverBenefit`.
  Admin sees computed **expected return %**; validation rejects `winProbability × winMultiplier ≥ 1`.

## What's missing (build this)
1. ~~A way to mark lucky gifts~~ — already exists: `Gift.category = 'lucky'` (the Lucky tab).
2. Admin-configurable win probability / multiplier / receiver % (singleton setting).
3. A server-side binary draw engine.
4. Atomic win credit + reduced host-bean distribution inside the send transaction.
5. An immutable draw log (history + admin logs + stats).
6. Real-time result event + room win announcements.
7. User history + admin logs/stats endpoints.

---

## 1. Data model (Prisma migration)
- **`Gift`** — **no change.** The existing `category String` (`bag | hot | lucky | …`,
  `schema.prisma:596`) gates the draw and the reduced host cut: `category === 'lucky'` ⇔ shown on
  the Lucky tab ⇔ plays the lucky game. Admin CRUD already manages `category`.
- **`LuckyGiftSetting`** (singleton, `id:'singleton'` — the whole game config):
  - `enabled Boolean @default(false)` — global kill-switch.
  - `winProbability Decimal` — chance of a win per send, `0 ≤ p ≤ 1` (e.g. `0.20`).
  - `winMultiplier Decimal` — win payout = `round(coinCost × winMultiplier)` (e.g. `3.0`).
  - `receiverBenefitPercent Decimal` — host's cut of gift value on lucky gifts, **`0 ≤ x ≤ 1.5`**
    (percent, e.g. `1.5` → host beans = `round(coinCost × 0.015)`); replaces normal bean share.
  - `dailyUserWinCapCoins BigInt @default(0)` (0 = no cap) — payout safeguard (deferred enforcement).
  - `updatedBy`, `updatedAt`.
- **`LuckyGiftDraw`** (immutable result log — one row per lucky send, win or lose):
  - `id`, `giftTransactionId` (FK→GiftTransaction, **`@@unique`** for idempotency), `userId`
    (sender), `giftId`, `roomId String?`, `coinCost Int`, `isWin Boolean`,
    `rewardCoins Int @default(0)` (coins credited to sender; 0 on lose),
    `receiverBeans Int @default(0)` (reduced host cut actually credited),
    `winProbability Decimal` + `winMultiplier Decimal` (config snapshot at draw time), `createdAt`.
  - Indexes: `@@index([userId, createdAt])`, `@@index([giftId, createdAt])`, `@@index([roomId, createdAt])`.

## 2. Draw engine (pure, unit-testable)
- New `apps/backend/src/modules/lucky-gifts/lucky-draw.ts`:
  `runLuckyDraw(setting, coinCost, rng = Math.random)` → `{ isWin, rewardCoins, receiverBeans }`:
  - `isWin = rng() < winProbability`
  - `rewardCoins = isWin ? round(coinCost × winMultiplier) : 0`
  - `receiverBeans = round(coinCost × receiverBenefitPercent / 100)`
  - Inject `rng` for deterministic tests. **Server-authoritative** — client never influences it.
- **Config cache**: load the singleton into an in-memory cache (mirror `commission-config`);
  `clearLuckySettingCache()` on admin mutation. Hot path is DB-free.
- **Expected-return (TRP) helper**: `expectedReturn = winProbability × winMultiplier` — surfaced
  to admin and asserted `< 1.0` in validation + tests. Total payout ratio shown to admin =
  `expectedReturn + receiverBenefitPercent/100`.

### Example
Setting: `winProbability = 0.20`, `winMultiplier = 3.0`, `receiverBenefitPercent = 1.5`.
Lucky Box costs 100 coins → sender pays 100; host gets 1–2 beans (1.5%); 20% of the time the
sender wins 300 coins. Expected sender return = 60% (TRP), house margin ≈ 38.5%.

## 3. Send-a-Lucky-Gift flow (extend `sendGift`)
Inside the existing `sendGift` transaction, when `isLuckyGiftCategory(gift.category)` and the
cached `LuckyGiftSetting.enabled`:
1. Coin debit + `GiftTransaction` create — unchanged.
2. **Bean distribution override**: instead of the normal `distributeBeans()` amount, distribute
   `receiverBeans = round(coinCost × receiverBenefitPercent / 100)`. Reuse `distributeBeans()`
   with an overridden bean amount so agency splits / leaderboards / bean records stay consistent
   — verify its signature allows an amount override, otherwise add one (do not fork the logic).
3. `runLuckyDraw(cachedSetting, coinCost)`.
4. On win: credit the **sender's** wallet in the same `tx` + `WalletTransaction`
   (`reference:'lucky_reward'`).
5. Create the `LuckyGiftDraw` row for **every** draw, win or lose (unique on `giftTransactionId`
   → safe under the retry wrapper; a retried tx reuses the same id).
6. Return the draw result alongside the gift result.
- Gifts in any other tab (`category !== 'lucky'`) and lucky sends while `enabled === false` take
  the existing path untouched: full beans, no draw, no log.
- Coin references: cost stays `gift_sent`; win credit is `lucky_reward` (so
  `/wallet/transactions` surfaces both).
- Coins are deducted **before** the draw and both legs are **atomic** → "deduct first / instant
  credit / always logged" holds.

## 4. Real-time (sockets)
- Reuse `gift:received` room animation (unchanged).
- Add `WS_EVENTS.LUCKY_REWARD = 'lucky.reward'` (`shared-types/events.ts`), emitted **post-commit**:
  - to sender `io.to(user:${senderId})` → result popup (win **and** lose: `{ isWin, rewardCoins,
    giftId, coinCost }`) + balance-refresh hint (client refreshes balance; **do not** reuse
    `wallet:coins_received` — it triggers the purchase-success modal).
  - to room `io.to(roomId)` → **wins only** — room announcement / winners ticker.
- **Winners feed**: Redis stream `room:{roomId}:lucky_events` (wins only, capped + TTL), mirroring
  the gift replay buffer; `GET /gifts/lucky/room/:roomId/winners` reads recent entries.

## 4b. Lucky Winners ranking (leaderboard)
Ranked by **total value of wins** — Σ`rewardCoins` a user has won playing lucky gifts. Mirrors the
existing Gifters leaderboard exactly (`leaderboard.service.ts` Redis `zincrby` pattern):
- **Keys**: `KEYS.LUCKY_WINNERS_DAILY / _WEEKLY / _MONTHLY` added to `KEYS` and `PERIODIC_KEYS`
  (so the existing period-reset job clears them on schedule).
- **Score update**: `updateLuckyWinnerScore(userId, rewardCoins)` — pipeline `zincrby` across the
  three period keys, called **post-commit** (same job-queue hook as `updateGifterScore`), **wins
  only** (`rewardCoins > 0`). Losses and the host's receiver cut do not score.
- **Routes** (`leaderboard.routes.ts`): `GET /leaderboard/lucky` (period query param, paginated via
  the shared `getLeaderboard`) + `GET /leaderboard/lucky/me` (`getMyRank`).
- Sender's coin **spend** on lucky gifts still feeds Gifters/Rich as normal — this board ranks
  winnings only, so the two boards stay independent.

## 5. User history & records (endpoints)
- `GET /gifts/lucky/history` — sender's draws (gift name, cost, win/lose, reward, date) from
  `LuckyGiftDraw`, paginated.
- `GET /gifts/history` — paginated **sent** gift history (sender, receiver, coins, date). NOTE:
  only a "received gallery" exists today (`gifts.routes.ts`) — add one (covers normal + lucky).
- **Coin transaction history**: already covered by `GET /wallet/transactions` (now includes `lucky_reward`).
- **Earnings history (hosts)**: existing `/wallet/bean-records` covers it — lucky gifts simply
  show the smaller bean amounts.

## 6. Admin management
- **Mark lucky / catalog**: nothing new — admins set `category: 'lucky'` via the existing
  `admin/gifts` CRUD; enable/disable via existing `Gift.isActive`.
- **New module `admin/lucky-gifts`** (mirror `admin/commission-config`):
  - `GET/PATCH /admin/lucky-gifts/setting` — the singleton. Zod: `0 ≤ winProbability ≤ 1`,
    `winMultiplier ≥ 0`, `0 ≤ receiverBenefitPercent ≤ 1.5`, and reject
    `winProbability × winMultiplier ≥ 1`. Response includes computed **expected-return (TRP) %**
    and total payout ratio. `clearLuckySettingCache()` + `logAdminAction` on every mutation.
  - `GET /admin/lucky-gifts/draws` — draw log (filters: gift, user, room, win/lose, date;
    paginated) from `LuckyGiftDraw`.
  - `GET /admin/lucky-gifts/stats` — participation + observed win-rate + total paid out + **house
    edge** (groupBy aggregates, analytics pattern): Σ`coinCost` vs Σ`rewardCoins` (+ Σ`receiverBeans`),
    overall and per gift; flag drift between observed and configured win rate.
  - Permission: reuse `gift.manage`.

## 7. Rules & safeguards
- Deduct-before-draw, atomic credit, always-logged → guaranteed by the in-transaction design + `LuckyGiftDraw`.
- Probability/multiplier/receiver % admin-managed + cached with invalidation; config snapshot
  stored on every draw row for auditability.
- Real-time feedback via `lucky.reward`.
- **Payout safety / house edge**: validation rejects TRP ≥ 100%; `stats` shows realized house
  edge; optional per-user daily win cap (`dailyUserWinCapCoins`, enforcement deferred).
- Anti-abuse: reuse `assertNoRiskBlock(senderId, 'freezeCoins', 'disableGifts')`; RNG server-only;
  idempotent on `giftTransactionId`; receiver % capped at 1.5 in schema validation.
- High volume: hot path is one in-memory probability check + the existing proven gift transaction;
  logs/sockets/feeds are post-commit/fire-and-forget.

## 8. Build sequence
1. Prisma migration (`LuckyGiftSetting`, `LuckyGiftDraw` only — `Gift` untouched).
2. Setting service + cache + admin `lucky-gifts` setting GET/PATCH + Zod + audit.
3. Draw engine (`lucky-draw.ts`) + unit tests.
4. Integrate into `sendGift` (reduced host beans + atomic win credit + `lucky_reward` ref + `LuckyGiftDraw`).
5. `WS_EVENTS.LUCKY_REWARD` emit (sender result + room wins) + winners Redis stream + winners endpoint.
6. Lucky Winners leaderboard: keys + post-commit score update + `GET /leaderboard/lucky` + `/me`.
7. User endpoints: `GET /gifts/lucky/history`, `GET /gifts/history`.
8. Admin logs/stats endpoints (`/draws`, `/stats`).
9. Tests (below).

## 9. Testing / verification
- **Unit**: `runLuckyDraw` with injected RNG — win-rate over N samples matches `winProbability`;
  payout/receiver-bean rounding; `enabled=false` and non-lucky-category paths never draw;
  validation rejects TRP ≥ 100% and receiver % > 1.5.
- **Integration** (jest + test DB pattern, `SKIP_TEST_GLOBAL_SETUP` for mocked units): send lucky
  gift → coin debited, `LuckyGiftDraw` created, win credited / lose not, **host receives the
  reduced bean cut (not the normal share)**, normal gifts still get the full share; **retry does
  not double-credit** (unique `giftTransactionId`); insufficient balance rejected before draw.
- **Leaderboard**: a win bumps the Lucky Winners score by `rewardCoins` across all three periods;
  a loss bumps nothing; `GET /leaderboard/lucky` orders by total winnings; period reset clears keys.
- **Admin**: setting PATCH updates cache (next draw uses new values); audit row written.
- **Manual**: trigger via API; confirm `lucky.reward` payload (win and lose), `/wallet/transactions`
  shows `gift_sent` + `lucky_reward`, host bean records show the reduced amount,
  `/admin/lucky-gifts/stats` house edge sane.

## Decisions log
1. **Rev 2**: ~~multi-tier reward table (`none/partial/full/bonus/jackpot`)~~ → **binary win/lose**:
   global `winProbability` + `winMultiplier`; reward = `multiplier × coinCost` in coins to the sender.
2. **Rev 2**: ~~mode-based trigger (all gifts draw)~~ ~~new `giftType`/`isLucky` field~~ →
   **existing `Gift.category === 'lucky'`** gates the draw (plus a global `enabled` kill-switch).
   The gift-overlay Lucky tab IS the lucky-gift set; no schema change on `Gift`.
3. **Rev 2 (new)**: **receiver benefit** — on lucky gifts the host's bean share is replaced by a
   small admin-set % of gift value (≤ 1.5%); the reduced cut funds the sender prize budget.
4. Rewards are paid in **coins** (spendable), `WalletTransaction.reference = 'lucky_reward'`. (unchanged)
5. Admin permission: reuse `gift.manage`. (unchanged)
6. **Rev 2 (new)**: **Lucky Winners ranking** — leaderboard scored by Σ`rewardCoins` won
   (daily/weekly/monthly), Gifters-pattern Redis keys, wins only. In MVP scope.
7. Deferred options: per-gift overrides, random multiplier range, RTP pool-based payouts,
   progressive jackpot.
