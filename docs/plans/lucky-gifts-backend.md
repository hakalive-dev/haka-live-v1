# Plan: Lucky Gifts — Backend

> Scope: **backend only** (UI not started). This plan defines schema, services, endpoints,
> real-time events, and admin management for Lucky Gifts, built on the existing gift/wallet stack.

## Context
Users send gifts in live rooms using coins (Google Play Billing → coin wallet). Some gifts are
**Lucky Gifts**: after sending, the system instantly runs a server-side random draw and credits the
**sender** a reward (bonus/refund/jackpot/effect). Coins are deducted first, the reward is generated
automatically, credited instantly, logged, and announced in real time. Reward probabilities are
admin-configurable.

A Lucky Gift is still a normal gift to the **host** (the host still receives `beanValue`); the lucky
**reward goes to the sender**. So we reuse the entire send-gift pipeline and add a sender-side draw.

## What already exists (reuse — do NOT rebuild)
- **Coin debit + atomic gift tx**: `sendGift()` in `apps/backend/src/modules/gifts/gifts.service.ts:362` — risk check (`assertNoRiskBlock`), balance pre-check, `FOR UPDATE` wallet lock, coin debit + `WalletTransaction` (`reference:'gift_sent'`), `GiftTransaction` create, `distributeBeans()`, retry-on-serialization wrapper. ✅
- **Wallet**: `Wallet.coinBalance` / `WalletTransaction` (`schema.prisma:554`); credit helper `creditCoinsInTransaction` (`wallet.service.ts`). ✅
- **Gift catalog**: `Gift` model (`schema.prisma:587`) with `coinCost`, `category`, `isActive`, `animationType`, `svgaAsset`. ✅
- **Room real-time**: `emitRoomGiftAnimation` (`gifts.controller.ts:37`) → `io.to(roomId).emit('gift:received', …)` + Redis replay stream `room:{roomId}:gift_events`. ✅
- **Leaderboards / side-effects**: post-commit job queue + Redis `zincrby` (`leaderboard.service.ts`). ✅
- **Admin gift CRUD**: `apps/backend/src/modules/admin/gifts/*` (`requirePermission('gift.manage')`, Zod, `logAdminAction`). ✅
- **Admin config singleton pattern**: `GiftBonusSetting` (`id:'singleton'`, `updatedBy`) + tier tables `AgencyTier`/`GiftBonusTier` with in-memory cache + `clearTierCache()` (`admin/commission-config/*`). ✅ — the model for reward-probability config.
- **Admin logs/stats**: `AuditLog` (`schema.prisma:1383`), `audit.service.ts`, `analytics.service.ts` groupBy aggregates. ✅
- **Notifications**: `notifyAccountAlert()` (in-app + FCM + socket). ✅

## MVP (Phase 1) — thinnest working loop
Coin-reward lucky gifts only. Ship this first; layer the rest after.
- **In:** global `LuckyGiftSetting.enabled` mode → **all gifts draw** (both tabs); one global
  `LuckyGiftRewardTier` table (coin-only: `none`, `partial_refund`, `full_refund`, `bonus_coins`,
  fixed `jackpot`) using `rewardMultiplier` + `weight`, with a mandatory weighted `none` tier;
  weighted draw engine; reward credited **inside** the `sendGift` tx (`reference:'lucky_reward'`) +
  `LuckyGiftDraw` log for every draw (unique on `giftTransactionId`); `lucky.reward` socket (sender
  popup + room notification); admin enable-flag + reward-table CRUD with **expected-return %**
  readout; `GET /gifts/lucky/history`; house-edge `stats` aggregate. `Gift.giftType` exposed in
  `GET /gifts` for the UI Lucky-tab highlight.
- **Deferred:** visual-only rewards (`room_effect`/`special_animation`/`gift_value`), **progressive**
  jackpot pool (MVP uses a fixed jackpot tier), persisted "recent winners" Redis feed, per-user
  daily win cap, full participation analytics.

## Enablement & triggering (who/what)  ← MODE-BASED (decided)
- **Lucky Gifts is a MODE, not a per-gift type.** When `LuckyGiftSetting.enabled === true`, **every
  gift send draws a reward** — both normal-tab and lucky-tab gifts. When off, no gift draws.
