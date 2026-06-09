-- Gift bonus payouts always use tier/fallback logic; global disable is retired.
-- Keep `enabled` column for backwards compatibility; force true and default true.
UPDATE "gift_bonus_settings" SET "enabled" = true;
ALTER TABLE "gift_bonus_settings" ALTER COLUMN "enabled" SET DEFAULT true;
