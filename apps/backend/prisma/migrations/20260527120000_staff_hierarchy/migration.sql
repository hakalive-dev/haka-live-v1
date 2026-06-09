-- User: denormalized last-live timestamp
ALTER TABLE "users" ADD COLUMN "lastLiveAt" TIMESTAMP(3);

-- AdminUser: staff hierarchy + region + haka id
ALTER TABLE "admin_users" ADD COLUMN "hakaId" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "region" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "managerId" TEXT;
ALTER TABLE "admin_users"
  ADD CONSTRAINT "admin_users_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "admin_users_managerId_idx" ON "admin_users"("managerId");

-- Agency: owning BD + region
ALTER TABLE "agencies" ADD COLUMN "bdId" TEXT;
ALTER TABLE "agencies" ADD COLUMN "region" TEXT;
ALTER TABLE "agencies"
  ADD CONSTRAINT "agencies_bdId_fkey"
  FOREIGN KEY ("bdId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "agencies_bdId_idx" ON "agencies"("bdId");
CREATE INDEX "agencies_region_idx" ON "agencies"("region");

-- Region list
CREATE TABLE "regions" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regions_pkey" PRIMARY KEY ("code")
);

-- Staff targets
CREATE TABLE "staff_targets" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "revenueTarget" BIGINT NOT NULL DEFAULT 0,
  "onboardTarget" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_targets_staffId_period_periodStart_key" ON "staff_targets"("staffId", "period", "periodStart");
CREATE INDEX "staff_targets_staffId_idx" ON "staff_targets"("staffId");
ALTER TABLE "staff_targets"
  ADD CONSTRAINT "staff_targets_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
