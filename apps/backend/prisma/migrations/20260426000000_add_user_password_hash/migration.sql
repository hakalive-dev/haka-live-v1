-- AlterTable: add optional bcrypt password hash to User
-- Used by admin reset-password; verified in devLoginWithHakaId.
ALTER TABLE "users" ADD COLUMN "password" TEXT;
