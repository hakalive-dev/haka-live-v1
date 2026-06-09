-- AlterTable
ALTER TABLE "users" ADD COLUMN "preferredWithdrawalCountryCode" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "withdrawal_requests" ADD COLUMN "currency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "withdrawal_requests" ADD COLUMN "localAmount" DECIMAL(18,6);
ALTER TABLE "withdrawal_requests" ADD COLUMN "usdRateAtRequest" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "currency_rates" ADD COLUMN "minWithdrawalBeans" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "currency_rates" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "currency_rates_currency_isActive_idx" ON "currency_rates"("currency", "isActive");
