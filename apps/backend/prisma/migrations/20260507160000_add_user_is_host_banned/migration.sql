-- Adds the User.isHostBanned flag used by Phase 3 of the realtime ban
-- enforcement plan. Defaults to false so existing rows are unaffected.
DO $$
BEGIN
  -- Most environments use `users` (see @@map("users") in schema.prisma)
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isHostBanned" BOOLEAN NOT NULL DEFAULT false';
    RETURN;
  END IF;

  -- Some legacy DBs may have been created with the default Prisma table name `"User"`
  IF to_regclass('public."User"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isHostBanned" BOOLEAN NOT NULL DEFAULT false';
    RETURN;
  END IF;

  RAISE EXCEPTION 'Neither table "users" nor "User" exists in schema public';
END $$;