- **Trigger source of truth = the global `LuckyGiftSetting.enabled` flag** (server-side), NOT the
  client tab and NOT a per-gift `giftType`. `giftType`/"Lucky tab" is **UI curation only** (which
  gifts to highlight); it does not gate the draw.
- **Enable/configure:** admins with `gift.manage` — toggle the global flag, edit the reward table.
- **Send (and thus draw):** any user in a room (no special role) — same gates as a normal gift
  (`assertNoRiskBlock` freezeCoins/disableGifts, enough coins, gift `isActive`). Reward → **sender**.
- **Economy consequence (critical):** because *every* send draws, the reward table MUST include a
  weighted **no-win** outcome and rewards MUST scale to the gift's cost (see §1/§2), so expected
  payout stays below cost. Admin sees a computed **expected-return %** to keep the house edge safe.

## What's missing (build this)
1. A way to mark a gift as Lucky.
2. Admin-configurable reward outcomes + weights + jackpot per Lucky Gift.
3. A server-side weighted draw engine.
4. Atomic reward credit inside the send transaction.
5. An immutable draw log (history + admin logs + stats).
6. Real-time reward event + room "lucky winners" feed.
7. User history + admin logs/stats endpoints.

---

## 1. Data model (Prisma migration)
- **`Gift.giftType`** — add `giftType String @default("normal")` (`"normal" | "lucky"`), used **only**
  to drive the UI "Lucky" tab highlight. Does NOT gate the draw. Add to admin create/update schemas.
