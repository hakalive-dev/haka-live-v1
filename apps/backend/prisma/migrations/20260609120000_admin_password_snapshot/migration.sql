-- Add passwordSnapshot to admin_users for super-admin display of login passwords.
ALTER TABLE "admin_users" ADD COLUMN "passwordSnapshot" TEXT NOT NULL DEFAULT '';
