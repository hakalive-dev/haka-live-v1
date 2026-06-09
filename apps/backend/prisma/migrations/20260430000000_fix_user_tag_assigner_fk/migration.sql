-- Fix user_tags.assignedBy FK: was pointing to users.id (wrong table),
-- should reference admin_users.id since tags are assigned by admin staff.
-- Existing rows whose assignedBy value is not a valid admin_users.id are
-- orphaned data from before this was enforced; delete them to allow the
-- new FK to be added cleanly.

ALTER TABLE "user_tags"
  DROP CONSTRAINT IF EXISTS "user_tags_assignedBy_fkey";

DELETE FROM "user_tags"
  WHERE "assignedBy" NOT IN (SELECT "id" FROM "admin_users");

ALTER TABLE "user_tags"
  ADD CONSTRAINT "user_tags_assignedBy_fkey"
  FOREIGN KEY ("assignedBy")
  REFERENCES "admin_users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
