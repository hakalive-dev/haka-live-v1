-- Raise lucky-gift win chance to 98% (singleton game config).
UPDATE "lucky_gift_settings"
SET
  "winProbability" = 0.98,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'singleton';
