-- Add permissionsRevoked to AdminUser for instant security lock.
ALTER TABLE "admin_users"
ADD COLUMN "permissionsRevoked" BOOLEAN NOT NULL DEFAULT false;

