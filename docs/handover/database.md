# Haka Live — Database

## 1. Engine & hosting

- **PostgreSQL 16**, hosted on **Supabase Pro** in production (local dev: a Postgres 16 container,
  `docker-compose.dev.yml`).
- ORM: **Prisma**. Schema: `apps/backend/prisma/schema.prisma` (~106 models). Migrations:
  `apps/backend/prisma/migrations/` (**128** migration directories as of 2026-06-05).
- Two connection URLs (Supabase pattern):
  - `DATABASE_URL` — the **pooled** connection (PgBouncer, e.g. port 6543). Used by the running app.
  - `DIRECT_URL` — the **direct** connection (e.g. port 5432). Prisma uses this for `migrate`/introspection
    (`datasource db { url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }`). Run migrations and `pg_dump` /
    `pg_restore` against the **direct** URL, not the pooler.

## 2. How to read `schema.prisma`

It is one large file. Search for `model <Name> {` to jump to a model. Each model maps to a table; relations are
declared inline. `BigInt` columns (e.g. wallet/bean balances) are serialized to strings by the API
(`apps/backend/src/app.ts` patches `BigInt.prototype.toJSON`).

## 3. Key domain models, grouped by area

(Real model names from the schema; not exhaustive.)

| Area | Models |
|---|---|
| **Users & roles** | `User`, `UserSettings`, `UserDevice`, `UserLevel`, `Follow`, `SpecialAttention`, `ProfileVisit`, `RefreshToken`, `PhoneOtp` |
| **Rooms & seats** | `Room`, `RoomPin`, `RoomAdmin`, `RoomMember`, `RoomSeat`, `RoomMessage`, `RoomMusicTrack`, `UserMusicTrack` |
| **Chat / DM** | `DirectMessage`, `TeamAnnouncement`, `TeamAnnouncementRead` |
| **Gifting / coins / beans economy** | `Wallet`, `WalletTransaction`, `Gift`, `GiftTransaction`, `GiftCommissionLedger`, `GiftBonusSetting`, `GiftBonusTier`, `CoinPackage`, `PaymentTransaction`, `SystemWallet`, `SystemTransaction`, `MintRequest`, `CurrencyRate` |
| **Withdrawals / payment methods** | `WithdrawalRequest`, `UserPaymentMethod` (account details AES-256-GCM encrypted with `PAYMENT_ENCRYPTION_KEY`) |
| **Agency / host** | `Agency`, `AgencyInvitation`, `AgencyTier`, `AgencyChangeRequest`, `AgencyLearnPromotion`, `Family`, `FamilyMember`, `HostApplication`, `HostTier`, `HostLevelTask*`, `HostMicSession`, `HostPkPresenceSession`, `HostAgencyOwnershipChange`, `AgentApplication`, `SubAgentInvitation`, `DesignatedBecomeAgencyAdmin` |
| **Coin seller** | `CoinSellerProfile`, `CoinSellerTransaction`, `CoinSellerLevelRule`, `SellerRechargeRequest`, `SellerExchangeRequest`, `AgentTransaction` |
| **Payroll** | `PayrollAgentProfile`, `PayrollLedgerEntry`, `PayrollRecord` |
| **Moderation / staff** | `Report`, `Ban`, `DeviceBan`, `AccountRisk`, `BlockedUser`, `AdminUser`, `AdminRefreshToken`, `AdminEmergencyOtp`, `AdminTag`, `UserTag`, `AdminCustomRole`, `AdminAgencyAssignment`, `AdminWithdrawalFreeze`, `AdminNotification`, `AuditLog`, `StaffTarget` |
| **Games / battles** | `PkMatch`, `PkInvite`, `NormalBattle`, `CalculatorSession`, `CalculatorSeatScore`, `CalculatorGiftContribution`, `Game` |
| **Content / social** | `Moment`, `MomentLike`, `MomentComment`, `StoreItem*`, `UserStoreItem`, `Theme`, `Banner`, `Event`, `EventReward`, `Notification`, `SpecialId`, `SpecialIdInventory` |
| **Face verification** | `FaceVerificationSession` (AWS Rekognition) |
| **Support / config** | `SupportTicket`, `SystemSetting`, `InviteCode`, `Region` |

