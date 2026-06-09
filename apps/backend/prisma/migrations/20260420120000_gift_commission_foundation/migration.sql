-- ── Extensions ────────────────────────────────────────────────────────────────
-- gen_random_uuid() (used below to reseed agency_tiers) ships with core Postgres
-- 13+, but managed hosts (Supabase etc.) may require pgcrypto explicitly.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── User: cumulative beans counter ─────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "cumulativeBeansEarned" BIGINT NOT NULL DEFAULT 0;

-- ── Agency: parent chain, counters, overrides ──────────────────────────────────
ALTER TABLE "agencies"
  ADD COLUMN "parentAgencyId"          TEXT,
  ADD COLUMN "cumulativeHostIncome"    BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "beanBalance"             BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "commissionRateOverride"  DECIMAL,
  ADD COLUMN "giftBonusRateOverride"   DECIMAL;

ALTER TABLE "agencies"
  ADD CONSTRAINT "agencies_parentAgencyId_fkey"
    FOREIGN KEY ("parentAgencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agencies_parentAgencyId_idx" ON "agencies"("parentAgencyId");

-- ── GiftTransaction: recipient kind + agency FK ────────────────────────────────
ALTER TABLE "gift_transactions"
  ADD COLUMN "recipientType"     TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "recipientAgencyId" TEXT;

ALTER TABLE "gift_transactions"
  ADD CONSTRAINT "gift_transactions_recipientAgencyId_fkey"
    FOREIGN KEY ("recipientAgencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "gift_transactions_recipientAgencyId_createdAt_idx"
  ON "gift_transactions"("recipientAgencyId", "createdAt");

-- ── AgencyTier: rename + reseed ────────────────────────────────────────────────
ALTER TABLE "agency_tiers" ADD COLUMN "minHostIncome" BIGINT NOT NULL DEFAULT 0;
UPDATE "agency_tiers" SET "minHostIncome" = "minWeeklyBeans";
ALTER TABLE "agency_tiers" DROP COLUMN "minWeeklyBeans";

-- Wipe old rows and reseed A–E. Admin can edit thereafter.
DELETE FROM "agency_tiers";
INSERT INTO "agency_tiers" ("id", "name", "minHostIncome", "commissionRate", "order", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'A', 0,          0.04, 0, NOW(), NOW()),
  (gen_random_uuid()::text, 'B', 1,          0.08, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'C', 2000000,    0.12, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'D', 8000000,    0.16, 3, NOW(), NOW()),
  (gen_random_uuid()::text, 'E', 20000000,   0.20, 4, NOW(), NOW());

-- ── Gift.beanValue = coinCost (fix for double-70% bug) ─────────────────────────
UPDATE "gifts" SET "beanValue" = "coinCost";

-- ── GiftCommissionLedger ───────────────────────────────────────────────────────
CREATE TABLE "gift_commission_ledger" (
  "id"                TEXT PRIMARY KEY,
  "giftTransactionId" TEXT NOT NULL,
  "agencyId"          TEXT NOT NULL,
  "userId"            TEXT,
  "amount"            BIGINT NOT NULL,
  "commissionType"    TEXT NOT NULL,
  "rateApplied"       DECIMAL NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_commission_ledger_giftTransactionId_fkey"
    FOREIGN KEY ("giftTransactionId") REFERENCES "gift_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gift_commission_ledger_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "gift_commission_ledger_giftTransactionId_idx"
  ON "gift_commission_ledger"("giftTransactionId");
CREATE INDEX "gift_commission_ledger_agencyId_createdAt_idx"
  ON "gift_commission_ledger"("agencyId", "createdAt");
CREATE INDEX "gift_commission_ledger_commissionType_createdAt_idx"
  ON "gift_commission_ledger"("commissionType", "createdAt");

-- ── GiftBonusSetting (singleton) ───────────────────────────────────────────────
CREATE TABLE "gift_bonus_settings" (
  "id"        TEXT PRIMARY KEY DEFAULT 'singleton',
  "enabled"   BOOLEAN NOT NULL DEFAULT FALSE,
  "bonusRate" DECIMAL NOT NULL DEFAULT 0.15,
  "updatedBy" TEXT    NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "gift_bonus_settings" ("id", "enabled", "bonusRate", "updatedBy", "updatedAt")
VALUES ('singleton', FALSE, 0.15, '', NOW());

-- ── AgencyInvitation ───────────────────────────────────────────────────────────
CREATE TABLE "agency_invitations" (
  "id"           TEXT PRIMARY KEY,
  "fromAgencyId" TEXT NOT NULL,
  "toAgencyId"   TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "note"         TEXT NOT NULL DEFAULT '',
  "reviewedBy"   TEXT NOT NULL DEFAULT '',
  "reviewedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agency_invitations_fromAgencyId_fkey"
    FOREIGN KEY ("fromAgencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agency_invitations_toAgencyId_fkey"
    FOREIGN KEY ("toAgencyId")   REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "agency_invitations_toAgencyId_status_idx"
  ON "agency_invitations"("toAgencyId", "status");
CREATE INDEX "agency_invitations_fromAgencyId_status_idx"
  ON "agency_invitations"("fromAgencyId", "status");
