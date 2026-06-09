-- Make firebaseUid nullable (new Supabase-only users won't have one)
ALTER TABLE "users" ALTER COLUMN "firebaseUid" DROP NOT NULL;

-- Add supabaseUid column
ALTER TABLE "users" ADD COLUMN "supabaseUid" TEXT;

-- Add unique constraint
ALTER TABLE "users" ADD CONSTRAINT "users_supabaseUid_key" UNIQUE ("supabaseUid");
