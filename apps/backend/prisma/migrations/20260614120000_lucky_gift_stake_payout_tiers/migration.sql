-- Lucky gifts: stake-relative payout tiers (% of coinCost on win).

UPDATE "lucky_gift_settings"
SET
  "winProbability" = 0.98,
  "winMultiplierTiers" = '[
    {"payoutPercent":40,"weight":30},
    {"payoutPercent":88,"weight":25},
    {"payoutPercent":95,"weight":20},
    {"payoutPercent":105,"weight":12},
    {"payoutPercent":220,"weight":6},
    {"payoutPercent":350,"weight":3},
    {"payoutPercent":520,"weight":1}
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'singleton';
