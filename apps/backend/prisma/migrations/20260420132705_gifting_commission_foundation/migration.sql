/*
  Warnings:

  - You are about to alter the column `commissionRateOverride` on the `agencies` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `giftBonusRateOverride` on the `agencies` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `bonusRate` on the `gift_bonus_settings` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `rateApplied` on the `gift_commission_ledger` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "agencies" ALTER COLUMN "commissionRateOverride" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "giftBonusRateOverride" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "gift_bonus_settings" ALTER COLUMN "bonusRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "gift_commission_ledger" ALTER COLUMN "rateApplied" SET DATA TYPE DECIMAL(65,30);
