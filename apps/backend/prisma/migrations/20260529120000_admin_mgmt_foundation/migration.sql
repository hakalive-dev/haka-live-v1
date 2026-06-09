-- Admin user foundation fields (not added by earlier migrations)
ALTER TABLE "admin_users"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "riskLevel" TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "riskNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payoutFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payoutFrozenReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payoutFrozenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Agency foundation fields (hostLimit / withdrawalLimitBeans / deletedAt from 202605281713–714)
ALTER TABLE "agencies"
  ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "riskLevel" TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "riskNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payoutFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payoutFrozenReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payoutFrozenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withdrawalLimitMonthly" BIGINT;

-- Emergency OTP table exists from 20260528160500; add createdById for foundation schema
ALTER TABLE "admin_emergency_otps"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_username_key" ON "admin_users"("username");
