-- CreateTable
CREATE TABLE "system_wallets" (
    "id" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "totalIn" BIGINT NOT NULL DEFAULT 0,
    "totalOut" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_transactions" (
    "id" TEXT NOT NULL,
    "fromWalletId" TEXT,
    "toWalletId" TEXT,
    "amount" BIGINT NOT NULL,
    "txType" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "performedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_wallets_walletType_key" ON "system_wallets"("walletType");

-- CreateIndex
CREATE INDEX "system_transactions_txType_createdAt_idx" ON "system_transactions"("txType", "createdAt");

-- CreateIndex
CREATE INDEX "system_transactions_targetUserId_idx" ON "system_transactions"("targetUserId");

-- AddForeignKey
ALTER TABLE "system_transactions" ADD CONSTRAINT "system_transactions_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "system_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_transactions" ADD CONSTRAINT "system_transactions_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "system_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
