-- Align agency commission tier thresholds with 30-day rolling turnover product slabs.
DELETE FROM "agency_tiers";

INSERT INTO "agency_tiers" ("id", "name", "minHostIncome", "commissionRate", "order", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'A', 0,           0.04, 0, NOW(), NOW()),
  (gen_random_uuid()::text, 'B', 2000000,     0.08, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'C', 10000000,    0.12, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'D', 50000000,    0.16, 3, NOW(), NOW()),
  (gen_random_uuid()::text, 'E', 150000000,   0.20, 4, NOW(), NOW());
