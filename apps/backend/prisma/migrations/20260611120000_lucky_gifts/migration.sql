-- Lucky Gifts: game config singleton + immutable per-send draw log.

-- CreateTable
CREATE TABLE "lucky_gift_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "winProbability" DECIMAL(65,30) NOT NULL DEFAULT 0.2,
    "winMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 3.0,
    "receiverBenefitPercent" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "dailyUserWinCapCoins" BIGINT NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lucky_gift_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky_gift_draws" (
    "id" TEXT NOT NULL,
    "giftTransactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "roomId" TEXT,
    "coinCost" INTEGER NOT NULL,
    "isWin" BOOLEAN NOT NULL,
    "rewardCoins" INTEGER NOT NULL DEFAULT 0,
    "receiverBeans" INTEGER NOT NULL DEFAULT 0,
    "winProbability" DECIMAL(65,30) NOT NULL,
    "winMultiplier" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lucky_gift_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lucky_gift_draws_giftTransactionId_key" ON "lucky_gift_draws"("giftTransactionId");

-- CreateIndex
CREATE INDEX "lucky_gift_draws_userId_createdAt_idx" ON "lucky_gift_draws"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "lucky_gift_draws_giftId_createdAt_idx" ON "lucky_gift_draws"("giftId", "createdAt");

-- CreateIndex
CREATE INDEX "lucky_gift_draws_roomId_createdAt_idx" ON "lucky_gift_draws"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "lucky_gift_draws" ADD CONSTRAINT "lucky_gift_draws_giftTransactionId_fkey" FOREIGN KEY ("giftTransactionId") REFERENCES "gift_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_gift_draws" ADD CONSTRAINT "lucky_gift_draws_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the singleton row (disabled by default; admin enables via panel).
INSERT INTO "lucky_gift_settings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
