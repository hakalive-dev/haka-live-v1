-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPremiumHost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerifiedHost" BOOLEAN NOT NULL DEFAULT false;
