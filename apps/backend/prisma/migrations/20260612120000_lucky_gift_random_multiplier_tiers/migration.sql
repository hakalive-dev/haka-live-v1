-- Lucky gifts: weighted random win-multiplier tiers per draw.

ALTER TABLE "lucky_gift_settings"
ADD COLUMN "winMultiplierTiers" JSONB NOT NULL DEFAULT '[{"multiplier":2,"weight":50},{"multiplier":3,"weight":25},{"multiplier":5,"weight":15},{"multiplier":10,"weight":7},{"multiplier":50,"weight":2},{"multiplier":100,"weight":1}]'::jsonb;
