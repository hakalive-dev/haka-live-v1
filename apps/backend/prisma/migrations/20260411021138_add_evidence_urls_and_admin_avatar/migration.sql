-- AlterTable
ALTER TABLE "account_risks" ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "avatarUrl" TEXT NOT NULL DEFAULT '';
