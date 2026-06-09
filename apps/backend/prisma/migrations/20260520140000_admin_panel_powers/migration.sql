-- Admin panel powers: retrievable login password snapshot + super admin power flag
ALTER TABLE "users" ADD COLUMN "passwordSnapshot" TEXT NOT NULL DEFAULT '';

ALTER TABLE "user_settings" ADD COLUMN "superAdminPower" BOOLEAN NOT NULL DEFAULT false;
