-- AlterTable
ALTER TABLE "coin_seller_profiles" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "paymentMethods" TEXT NOT NULL DEFAULT 'upi,epay,usdt,usdc',
ADD COLUMN     "pricePerCoin" DECIMAL(65,30) NOT NULL DEFAULT 0.001;
