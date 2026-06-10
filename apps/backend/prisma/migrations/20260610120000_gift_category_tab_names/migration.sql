-- Align gift catalogue categories with mobile panel tabs (bag, hot, lucky, …).
UPDATE "gifts" SET "category" = 'bag' WHERE "category" = 'basic';
UPDATE "gifts" SET "category" = 'hot' WHERE "category" IN ('premium', 'luxury');
UPDATE "gifts" SET "category" = 'lucky' WHERE "category" = 'special';

ALTER TABLE "gifts" ALTER COLUMN "category" SET DEFAULT 'bag';