## 4. Migration workflow

```bash
# Local: create a new migration after editing schema.prisma
cd apps/backend
npx prisma migrate dev --name <change_name>     # dev only — creates + applies + regenerates client

# Production / CI / containers: apply pending migrations without prompting
npx prisma migrate deploy                        # run against DIRECT_URL

# Regenerate the Prisma client after pulling schema changes
npx prisma generate
```

The container start commands already run `prisma migrate deploy` on boot
(`docker-compose.dev.yml` and the production Dockerfile). **Prisma is forward-only — there are no automatic down
migrations** (see rollback caveats in [deployment-and-recovery.md](./deployment-and-recovery.md) §E.3). A stuck
migration can be resolved with `npx prisma migrate resolve --applied <migration>` (the repo has a helper script
`prisma:resolve:add_room_members` as an example), and the production start command runs
`dist/scripts/prisma-recover.js` first to recover from interrupted migrations.

## 5. Backup & restore

### 5.1 Supabase automated backups

Supabase **Pro** includes daily automated backups with point-in-time options (Dashboard → Database → Backups).
**Confirm the retention window with the owner and lengthen it if needed before launch.** Automated backups cover the
Postgres data only — **Storage objects (uploaded images) are backed up separately**; ensure a Storage backup/export
strategy exists too.

Recommended cadence:

- Rely on Supabase daily automated backups as the baseline.
- Take a **manual `pg_dump` before every production schema migration** and before any destructive operation.
- Periodically copy a `pg_dump` off-platform (different cloud account) so a Supabase-account compromise can't destroy
  both the DB and its backups.

### 5.2 Manual backup (`pg_dump`)

Run against the **direct** connection (not the pooler). Use a placeholder connection string — real value from the vault:

```bash
# Custom-format dump (best for selective restore; compresses well)
pg_dump "<DIRECT_URL>" \
  --format=custom --no-owner --no-privileges \
  --file="hakalive_$(date +%Y%m%d_%H%M%S).dump"

# Plain SQL alternative
pg_dump "<DIRECT_URL>" --no-owner --no-privileges \
  --file="hakalive_$(date +%Y%m%d_%H%M%S).sql"
```

`<DIRECT_URL>` looks like `postgresql://postgres:<DB_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres`.

### 5.3 Restore (`pg_restore`)

```bash
# Into a fresh/empty database (custom-format dump)
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="<DIRECT_URL_OF_TARGET>" \
  hakalive_YYYYMMDD_HHMMSS.dump

# Plain SQL dump
psql "<DIRECT_URL_OF_TARGET>" -f hakalive_YYYYMMDD_HHMMSS.sql
```

After restore, run `npx prisma migrate deploy` to ensure the schema is at the latest migration, then `npx prisma generate`.

### 5.4 Tested-restore checklist (do this at least once before launch, and after handover)

- [ ] Take a fresh `pg_dump` (custom format) of production.
- [ ] Provision a throwaway Postgres 16 (separate Supabase project or local container).
- [ ] `pg_restore` the dump into it.
- [ ] Run `npx prisma migrate deploy` against it — confirm "No pending migrations" or clean apply.
- [ ] Point a backend instance at it (`DATABASE_URL`/`DIRECT_URL`) and confirm it boots: `Database connected` in logs,
      `GET /health` 200.
- [ ] Spot-check row counts on `User`, `Wallet`, `Room`, `GiftTransaction` vs production.
- [ ] Confirm admin login works (`AdminUser` restored) and a sample user profile loads.
- [ ] Verify encrypted payout rows still decrypt — i.e. the **same `PAYMENT_ENCRYPTION_KEY`** is set on the restore
      target (a different key makes `UserPaymentMethod` rows unreadable).
- [ ] Tear down the throwaway DB.
