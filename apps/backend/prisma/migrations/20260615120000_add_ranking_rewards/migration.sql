-- CreateTable
CREATE TABLE "ranking_reward_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "rewardTiers" JSONB NOT NULL DEFAULT '[]',
    "requireFaceVerification" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_reward_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodDate" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "rewardAmount" INTEGER NOT NULL,
    "walletTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranking_rewards_board_period_periodDate_idx" ON "ranking_rewards"("board", "period", "periodDate");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_rewards_board_period_periodDate_userId_key" ON "ranking_rewards"("board", "period", "periodDate", "userId");

-- AddForeignKey
ALTER TABLE "ranking_rewards" ADD CONSTRAINT "ranking_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed both board configs DISABLED (config-only; no payout until a super-admin sets tiers + enables)
INSERT INTO "ranking_reward_config" ("id", "enabled", "period", "rewardTiers", "requireFaceVerification", "updatedAt")
VALUES
  ('agent',   false, 'daily', '[]'::jsonb, true, CURRENT_TIMESTAMP),
  ('creator', false, 'daily', '[]'::jsonb, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
