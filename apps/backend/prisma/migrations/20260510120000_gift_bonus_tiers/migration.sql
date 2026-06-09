-- CreateTable
CREATE TABLE "gift_bonus_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minRollingIncome" BIGINT NOT NULL DEFAULT 0,
    "bonusRate" DECIMAL(65,30) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_bonus_tiers_pkey" PRIMARY KEY ("id")
);

INSERT INTO "gift_bonus_tiers" ("id", "name", "minRollingIncome", "bonusRate", "order", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Tier1', 300000, 0.05, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Tier2', 3000000, 0.10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Tier3', 10000000, 0.15, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
