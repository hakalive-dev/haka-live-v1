-- Replace commission tier ladder with four steps: 0% / 0, 5% / 200k, 10% / 300k, 15% / 500k (beans).
DELETE FROM "agency_tiers";

INSERT INTO "agency_tiers" ("id", "name", "minHostIncome", "commissionRate", "order", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'A', 0,       0,    0, NOW(), NOW()),
  (gen_random_uuid()::text, 'B', 200000,  0.05, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'C', 300000,  0.10, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'D', 500000,  0.15, 3, NOW(), NOW());
