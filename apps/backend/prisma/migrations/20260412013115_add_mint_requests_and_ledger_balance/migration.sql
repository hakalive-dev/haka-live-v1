-- AlterTable
ALTER TABLE "system_transactions" ADD COLUMN     "fromBalanceAfter" BIGINT,
ADD COLUMN     "reversalOf" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "toBalanceAfter" BIGINT;

-- CreateTable
CREATE TABLE "mint_requests" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mint_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mint_requests_status_createdAt_idx" ON "mint_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "system_transactions_status_idx" ON "system_transactions"("status");
