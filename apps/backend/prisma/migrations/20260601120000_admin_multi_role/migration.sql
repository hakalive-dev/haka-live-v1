-- Allow one staff account (Haka ID) to hold multiple roles.
-- Additive + forward-only: add roles[] and backfill from the existing primary `role`.

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: every existing account gets its current single role as its sole role.
UPDATE "admin_users" SET "roles" = ARRAY["role"] WHERE "roles" = ARRAY[]::TEXT[] OR "roles" IS NULL;
