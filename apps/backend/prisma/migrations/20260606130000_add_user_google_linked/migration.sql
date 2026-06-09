-- Track whether a Google identity is linked via Supabase Auth. Set at login from
-- the Supabase user's app_metadata.providers so the Account Security screen can
-- show Google as auto-linked without a manual bind step.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleLinked" BOOLEAN NOT NULL DEFAULT false;
