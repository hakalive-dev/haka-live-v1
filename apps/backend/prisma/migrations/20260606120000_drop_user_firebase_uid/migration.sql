-- Drop legacy Firebase Auth identity column. Auth is now handled by Supabase
-- (supabaseUid) and self-hosted phone OTP; Firebase Admin SDK remains only for FCM push.

-- DropIndex
DROP INDEX "users_firebaseUid_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "firebaseUid";
