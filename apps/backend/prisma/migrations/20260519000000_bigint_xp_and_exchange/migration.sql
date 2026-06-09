-- AlterTable: promote XP columns to bigint to prevent 32-bit overflow
-- (XP thresholds reach ~21.85B for level 100, far exceeding INT4 max of ~2.1B).

ALTER TABLE "user_levels"
  ALTER COLUMN "richXp" TYPE BIGINT,
  ALTER COLUMN "charmXp" TYPE BIGINT;

-- AlterTable: promote seller exchange request pointsAmount to bigint
-- (exchange amounts can exceed INT4 max for high-balance sellers).

ALTER TABLE "seller_exchange_requests"
  ALTER COLUMN "pointsAmount" TYPE BIGINT;
