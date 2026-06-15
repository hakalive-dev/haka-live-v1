-- AlterTable
ALTER TABLE "users" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "state_ranking_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "periodDate" TIMESTAMP(3) NOT NULL,
    "stateRank" INTEGER NOT NULL,
    "hostRankInState" INTEGER NOT NULL,
    "giftScore" INTEGER NOT NULL,
    "poolTotal" INTEGER NOT NULL,
    "rewardAmount" INTEGER NOT NULL,
    "walletTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_ranking_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_ranking_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "topHostsPerState" INTEGER NOT NULL DEFAULT 4,
    "hostSplitPercentages" JSONB NOT NULL DEFAULT '[65,20,10,5]',
    "stateRankTiers" JSONB NOT NULL DEFAULT '[]',
    "requireFaceVerification" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_ranking_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "state_ranking_rewards_periodDate_countryCode_stateCode_idx" ON "state_ranking_rewards"("periodDate", "countryCode", "stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "state_ranking_rewards_userId_periodDate_countryCode_stateCode_key" ON "state_ranking_rewards"("userId", "periodDate", "countryCode", "stateCode");

-- AddForeignKey
ALTER TABLE "state_ranking_rewards" ADD CONSTRAINT "state_ranking_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default config row
INSERT INTO "state_ranking_config" ("id", "enabled", "topHostsPerState", "hostSplitPercentages", "stateRankTiers", "requireFaceVerification", "updatedAt")
VALUES (
  'singleton',
  true,
  4,
  '[65,20,10,5]'::jsonb,
  '[
    {"stateRankMin":1,"stateRankMax":1,"poolTotal":4000000},
    {"stateRankMin":2,"stateRankMax":2,"poolTotal":2000000},
    {"stateRankMin":3,"stateRankMax":3,"poolTotal":1000000},
    {"stateRankMin":4,"stateRankMax":6,"poolTotal":600000},
    {"stateRankMin":7,"stateRankMax":10,"poolTotal":300000},
    {"stateRankMin":11,"stateRankMax":15,"poolTotal":100000},
    {"stateRankMin":16,"stateRankMax":20,"poolTotal":40000},
    {"stateRankMin":21,"stateRankMax":30,"poolTotal":20000},
    {"stateRankMin":31,"stateRankMax":50,"poolTotal":10000}
  ]'::jsonb,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
