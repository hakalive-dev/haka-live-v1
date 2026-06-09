-- Agency commission: A–E ladder (4%–20%) on sliding 30-day rolling agency turnover thresholds.
DELETE FROM "agency_tiers";

INSERT INTO "agency_tiers" ("id", "name", "minHostIncome", "commissionRate", "order", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'A', 0,           0.04, 0, NOW(), NOW()),
  (gen_random_uuid()::text, 'B', 2000000,     0.08, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'C', 10000000,    0.12, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'D', 50000000,    0.16, 3, NOW(), NOW()),
  (gen_random_uuid()::text, 'E', 150000000,   0.20, 4, NOW(), NOW());

-- Gift bonus (rolling 7-day agency host income): 0% / 5% / 10% / 15% at 0, 200k, 300k, 500k.
DELETE FROM "gift_bonus_tiers";

INSERT INTO "gift_bonus_tiers" ("id", "name", "minRollingIncome", "bonusRate", "order", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Tier1', 0,       0,    0, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tier2', 200000,  0.05, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tier3', 300000,  0.10, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tier4', 500000,  0.15, 3, NOW(), NOW());
