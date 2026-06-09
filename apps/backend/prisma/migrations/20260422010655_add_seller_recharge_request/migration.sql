-- DropIndex
DROP INDEX "gift_commission_ledger_agencyId_createdAt_id_idx";

-- CreateTable
CREATE TABLE "seller_recharge_requests" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountUsd" DECIMAL(65,30) NOT NULL,
    "coinsToCredit" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "proofImageUrl" TEXT,
    "txHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_recharge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_recharge_requests_sellerId_status_idx" ON "seller_recharge_requests"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "seller_recharge_requests" ADD CONSTRAINT "seller_recharge_requests_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
