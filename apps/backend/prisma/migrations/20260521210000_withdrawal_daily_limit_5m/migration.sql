-- Raise default daily withdrawal limit to 5M beans (existing DBs with lower value are updated).
INSERT INTO "system_settings" ("id", "key", "value", "updatedBy", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'withdrawal_daily_limit_beans', '5000000'::jsonb, '', NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET
  "value" = '5000000'::jsonb,
  "updatedAt" = NOW();
