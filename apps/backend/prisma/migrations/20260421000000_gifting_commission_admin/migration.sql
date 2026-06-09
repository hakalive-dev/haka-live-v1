-- Migration: gifting_commission_admin (Plan 2)
-- 1. Historic rewrite of GiftTransaction.beanValue to match post-Plan-1 semantics.
--    Rows already satisfying beanValue = coinCost are untouched (idempotent).
-- 2. Index backing cursor pagination on gift_commission_ledger by (agencyId, createdAt DESC, id DESC).

-- ── 1. Historic beanValue rewrite ─────────────────────────────────────────────
UPDATE gift_transactions
SET "beanValue" = "coinCost"
WHERE "beanValue" <> "coinCost";

-- ── 2. Cursor index ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "gift_commission_ledger_agencyId_createdAt_id_idx"
  ON "gift_commission_ledger" ("agencyId", "createdAt" DESC, "id" DESC);