- **`LuckyGiftRewardTier`** (ONE global, admin-configured reward table — applies to every gift):
  - `id`, `rewardType` (`none | bonus_coins | partial_refund | full_refund | gift_value | room_effect | special_animation | jackpot`), `rewardMultiplier Decimal` (of the sent gift's `coinCost`; e.g. `0` for no-win, `0.5` partial, `1.0` full refund, `2.0` jackpot), `rewardMeta String @default("")` (effect/animation key for visual types), `weight Int` (P = weight / Σ enabled weights), `label String`, `isActive Boolean`, `order Int`, timestamps.
  - **Must include a `none` (no-win) tier** with the dominant weight — this is what creates the house edge now that every send draws.
  - Reward coins credited = `round(coinCost × rewardMultiplier)` (0 for `none`/visual types).
  - *(Post-MVP option: a per-gift override table so curated "lucky tab" gifts can have richer odds.)*
- **`LuckyGiftDraw`** (immutable result log — one row per send):
  - `id`, `giftTransactionId` (FK→GiftTransaction, **`@@unique`** for idempotency), `userId` (sender), `giftId`, `roomId String?`, `coinCost Int`, `rewardTierId String?`, `rewardType String`, `rewardCoins Int @default(0)` (net coins credited; 0 for visual rewards), `rewardLabel String`, `createdAt`. Indexes: `@@index([userId, createdAt])`, `@@index([giftId, createdAt])`, `@@index([roomId, createdAt])`.
- **`LuckyGiftSetting`** (optional singleton, `id:'singleton'`): `enabled Boolean`, `dailyUserWinCapCoins BigInt @default(0)` (0 = no cap), `updatedBy`, `updatedAt` — global kill-switch + payout safeguard.

## 2. Reward draw engine (pure, unit-testable)
- New `apps/backend/src/modules/lucky-gifts/lucky-draw.ts`: `pickReward(tiers, coinCost, rng=Math.random)` → weighted random over the global enabled tiers; returns `{ tier, rewardCoins }` where `rewardCoins = round(coinCost × tier.rewardMultiplier)`. Inject `rng` for deterministic tests.
- `none` and visual types (`room_effect`/`special_animation`) → `rewardCoins = 0`.
- **Server-authoritative**: client never influences the outcome.
- **Config cache**: load the global enabled tiers into an in-memory cache (mirror `commission-config`'s tier cache); `clearLuckyRewardCache()` on admin mutation. Hot path is DB-free.
- **Expected-return helper**: `expectedReturn(tiers) = Σ(weightᵢ × multiplierᵢ) / Σweight` — surfaced to admin and asserted < 1.0 (house edge) in tests.

### How the reward is chosen (weighted roulette-wheel)
Chance of a tier = `weight ÷ Σ enabled weights`. Draw `r ∈ [0, Σweight)`, walk cumulative weights, the band containing `r` wins; `rewardCoins = round(coinCost × multiplier)`. Example global table:

| Tier | Type | Multiplier | Weight | Chance | Band |
|---|---|---|---|---|---|
| No win | `none` | 0.0× | 70 | 70% | 0–70 |
| Small | `partial_refund` | 0.3× | 18 | 18% | 70–88 |
| Full refund | `full_refund` | 1.0× | 8 | 8% | 88–96 |
| Bonus | `bonus_coins` | 2.0× | 3 | 3% | 96–99 |
| Jackpot | `jackpot` | 5.0× | 1 | 1% | 99–100 |

Lucky Box (100 coins): `r=80`→Small→30 coins; `r=92`→Full→100; `r=99.4`→Jackpot→500. A Crown (1000 coins) jackpot → 5000. Expected return here = `0.18·0.3 + 0.08·1 + 0.03·2 + 0.01·5 = 0.244` (~24% back, ~76% house edge). Admin tunes weights/multipliers; the panel shows the expected-return %.

## 3. Send-a-Lucky-Gift flow (extend `sendGift`)
Inside the existing `sendGift` transaction, after the coin debit + `GiftTransaction` create + `distributeBeans`:
1. If `LuckyGiftSetting.enabled` (mode on, applies to **all** gifts): `pickReward(cachedTiers, coinCost)`.
2. If reward credits coins (multiplier > 0): credit the **sender's** wallet in the same `tx` + `WalletTransaction` (`reference:'lucky_reward'`). Optional daily-win-cap check against `LuckyGiftSetting`.
3. Create `LuckyGiftDraw` row for **every** draw including `none` (unique on `giftTransactionId` → safe under the retry wrapper; a retried tx reuses the same id).
4. Return the draw result alongside the gift result.
- New coin references: cost stays `gift_sent`; reward credit is `lucky_reward` (so `/wallet/transactions` already surfaces both).
- Coins are deducted **before** reward generation and both are **atomic** → satisfies "deduct first / instant credit / always logged".

## 4. Real-time (sockets)
- Reuse `gift:received` room animation (unchanged).
- Add `WS_EVENTS.LUCKY_REWARD = 'lucky.reward'` (`shared-types/events.ts`), emitted **post-commit**:
  - to sender `io.to(user:${senderId})` → reward popup + details + new balance hint (client refreshes balance; **do not** reuse `wallet:coins_received` — it triggers the purchase-success modal).
  - to room `io.to(roomId)` → room notification + "Recent Lucky Gift Winners" feed.
- **Winners feed**: Redis stream `room:{roomId}:lucky_events` (capped + TTL), mirroring the existing gift replay buffer; a `GET /gifts/lucky/room/:roomId/winners` reads recent entries.

## 5. User history & records (endpoints)
- `GET /gifts/lucky/history` — sender's draws (gift name, cost, reward, date) from `LuckyGiftDraw`, paginated.
- `GET /gifts/history` — paginated **sent** gift history (sender, receiver, coins, date). NOTE: only a "received gallery" exists today (`gifts.routes.ts`), no sent-history endpoint — add one (covers normal + lucky).
- **Coin transaction history**: already covered by `GET /wallet/transactions` (now includes `lucky_reward`).
- **Earnings history (hosts)**: unchanged — host still earns `beanValue`; existing `/wallet/bean-records` covers it.

## 6. Admin management
- **Mark lucky / catalog**: extend `admin/gifts` create/update schemas with `giftType`; enable/disable via existing `Gift.isActive`.
- **New module `admin/lucky-gifts`** (mirror `admin/commission-config`):
  - `GET/POST/PATCH/DELETE /admin/lucky-gifts/rewards` — CRUD the **global** reward tiers (type, `rewardMultiplier`, weight, label, enable/disable). Zod: `weight ≥ 0` int, `rewardMultiplier ≥ 0`, Σ(enabled weights) > 0, at least one enabled tier. Response includes computed **expected-return %**; warn if ≥ 100%. `clearLuckyRewardCache()` + `logAdminAction` on every mutation.
  - `GET/PATCH /admin/lucky-gifts/setting` — singleton (global `enabled` mode flag, optional daily win cap).
  - `GET /admin/lucky-gifts/draws` — reward-distribution log (filters: gift, user, room, date; paginated) from `LuckyGiftDraw`.
  - `GET /admin/lucky-gifts/stats` — participation + win-rate + total paid out + **house edge per gift** (groupBy aggregates, analytics pattern): Σ`coinCost` vs Σ`rewardCoins` per gift.
  - Permission: reuse `gift.manage` (simplest) **or** add `luckygift.manage` (see Open Decisions). Protect with `authenticateAdmin` + `requirePermission`.

## 7. Rules & safeguards (from spec §9)
- Deduct-before-draw, atomic credit, always-logged → guaranteed by the in-transaction design + `LuckyGiftDraw`.
- Probabilities admin-managed + cached with invalidation.
- Real-time feedback via `lucky.reward`.
- **Payout safety / house edge**: admin owns weights+values; add (a) `stats` house-edge view and (b) optional per-user daily win cap (`LuckyGiftSetting.dailyUserWinCapCoins`). Flag if a gift's expected payout ≥ cost.
- Anti-abuse: reuse `assertNoRiskBlock(senderId, 'freezeCoins', 'disableGifts')`; RNG server-only; idempotent on `giftTransactionId`.
- High volume: hot path is one in-memory weighted pick + the existing proven gift transaction; logs/sockets/feeds are post-commit/fire-and-forget.

## 8. Build sequence
1. Prisma migration (`Gift.giftType`, `LuckyGiftRewardTier`, `LuckyGiftDraw`, `LuckyGiftSetting`); backfill `giftType='normal'`.
2. Reward-config service + cache + admin `lucky-gifts` CRUD + Zod + audit.
3. Draw engine (`lucky-draw.ts`) + unit tests.
4. Integrate into `sendGift` (atomic reward credit + `lucky_reward` ref + `LuckyGiftDraw`).
5. `WS_EVENTS.LUCKY_REWARD` emit (sender + room) + winners Redis stream + winners endpoint.
6. User endpoints: `GET /gifts/lucky/history`, `GET /gifts/history`.
7. Admin logs/stats endpoints (`/draws`, `/stats`).
8. Tests (below).

## 9. Testing / verification
- **Unit**: `pickReward` distribution over N samples with injected RNG (weights respected; disabled tiers excluded; Σweight=0 guard). Reward→coin mapping per type.
- **Integration** (jest + test DB pattern, `SKIP_TEST_GLOBAL_SETUP` for mocked units): send lucky gift → coin debited, `LuckyGiftDraw` created, reward credited, balances correct, host beans unaffected; **retry does not double-credit** (unique `giftTransactionId`); insufficient balance rejected before draw; disabled gift/tier handled.
- **Admin**: tier CRUD updates cache (next draw uses new weights); Σweight>0 enforced; audit row written.
- **Manual**: trigger via API; confirm `lucky.reward` socket payload + `/wallet/transactions` shows `gift_sent` + `lucky_reward`; `/admin/lucky-gifts/stats` house-edge sane.

## Open decisions (recommend defaults; confirm later)
1. ~~`partial_refund` value~~ **DECIDED**: all rewards are `rewardMultiplier × coinCost` (a global table applied to every gift), with a weighted `none` tier for the house edge. Trigger = global mode flag, all tabs.
2. **`gift_value` / `room_effect` / `special_animation`**: treat coin-types as coins; effect/animation as visual-only (no credit, `rewardMeta` key). → *Default as stated.*
3. **Jackpot**: fixed-value reward tier (`rewardType:'jackpot'`) for v1 vs progressive pool. → *Default: fixed tier now; progressive pool = later enhancement.*
4. **Admin permission**: reuse `gift.manage` vs new `luckygift.manage`. → *Default: reuse `gift.manage`.*
5. ~~Reward currency~~ **DECIDED**: rewards are paid in **coins** (spendable), credited to the sender's `Wallet.coinBalance` with `WalletTransaction.reference = 'lucky_reward'`.
