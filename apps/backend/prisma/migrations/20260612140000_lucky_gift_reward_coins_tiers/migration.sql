-- Lucky gifts: tiers carry absolute rewardCoins (not stake × multiplier).

UPDATE "lucky_gift_settings"
SET
  "winMultiplierTiers" = '[
    {"multiplier":2,"rewardCoins":20,"weight":50},
    {"multiplier":5,"rewardCoins":100,"weight":25},
    {"multiplier":10,"rewardCoins":500,"weight":15},
    {"multiplier":50,"rewardCoins":5000,"weight":7},
    {"multiplier":100,"rewardCoins":50000,"weight":2},
    {"multiplier":500,"rewardCoins":500000,"weight":1}
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'singleton';
